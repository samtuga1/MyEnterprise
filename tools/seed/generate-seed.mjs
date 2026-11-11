#!/usr/bin/env node
// Generates database/06_seed_data.sql by simulating ten months of trading.
//
// Why simulate instead of typing rows? Every number must agree with every other:
// stock on hand = sum of the ledger, reservations = open allocations, payments =
// order totals, refunds <= what was returned. The simulation applies the same
// rules as the stored procedures (reserve at checkout, ship per warehouse,
// restock on return, weekly purchase orders), then writes plain INSERTs.
// The database re-checks everything on import: triggers stay ON, so a seed row
// that broke a rule would fail to load.
//
// Deterministic: the same catalog always produces the same file.
// Usage: node tools/seed/generate-seed.mjs

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'database', '06_seed_data.sql');
const HASH_CACHE = join(HERE, 'password-hashes.json');
const DEMO_PASSWORD = 'password1234';

// ---------------------------------------------------------------- time helpers
// All times are store-local wall-clock values, handled as UTC to avoid DST jumps.
const T = (s) => new Date(s.replace(' ', 'T') + 'Z');
const NOW = T('2026-11-07 14:00:00');
const START = T('2026-01-05 00:00:00');
const OPENING_AT = T('2026-01-02 08:00:00');
const H = 3600e3, D = 24 * H;
const add = (d, ms) => new Date(d.getTime() + ms);
const pad = (n, l = 2) => String(n).padStart(l, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const atHour = (d, h, m = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m));
const dayStart = (d) => atHour(d, 0);
// Work happens 08:00–19:00; push anything outside into the next working window.
// The warehouse works Monday to Friday.
const workHours = (d) => {
  const h = d.getUTCHours();
  let r = h < 8 ? atHour(d, 8, d.getUTCMinutes()) : h >= 19 ? atHour(add(d, D), 8, d.getUTCMinutes()) : d;
  while ([0, 6].includes(r.getUTCDay())) r = atHour(add(r, D), 8, r.getUTCMinutes());
  return r;
};

// ----------------------------------------------------------------- randomness
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261107);
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const chance = (p) => rnd() < p;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const weighted = (items, weightOf) => {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = rnd() * total;
  for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
  return items[items.length - 1];
};
const poisson = (lambda) => { let k = 0, p = 1; const L = Math.exp(-lambda); do { k++; p *= rnd(); } while (p > L); return k - 1; };
const money = (n) => Math.round(n * 100) / 100;
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ------------------------------------------------------------------ master data
const admins = C.ADMINS.map((a, i) => ({ id: i + 1, ...a, createdAt: '2026-01-02 09:00:00' }));
const FULFILLERS = [1, 2, 2, 2]; // Priya (operations) packs most orders

const categories = C.CATEGORIES.map(([name, slug, group, sort], i) => ({ id: i + 1, name, slug, group, sort }));
const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

const SIZE_WEIGHT = (sizes, i) => {
  if (sizes.length === 1) return 1;
  const mid = (sizes.length - 1) / 2;
  return 1.25 - Math.min(0.65, Math.abs(i - mid) * 0.32);
};

const products = [];
const variants = [];
const specs = [];
const warranties = [];
let variantSeq = 0, specSeq = 0;
C.PRODUCTS.forEach((p, pi) => {
  const id = pi + 1;
  const launched = p.launched ? T(p.launched + ' 09:00:00') : T('2026-01-02 09:00:00');
  const product = {
    id, def: p, slug: p.slug, name: p.name, brand: p.brand, adminId: 3, // Marcus (catalog) maintains products
    description: p.description, isActive: p.archived ? 0 : 1, launched,
    archived: p.archived ? T(p.archived + ' 18:00:00') : null,
    variants: [],
  };
  products.push(product);
  p.colors.forEach((color, ci) => {
    p.sizes.forEach((size, si) => {
      const vid = ++variantSeq;
      const sizeCode = size.replace(/^EU /, '').replace(/ cm$/, '').replace('One size', 'OS');
      const v = {
        id: vid, productId: id, product,
        sku: `${C.BRANDS[p.brand]}-${pad(id, 3)}-${color.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${sizeCode}`,
        size, color, hex: C.COLORS[color], sizeIndex: si, sizeWeight: SIZE_WEIGHT(p.sizes, si),
        sortOrder: ci * 20 + si,
        priceAt: (d) => (p.priceChange && d >= T(p.priceChange[0] + ' 00:00:00') ? p.priceChange[1] : p.price),
        price: p.priceChange ? p.priceChange[1] : p.price,
      };
      variants.push(v);
      product.variants.push(v);
      specs.push({ id: ++specSeq, variantId: vid, name: 'Material', value: p.material, unit: null });
      specs.push({ id: ++specSeq, variantId: vid, name: 'Care', value: p.care, unit: null });
      if (p.fit) specs.push({ id: ++specSeq, variantId: vid, name: 'Fit', value: p.fit, unit: null });
      const [mName, mUnit, base, step] = p.measure;
      const mValue = typeof base === 'number' ? String(Math.round((base + step * si) * 10) / 10) : base;
      specs.push({ id: ++specSeq, variantId: vid, name: mName, value: mValue, unit: mUnit });
      const durable = ['shoes', 'outerwear', 'bags', 'accessories'].includes(p.type) && p.warranty >= 12;
      warranties.push({ id: warranties.length + 1, variantId: vid, months: p.warranty, coverage: durable ? C.COVERAGE.durable : C.COVERAGE.clothing });
    });
  });
});
const productBySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
const variantById = new Map(variants.map((v) => [v.id, v]));
const warrantyByVariant = new Map(warranties.map((w) => [w.variantId, w]));
const findVariant = (slug, color, size) => productBySlug[slug].variants.find((v) => v.color === color && v.size === size);

const productCategories = [];
for (const p of products) {
  const d = p.def;
  for (const dep of d.dept) productCategories.push([p.id, catBySlug[dep].id]);
  productCategories.push([p.id, catBySlug[d.type].id]);
  for (const col of d.collections) productCategories.push([p.id, catBySlug[col].id]);
}

// "Style it with": colour-specific pairings between middle sizes.
const middle = (slug, color) => { const vs = productBySlug[slug].variants.filter((v) => v.color === color); return vs[Math.floor((vs.length - 1) / 2)]; };
const PAIRS = [
  ['relaxed-linen-shirt', 'Olive', 'linen-drawstring-trousers', 'Sand', 'PAIRS_WITH'],
  ['relaxed-linen-shirt', 'White', 'straight-leg-jeans', 'Indigo', 'PAIRS_WITH'],
  ['relaxed-linen-shirt', 'Olive', 'canvas-carryall-tote', 'Natural', 'COMPLETES_LOOK'],
  ['ribbed-cotton-tank', 'White', 'pleated-wide-leg-trousers', 'Sand', 'PAIRS_WITH'],
  ['ribbed-cotton-tank', 'Black', 'satin-slip-skirt', 'Champagne', 'PAIRS_WITH'],
  ['everyday-cotton-tee', 'Ivory', 'straight-leg-jeans', 'Indigo', 'PAIRS_WITH'],
  ['everyday-cotton-tee', 'Black', 'everyday-court-sneakers', 'Chalk', 'COMPLETES_LOOK'],
  ['silk-blend-shell-blouse', 'Champagne', 'pleated-wide-leg-trousers', 'Black', 'PAIRS_WITH'],
  ['silk-blend-shell-blouse', 'Navy', 'cropped-wool-blazer', 'Camel', 'LAYERS_WITH'],
  ['soft-knit-cardigan', 'Oat', 'ribbed-cotton-tank', 'White', 'LAYERS_WITH'],
  ['soft-knit-cardigan', 'Charcoal', 'gathered-midi-dress', 'Mustard', 'LAYERS_WITH'],
  ['merino-crew-sweater', 'Burgundy', 'oxford-cotton-shirt', 'White', 'LAYERS_WITH'],
  ['merino-crew-sweater', 'Grey melange', 'slim-stretch-chinos', 'Grey', 'PAIRS_WITH'],
  ['chunky-rib-turtleneck', 'Cream', 'satin-slip-skirt', 'Black', 'PAIRS_WITH'],
  ['chunky-rib-turtleneck', 'Burgundy', 'straight-leg-jeans', 'Washed black', 'PAIRS_WITH'],
  ['gathered-midi-dress', 'Terracotta', 'leather-chelsea-boots', 'Cognac', 'COMPLETES_LOOK'],
  ['gathered-midi-dress', 'Mustard', 'everyday-crossbody-bag', 'Cognac', 'COMPLETES_LOOK'],
  ['wrap-midi-dress', 'Blush', 'suede-penny-loafers', 'Cocoa', 'COMPLETES_LOOK'],
  ['satin-slip-skirt', 'Champagne', 'chunky-rib-turtleneck', 'Cream', 'PAIRS_WITH'],
  ['pleated-wide-leg-trousers', 'Sand', 'silk-blend-shell-blouse', 'Champagne', 'PAIRS_WITH'],
  ['straight-leg-jeans', 'Indigo', 'relaxed-linen-shirt', 'White', 'PAIRS_WITH'],
  ['straight-leg-jeans', 'Washed black', 'leather-chelsea-boots', 'Brown', 'COMPLETES_LOOK'],
  ['linen-drawstring-trousers', 'Sand', 'relaxed-linen-shirt', 'Olive', 'PAIRS_WITH'],
  ['slim-stretch-chinos', 'Khaki', 'oxford-cotton-shirt', 'Light blue', 'PAIRS_WITH'],
  ['slim-stretch-chinos', 'Grey', 'leather-derby-shoes', 'Brown', 'COMPLETES_LOOK'],
  ['selvedge-straight-jeans', 'Raw indigo', 'heavyweight-pocket-tee', 'White', 'PAIRS_WITH'],
  ['everyday-trench-coat', 'Sand', 'straight-leg-jeans', 'Indigo', 'LAYERS_WITH'],
  ['everyday-trench-coat', 'Navy', 'ribbed-knit-scarf', 'Oat', 'COMPLETES_LOOK'],
  ['cropped-wool-blazer', 'Camel', 'pleated-wide-leg-trousers', 'Black', 'PAIRS_WITH'],
  ['quilted-weekend-jacket', 'Navy', 'merino-crew-sweater', 'Grey melange', 'LAYERS_WITH'],
  ['wool-overcoat', 'Charcoal', 'merino-crew-sweater', 'Burgundy', 'LAYERS_WITH'],
  ['wool-overcoat', 'Camel', 'leather-derby-shoes', 'Black', 'COMPLETES_LOOK'],
  ['hooded-rain-jacket', 'Yellow', 'weekend-walking-sneakers', 'Stone', 'COMPLETES_LOOK'],
  ['oxford-cotton-shirt', 'White', 'slim-stretch-chinos', 'Khaki', 'PAIRS_WITH'],
  ['heavyweight-pocket-tee', 'Grey melange', 'linen-drawstring-trousers', 'Black', 'PAIRS_WITH'],
  ['everyday-court-sneakers', 'Chalk', 'everyday-cotton-tee', 'Ivory', 'COMPLETES_LOOK'],
  ['leather-chelsea-boots', 'Brown', 'everyday-trench-coat', 'Sand', 'COMPLETES_LOOK'],
  ['leather-derby-shoes', 'Brown', 'leather-belt', 'Tan', 'COMPLETES_LOOK'],
  ['canvas-carryall-tote', 'Black', 'everyday-cotton-tee', 'Black', 'COMPLETES_LOOK'],
  ['everyday-crossbody-bag', 'Cognac', 'gathered-midi-dress', 'Terracotta', 'COMPLETES_LOOK'],
  ['ribbed-knit-scarf', 'Rust', 'ribbed-wool-beanie', 'Red', 'COMPLETES_LOOK'],
  ['ribbed-wool-beanie', 'Charcoal', 'hooded-rain-jacket', 'Navy', 'COMPLETES_LOOK'],
];
const rules = PAIRS.map(([s, sc, t, tc, type], i) => ({ id: i + 1, source: middle(s, sc).id, target: middle(t, tc).id, type }));

const warehouses = C.WAREHOUSES.map((w, i) => ({ id: i + 1, ...w }));

// Supplier price list: every variant gets one or two offers.
const suppliers = C.SUPPLIERS.map((s, i) => ({ id: i + 1, ...s }));
const offers = [];
for (const v of variants) {
  const p = v.product.def;
  const able = suppliers.filter((s) => s.brands.includes(p.brand) && (!s.types || s.types.includes(p.type)));
  const chosen = able.length ? able.slice(0, 2) : [suppliers[1]];
  chosen.forEach((s, k) => {
    const jitter = 1 + ((v.product.id * 7 + k * 13) % 9 - 4) / 100; // ±4%, stable per product
    offers.push({
      supplierId: s.id, variantId: v.id,
      cost: money(p.price * s.ratio * jitter),
      lead: Math.max(5, s.lead + ((v.product.id + k * 3) % 7) - 3),
      moq: s.moq,
    });
  });
}
const offersByVariant = new Map();
for (const o of offers) { if (!offersByVariant.has(o.variantId)) offersByVariant.set(o.variantId, []); offersByVariant.get(o.variantId).push(o); }
const bestOffer = (vid) => [...offersByVariant.get(vid)].sort((a, b) => a.cost - b.cost || a.lead - b.lead)[0];

// ---------------------------------------------------------------- customers
const PHONE_AREAS = ['312', '773', '512', '214', '718', '206', '404', '415', '651', '303', '503', '504', '617', '215', '614', '816', '480', '843'];
const customers = C.CUSTOMER_NAMES.map(([first, last], i) => {
  const id = i + 1;
  const addr = C.ADDRESSES[i % C.ADDRESSES.length];
  const created = id === 1 ? T('2026-01-08 19:12:00')
    : add(START, Math.floor(Math.pow(rnd(), 1.4) * (NOW - START - 4 * D)) + int(9, 21) * H - START.getUTCHours() * H);
  return {
    id, first, last,
    email: id === 1 ? 'demo@gmail.com' : `${slugify(first)}.${slugify(last)}@example.com`,
    phone: chance(0.8) ? `(${PHONE_AREAS[i % PHONE_AREAS.length]}) 555-01${pad(int(0, 99))}` : null,
    createdAt: created,
    address: { line1: `${int(12, 980)} ${addr[0]}`, city: addr[1], region: addr[2], postal: addr[3] },
    weight: id === 1 ? 0 : Math.pow(rnd(), 1.8) * 2.6 + 0.3, // a few loyal shoppers, a long tail
  };
});

// ------------------------------------------------------------------ inventory
const inv = new Map(); // `${w}:${v}` -> { onHand, reserved, par, reorder }
const key = (w, v) => `${w}:${v}`;
const stock = (w, v) => inv.get(key(w, v));
const ensureRow = (w, v) => { if (!inv.has(key(w, v))) inv.set(key(w, v), { onHand: 0, reserved: 0, par: 0, reorder: 2 }); return stock(w, v); };
const movements = [];
let movementSeq = 0;
const move = (w, v, change, reason, at, reference) => {
  const row = ensureRow(w, v);
  row.onHand += change;
  if (row.onHand < row.reserved || row.onHand < 0) throw new Error(`stock below reserved ${w}:${v} at ${fmt(at)}`);
  movements.push({ seq: ++movementSeq, w, v, change, reason, at, reference });
};
const availableTotal = (vid) => warehouses.reduce((s, w) => { const r = stock(w.id, vid); return s + (r ? r.onHand - r.reserved : 0); }, 0);

for (const v of variants) {
  const pop = v.product.def.pop;
  const total = Math.max(3, Math.round((pop * 2 + 3) * v.sizeWeight * (v.product.def.colors.length > 2 ? 0.8 : 1)));
  for (const w of warehouses) {
    const par = Math.round(total * w.share * (0.85 + rnd() * 0.3));
    if (par <= 0) continue;
    const row = ensureRow(w.id, v.id);
    row.par = par;
    row.reorder = Math.max(2, Math.round(par * 0.25));
    if (v.product.launched <= OPENING_AT) move(w.id, v.id, par, 'OPENING_BALANCE', OPENING_AT, 'OPEN-2026');
  }
}

// ------------------------------------------------------------- event queue
const queue = [];
let eventSeq = 0;
const schedule = (at, type, data) => { queue.push({ at, seq: ++eventSeq, type, data }); };
const popNext = () => {
  let best = -1;
  for (let i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (best < 0 || e.at < queue[best].at || (+e.at === +queue[best].at && e.seq < queue[best].seq)) best = i;
  }
  return best < 0 ? null : queue.splice(best, 1)[0];
};

// ------------------------------------------------------------- procurement
const purchaseOrders = [];
let poItemSeq = 0;
const incoming = new Map(); // key -> units ordered but not received
const createPO = (supplierId, warehouseId, lines, orderedAt, { receiveAt = null, cancelAt = null } = {}) => {
  const po = { id: purchaseOrders.length + 1, supplierId, warehouseId, status: 'ORDERED', orderedAt, receivedAt: null, items: [] };
  for (const l of lines) {
    po.items.push({ id: ++poItemSeq, variantId: l.variantId, qty: l.qty, cost: l.cost });
    incoming.set(key(warehouseId, l.variantId), (incoming.get(key(warehouseId, l.variantId)) || 0) + l.qty);
  }
  purchaseOrders.push(po);
  if (cancelAt) schedule(cancelAt, 'poCancel', po);
  else if (receiveAt) schedule(receiveAt, 'poReceive', po);
  return po;
};

// New products arrive by purchase order on their launch day.
for (const p of products.filter((x) => x.launched > OPENING_AT)) {
  for (const w of warehouses) {
    const bySupplier = new Map();
    for (const v of p.variants) {
      const row = stock(w.id, v.id);
      if (!row || row.par <= 0) continue;
      const o = bestOffer(v.id);
      if (!bySupplier.has(o.supplierId)) bySupplier.set(o.supplierId, []);
      bySupplier.get(o.supplierId).push({ variantId: v.id, qty: Math.max(row.par, 4), cost: o.cost });
    }
    for (const [sid, lines] of bySupplier) {
      const lead = Math.max(...lines.map((l) => offersByVariant.get(l.variantId).find((o) => o.supplierId === sid).lead));
      createPO(sid, w.id, lines, atHour(add(p.launched, -(lead + 2) * D), 10), { receiveAt: add(p.launched, -H) });
    }
  }
}

// Weekly purchasing run: refill anything at or under its reorder level.
let cancelledOnePO = false;
const procurementRun = (at) => {
  for (const w of warehouses) {
    const bySupplier = new Map();
    for (const v of variants) {
      const p = v.product;
      if (p.launched > at || (p.archived && p.archived <= add(at, 30 * D))) continue;
      const row = stock(w.id, v.id);
      if (!row || row.par <= 0) continue;
      const projected = row.onHand - row.reserved + (incoming.get(key(w.id, v.id)) || 0);
      if (projected > row.reorder) continue;
      const o = bestOffer(v.id);
      const qty = Math.max(o.moq, row.par - projected + Math.round(row.par * 0.2));
      if (!bySupplier.has(o.supplierId)) bySupplier.set(o.supplierId, []);
      bySupplier.get(o.supplierId).push({ variantId: v.id, qty, cost: o.cost, lead: o.lead });
    }
    for (const [sid, lines] of bySupplier) {
      const lead = Math.max(...lines.map((l) => l.lead));
      const late = chance(0.3) ? int(1, 6) : int(-2, 1); // suppliers are not always on time
      const receiveAt = atHour(add(at, (lead + late) * D), 10, int(0, 50));
      if (!cancelledOnePO && at > T('2026-05-01 00:00:00') && sid === 6) {
        cancelledOnePO = true; // a supplier could not deliver; purchasing cancelled the order
        createPO(sid, w.id, lines, at, { cancelAt: add(at, 9 * D) });
      } else {
        createPO(sid, w.id, lines, at, { receiveAt });
      }
    }
  }
};
for (let d = atHour(START, 8); d < NOW; d = add(d, 7 * D)) schedule(d, 'procure', null);

// Quarterly stock counts: small corrections and damaged items written off.
for (const at of [T('2026-03-31 17:00:00'), T('2026-06-30 17:00:00'), T('2026-09-30 17:00:00')]) schedule(at, 'stockCount', null);

// ------------------------------------------------------------------ orders
const orders = [];
let orderItemSeq = 0, allocationSeq = 0, shipmentSeq = 0, paymentSeq = 0, txSeq = 0, fulfillmentSeq = 0;
const transactions = [];
const cancellations = [];
const returns = [];
let returnItemSeq = 0;
const refunds = [];
const claims = [];

const sellable = (p, at) => p.launched <= at && (!p.archived || p.archived > at);

const placeOrder = (customer, at, lines, opts = {}) => {
  // Resolve lines against current stock: if a size is gone, try the neighbouring size.
  const chosen = [];
  for (const l of lines.sort((a, b) => a.variant.id - b.variant.id)) {
    let v = l.variant;
    if (availableTotal(v.id) < l.qty) {
      if (opts.forced) throw new Error(`forced order lacks stock for ${v.sku}`);
      const alt = v.product.variants.filter((x) => x.color === v.color && Math.abs(x.sizeIndex - v.sizeIndex) === 1 && availableTotal(x.id) >= l.qty);
      if (!alt.length) continue;
      v = alt[0];
    }
    if (chosen.some((c) => c.variant.id === v.id)) continue;
    chosen.push({ variant: v, qty: l.qty });
  }
  if (!chosen.length) return null;
  chosen.sort((a, b) => a.variant.id - b.variant.id);

  const id = orders.length + 1;
  const express = opts.express ?? chance(0.18);
  const order = {
    id, number: `ME-${10000 + id}`, customer, placedAt: at, status: 'PLACED',
    delivery: express ? 'EXPRESS' : 'STANDARD', items: [], allocations: [], shipments: [],
    ship: { recipient: `${customer.first} ${customer.last}`, ...customer.address, country: 'US' },
    fulfillment: { id: ++fulfillmentSeq, adminId: null, status: 'PENDING', createdAt: at },
  };
  let subtotal = 0;
  for (const c of chosen) {
    const price = c.variant.priceAt(at);
    const item = { id: ++orderItemSeq, variant: c.variant, qty: c.qty, price };
    order.items.push(item);
    subtotal += price * c.qty;
    let remaining = c.qty;
    while (remaining > 0) {
      const used = new Set(order.allocations.map((a) => a.w));
      const options = warehouses.map((w) => ({ w: w.id, avail: (stock(w.id, c.variant.id)?.onHand ?? 0) - (stock(w.id, c.variant.id)?.reserved ?? 0) }))
        .filter((o) => o.avail > 0)
        .sort((a, b) => (used.has(b.w) - used.has(a.w)) || ((b.avail >= remaining) - (a.avail >= remaining)) || (b.avail - a.avail) || (a.w - b.w));
      const o = options[0];
      const take = Math.min(o.avail, remaining);
      stock(o.w, c.variant.id).reserved += take;
      order.allocations.push({ id: ++allocationSeq, item, w: o.w, qty: take, status: 'RESERVED', shipment: null });
      remaining -= take;
    }
  }
  order.fee = order.delivery === 'EXPRESS' ? 18 : subtotal >= 150 ? 0 : 6;
  order.total = money(subtotal + order.fee);
  order.payment = { id: ++paymentSeq, amount: order.total, status: 'CAPTURED', method: weighted([['CARD', 70], ['PAYPAL', 18], ['APPLE_PAY', 12]], (x) => x[1])[0], createdAt: at };
  transactions.push({ id: ++txSeq, paymentId: order.payment.id, type: 'CAPTURE', amount: order.total, status: 'SUCCESS', reference: `SIM-CAP-${order.payment.id}`, at });
  orders.push(order);

  // Lifecycle. Decide now; the queue applies each step at its time.
  const plan = opts.plan || {};
  const startAt = plan.startAt || workHours(add(at, between(1.5, 16) * H));
  const cancelRoll = opts.forced ? (plan.cancel || null) : (chance(0.055) ? (chance(0.6) ? 'CUSTOMER' : 'ADMIN') : null);
  if (cancelRoll === 'CUSTOMER') {
    schedule(plan.cancelAt || add(at, between(0.2, 1.2) * H), 'cancel', { order, by: 'CUSTOMER', reason: pick(['Ordered the wrong size.', 'Found a colour I prefer.', 'Ordered twice by mistake.', 'Changed my mind.']) });
  } else {
    schedule(startAt, 'start', { order, adminId: pick(FULFILLERS) });
    if (cancelRoll === 'ADMIN') {
      schedule(add(startAt, between(0.5, 3) * H), 'cancel', { order, by: 'ADMIN', reason: pick(['Delivery address could not be verified.', 'Customer asked support to cancel before packing.', 'Payment flagged in fraud review.']) });
    } else {
      const shipAt = plan.shipAt || workHours(add(startAt, (order.delivery === 'EXPRESS' ? between(0.5, 4) : between(3, 26)) * H));
      schedule(shipAt, 'ship', { order, carrier: order.delivery === 'EXPRESS' ? 'FedEx' : weighted([['UPS', 55], ['USPS', 30], ['FedEx', 15]], (x) => x[1])[0], plan });
    }
  }
  return order;
};

const ship = (order, at, carrier, plan) => {
  if (order.status === 'CANCELLED') return;
  const byWarehouse = new Map();
  for (const a of order.allocations.filter((x) => x.status === 'RESERVED')) {
    if (!byWarehouse.has(a.w)) byWarehouse.set(a.w, []);
    byWarehouse.get(a.w).push(a);
  }
  for (const [w, allocs] of [...byWarehouse].sort((a, b) => a[0] - b[0])) {
    const s = { id: ++shipmentSeq, w, carrier, shippedAt: at, deliveredAt: null, status: 'IN_TRANSIT' };
    s.tracking = `${carrier.slice(0, 3).toUpperCase()}-${pad(s.id, 9)}`;
    order.shipments.push(s);
    for (const a of allocs) {
      stock(w, a.item.variant.id).reserved -= a.qty;
      move(w, a.item.variant.id, -a.qty, 'SALE_SHIPMENT', at, order.number);
      a.status = 'SHIPPED';
      a.shipment = s;
    }
    const transitDays = order.delivery === 'EXPRESS' ? between(0.8, 1.6) : between(2, 4.5) + (w === 3 ? 0.6 : 0);
    const deliverAt = plan?.deliverAt || atHour(add(at, transitDays * D), int(10, 18), int(0, 59));
    schedule(deliverAt, 'deliver', { order, shipment: s });
  }
  order.status = 'SHIPPED';
  order.fulfillment.status = 'SHIPPED';
  order.fulfillment.adminId ??= pick(FULFILLERS);
};

const cancel = (order, at, by, reason) => {
  if (!['PLACED', 'PROCESSING'].includes(order.status)) return;
  if (by === 'CUSTOMER' && order.status !== 'PLACED') return;
  for (const a of order.allocations.filter((x) => x.status === 'RESERVED')) {
    stock(a.w, a.item.variant.id).reserved -= a.qty;
    a.status = 'RELEASED';
  }
  const adminId = by === 'ADMIN' ? (order.fulfillment.adminId || 4) : null;
  cancellations.push({ id: cancellations.length + 1, order, adminId, by, reason, at });
  transactions.push({ id: ++txSeq, paymentId: order.payment.id, type: 'REFUND', amount: order.total, status: 'SUCCESS', reference: `SIM-RFD-C${order.payment.id}`, at: add(at, 2 * 60e3) });
  order.payment.status = 'REFUNDED';
  order.fulfillment.status = 'CANCELLED';
  order.status = 'CANCELLED';
  order.cancelledAt = at;
};

const deliveredAtOf = (order, item) => {
  const ds = order.allocations.filter((a) => a.item === item && a.shipment?.deliveredAt).map((a) => a.shipment.deliveredAt);
  return ds.length ? new Date(Math.max(...ds)) : null;
};

const onDelivered = (order, at) => {
  // After-sales are decided when the last parcel arrives.
  const plan = order.plan || {};
  if (plan.returnLine !== undefined || (plan.returnLine === undefined && !plan.noReturn && chance(0.13))) {
    const lines = plan.returnLine !== undefined ? [order.items[plan.returnLine]]
      : (order.items.length > 1 && chance(0.25) ? order.items.slice(0, 2) : [pick(order.items)]);
    const requestedAt = plan.returnAt || atHour(add(at, between(2, 25) * D), int(8, 22), int(0, 59));
    if (requestedAt < NOW) {
      const reason = plan.returnReason || weighted(C.RETURN_REASONS, (x) => x[1])[0];
      schedule(requestedAt, 'returnRequest', { order, lines, reason, plan });
    }
  }
  for (const item of order.items) {
    const w = warrantyByVariant.get(item.variant.id);
    const forced = plan.claimLine !== undefined && order.items[plan.claimLine] === item;
    const type = item.variant.product.def.type;
    const p = forced ? 1 : ['shoes', 'outerwear', 'bags'].includes(type) ? 0.08 : 0.015;
    if (!forced && !chance(p)) continue;
    const maxDays = Math.min(w.months * 30 - 2, 210);
    const submittedAt = plan.claimAt && forced ? plan.claimAt : atHour(add(at, between(18, maxDays) * D), int(8, 21), int(0, 59));
    if (submittedAt >= NOW) continue;
    schedule(submittedAt, 'claim', { order, item, warranty: w, forced: forced ? plan : null });
  }
};

// -------------------------------------------- the demo shopper (demo@gmail.com)
// Scripted so every customer journey can be shown live: a delivered order still
// inside its return window, one in transit, one that can still be cancelled,
// a refunded return and an open quality claim.
const demo = customers[0];
const demoOrders = [
  { at: '2026-02-14 11:20:00', lines: [['everyday-trench-coat', 'Sand', 'M', 1], ['leather-belt', 'Tan', '85 cm', 1]],
    plan: { noReturn: true, claimLine: 0, claimAt: T('2026-09-02 18:40:00'), claimStatus: 'APPROVED', claimReason: 'A seam at the shoulder has opened.' } },
  { at: '2026-05-20 20:05:00', lines: [['gathered-midi-dress', 'Terracotta', 'S', 1], ['ribbed-cotton-tank', 'White', 'S', 1]],
    plan: { returnLine: 0, returnAt: T('2026-05-31 09:30:00'), returnReason: 'Too large', returnOutcome: 'REFUNDED' } },
  { at: '2026-09-12 13:45:00', lines: [['everyday-court-sneakers', 'Chalk', 'EU 39', 1]], plan: { noReturn: true } },
  { at: '2026-10-22 19:10:00', lines: [['relaxed-linen-shirt', 'Olive', 'M', 1], ['straight-leg-jeans', 'Indigo', 'W28', 1]],
    plan: { noReturn: true, deliverAt: T('2026-10-26 14:20:00') } },
  { at: '2026-11-03 21:30:00', lines: [['chunky-rib-turtleneck', 'Cream', 'M', 1]],
    plan: { noReturn: true, startAt: T('2026-11-04 09:15:00'), shipAt: T('2026-11-05 15:40:00'), deliverAt: T('2026-11-09 13:00:00') } },
  { at: '2026-11-06 20:50:00', lines: [['ribbed-wool-beanie', 'Red', 'One size', 1], ['soft-knit-cardigan', 'Oat', 'S', 1]],
    plan: { noReturn: true, cancel: null, startAt: T('2026-11-08 09:30:00') }, express: false },
];
for (const d of demoOrders) schedule(T(d.at), 'demoOrder', d);

// ---------------------------------------------------------------- run
const totalDays = (NOW - START) / D;
for (let day = 0; day < totalDays; day++) {
  const d = add(START, day * D);
  const growth = 0.5 + 1.15 * (day / totalDays);
  const month = d.getUTCMonth();
  const season = month === 4 ? 1.25 : month === 10 ? 1.35 : month === 7 ? 0.85 : 1; // May sale, November, August lull
  const weekend = [0, 6].includes(d.getUTCDay()) ? 1.2 : 1;
  const launchWeekend = NOW - d <= 3 * D ? 2.6 : 1; // autumn launch emails went out on Nov 5
  const n = poisson(growth * season * weekend * launchWeekend);
  for (let k = 0; k < n; k++) schedule(atHour(d, int(7, 23), int(0, 59)), 'randomOrder', null);
}

let event;
while ((event = popNext())) {
  const { at, type, data } = event;
  if (at >= NOW) continue; // the future has not happened yet
  switch (type) {
    case 'randomOrder': {
      const pool = customers.filter((c) => c.weight > 0 && c.createdAt < at);
      if (!pool.length) break;
      const customer = weighted(pool, (c) => c.weight);
      const sellableProducts = products.filter((p) => sellable(p, at));
      const nLines = weighted([[1, 55], [2, 30], [3, 12], [4, 3]], (x) => x[1])[0];
      const lines = [];
      for (let i = 0; i < nLines; i++) {
        const p = weighted(sellableProducts, (x) => x.def.pop * (x.def.launched && at - x.launched < 21 * D ? 2.5 : 1));
        const color = pick(p.def.colors);
        const v = weighted(p.variants.filter((x) => x.color === color), (x) => x.sizeWeight);
        lines.push({ variant: v, qty: chance(0.08) ? 2 : 1 });
      }
      placeOrder(customer, at, lines);
      break;
    }
    case 'demoOrder': {
      const lines = data.lines.map(([slug, color, size, qty]) => ({ variant: findVariant(slug, color, size), qty }));
      const o = placeOrder(demo, at, lines, { forced: true, express: data.express ?? false, plan: data.plan });
      o.plan = data.plan;
      break;
    }
    case 'start':
      if (data.order.status === 'PLACED') {
        data.order.status = 'PROCESSING';
        data.order.fulfillment.status = 'PROCESSING';
        data.order.fulfillment.adminId = data.adminId;
      }
      break;
    case 'ship':
      ship(data.order, at, data.carrier, data.plan);
      break;
    case 'deliver': {
      const { order, shipment } = data;
      shipment.status = 'DELIVERED';
      shipment.deliveredAt = at;
      if (order.shipments.every((s) => s.status === 'DELIVERED') && !order.allocations.some((a) => a.status === 'RESERVED')) {
        order.status = 'DELIVERED';
        order.fulfillment.status = 'COMPLETED';
        order.deliveredAt = at;
        onDelivered(order, at);
      }
      break;
    }
    case 'cancel':
      cancel(data.order, at, data.by, data.reason);
      break;
    case 'returnRequest': {
      const { order, lines, reason, plan } = data;
      const items = [];
      for (const item of lines) {
        const delivered = deliveredAtOf(order, item);
        if (!delivered || at > add(delivered, 30 * D)) continue;
        const already = returns.filter((r) => r.order === order && r.status !== 'REJECTED').flatMap((r) => r.items).filter((ri) => ri.item === item).reduce((s, ri) => s + ri.qty, 0);
        const qty = Math.min(item.qty - already, chance(0.7) ? 1 : item.qty);
        if (qty > 0) items.push({ id: ++returnItemSeq, item, qty });
      }
      if (!items.length) break;
      const r = { id: returns.length + 1, order, customer: order.customer, status: 'REQUESTED', reason, requestedAt: at, resolvedAt: null, items, damaged: reason === 'Arrived damaged' };
      returns.push(r);
      const outcome = plan?.returnOutcome || (chance(0.9) ? 'APPROVED' : 'REJECTED');
      schedule(workHours(add(at, between(20, 96) * H)), 'returnReview', { r, outcome });
      break;
    }
    case 'returnReview': {
      const { r, outcome } = data;
      if (outcome === 'REJECTED') { r.status = 'REJECTED'; r.resolvedAt = at; r.rejection = true; break; }
      r.status = 'APPROVED';
      schedule(workHours(add(at, between(3, 9) * D)), 'returnRefund', { r });
      break;
    }
    case 'returnRefund': {
      const { r } = data;
      for (const ri of r.items) {
        if (!r.damaged) {
          const w = Math.min(...r.order.allocations.filter((a) => a.item === ri.item && a.status === 'SHIPPED').map((a) => a.w));
          move(w, ri.item.variant.id, ri.qty, 'RETURN_RESTOCK', at, `RMA-${r.id}`);
        }
        const amount = money(ri.qty * ri.item.price);
        const tx = { id: ++txSeq, paymentId: r.order.payment.id, type: 'REFUND', amount, status: 'SUCCESS', reference: `SIM-RFD-R${ri.id}`, at };
        transactions.push(tx);
        refunds.push({ id: refunds.length + 1, returnItemId: ri.id, txId: tx.id, amount, status: 'COMPLETED', at });
      }
      const refunded = transactions.filter((t) => t.paymentId === r.order.payment.id && t.type === 'REFUND').reduce((s, t) => s + t.amount, 0);
      r.order.payment.status = refunded >= r.order.payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      r.status = 'REFUNDED';
      r.resolvedAt = at;
      break;
    }
    case 'claim': {
      const { order, item, warranty, forced } = data;
      if (claims.some((c) => c.item === item)) break;
      const returned = returns.filter((r) => r.order === order && r.status !== 'REJECTED').flatMap((r) => r.items).filter((ri) => ri.item === item).reduce((s, ri) => s + ri.qty, 0);
      if (returned >= item.qty) break;
      const type = item.variant.product.def.type;
      const reason = forced?.claimReason || pick(C.CLAIM_REASONS[type] || C.CLAIM_REASONS.clothing);
      const age = (NOW - at) / D;
      let status = forced?.claimStatus || (age > 30 ? (chance(0.7) ? 'RESOLVED' : 'REJECTED') : age > 12 ? 'APPROVED' : 'SUBMITTED');
      const resolvedAt = ['RESOLVED', 'REJECTED'].includes(status) ? workHours(add(at, between(3, 14) * D)) : null;
      const resolution = status === 'RESOLVED' ? pick(['Replacement sent.', 'Repaired by our partner workshop.', 'Refund issued as store credit.'])
        : status === 'REJECTED' ? pick(['Wear and tear is not covered by the guarantee.', 'Damage caused by incorrect care.']) : null;
      claims.push({ id: claims.length + 1, warranty, item, reason, status, submittedAt: at, resolution, resolvedAt });
      break;
    }
    case 'procure':
      procurementRun(at);
      break;
    case 'poReceive': {
      const po = data;
      for (const it of po.items) {
        move(po.warehouseId, it.variantId, it.qty, 'PURCHASE_RECEIPT', at, `PO-${po.id}`);
        const row = stock(po.warehouseId, it.variantId);
        if (row.par <= 0) { row.par = it.qty; row.reorder = Math.max(2, Math.round(it.qty * 0.25)); }
        incoming.set(key(po.warehouseId, it.variantId), incoming.get(key(po.warehouseId, it.variantId)) - it.qty);
      }
      po.status = 'RECEIVED';
      po.receivedAt = at;
      break;
    }
    case 'poCancel': {
      const po = data;
      for (const it of po.items) incoming.set(key(po.warehouseId, it.variantId), incoming.get(key(po.warehouseId, it.variantId)) - it.qty);
      po.status = 'CANCELLED';
      break;
    }
    case 'stockCount': {
      const ref = `COUNT-${fmt(at).slice(0, 7)}`;
      const rows = [...inv.entries()].filter(([, r]) => r.onHand - r.reserved >= 2);
      for (let i = 0; i < 4; i++) {
        const [k] = pick(rows); const [w, v] = k.split(':').map(Number);
        move(w, v, chance(0.5) ? 1 : -1, 'ADJUSTMENT', add(at, i * 60e3), ref);
      }
      for (let i = 0; i < 2; i++) {
        const [k] = pick(rows); const [w, v] = k.split(':').map(Number);
        if (stock(w, v).onHand - stock(w, v).reserved >= 1) move(w, v, -1, 'DAMAGE_WRITE_OFF', add(at, (5 + i) * 60e3), ref);
      }
      break;
    }
    default:
      throw new Error('unknown event ' + type);
  }
}

// POs whose receipt lies in the future stay ORDERED (open) — the receive event was skipped above.

// A review queue for the admin demo: recent returns and claims that staff have
// not handled yet. Open requests move no stock or money, so they are added
// directly; the triggers still validate them on import.
{
  const recent = orders
    .filter((o) => o.status === 'DELIVERED' && o.customer.id !== 1 && NOW - o.deliveredAt > 4 * D && NOW - o.deliveredAt < 20 * D && !returns.some((r) => r.order === o))
    .sort((a, b) => b.deliveredAt - a.deliveredAt);
  [['REQUESTED', 'Too small'], ['REQUESTED', 'Colour differs from the photos'], ['APPROVED', 'Too large']].forEach(([status, reason], i) => {
    const o = recent[i * 2];
    if (!o) return;
    const item = o.items[0];
    const requestedAt = atHour(add(NOW, -(i + 1) * D), 10 + i, 15);
    if (requestedAt <= deliveredAtOf(o, item) || requestedAt > add(deliveredAtOf(o, item), 29 * D)) return;
    returns.push({ id: returns.length + 1, order: o, customer: o.customer, status, reason, requestedAt, resolvedAt: null, items: [{ id: ++returnItemSeq, item, qty: 1 }] });
  });
  const claimable = orders
    .filter((o) => o.status === 'DELIVERED' && o.customer.id !== 1)
    .flatMap((o) => o.items.map((item) => ({ o, item, delivered: deliveredAtOf(o, item) })))
    .filter(({ o, item, delivered }) => ['shoes', 'outerwear', 'bags'].includes(item.variant.product.def.type)
      && !claims.some((c) => c.item === item)
      && !returns.some((r) => r.order === o && r.items.some((ri) => ri.item === item))
      && NOW - delivered > 25 * D && NOW - delivered < 300 * D);
  for (let i = 0; i < 2 && claimable.length; i++) {
    const { item } = claimable.splice(Math.floor(claimable.length * (i ? 0.3 : 0.7)), 1)[0];
    const type = item.variant.product.def.type;
    claims.push({ id: claims.length + 1, warranty: warrantyByVariant.get(item.variant.id), item, reason: C.CLAIM_REASONS[type][i % C.CLAIM_REASONS[type].length],
      status: 'SUBMITTED', submittedAt: atHour(add(NOW, -(i * 2 + 1) * D), 16 + i, 20), resolution: null, resolvedAt: null });
  }
}

// ------------------------------------------------------------------- carts
const carts = [];
let cartItemSeq = 0;
const cartFor = (customer, status, updatedAt, lines) => {
  const cart = { id: carts.length + 1, customer, status, createdAt: add(updatedAt, -between(0.2, 3) * D), updatedAt, items: [] };
  for (const [v, qty] of lines) {
    if (cart.items.some((i) => i.variant === v)) continue;
    cart.items.push({ id: ++cartItemSeq, variant: v, qty, price: v.price, addedAt: cart.createdAt });
  }
  carts.push(cart);
};
cartFor(demo, 'ACTIVE', T('2026-11-06 21:05:00'), [[findVariant('cropped-wool-blazer', 'Camel', 'S'), 1], [findVariant('leather-chelsea-boots', 'Brown', 'EU 38'), 1]]);
const activeProducts = products.filter((p) => p.isActive);
const randomLines = () => Array.from({ length: int(1, 3) }, () => { const p = pick(activeProducts); return [pick(p.variants), 1]; });
for (const c of customers.slice(1).filter(() => chance(0.2)).slice(0, 7)) cartFor(c, 'ACTIVE', add(NOW, -between(0.1, 9) * D), randomLines());
for (const c of customers.slice(1).filter(() => chance(0.3)).slice(0, 10)) cartFor(c, 'ABANDONED', add(NOW, -between(20, 200) * D), randomLines());

// -------------------------------------------------------------- password hashes
const accounts = [...admins.map((a) => a.email), ...customers.map((c) => c.email)];
let hashes = existsSync(HASH_CACHE) ? JSON.parse(readFileSync(HASH_CACHE, 'utf8')) : {};
const missing = accounts.filter((e) => !hashes[e]);
if (missing.length) {
  const php = 'echo json_encode(array_map(fn($p) => password_hash($p, PASSWORD_BCRYPT, ["cost" => 10]), json_decode(stream_get_contents(STDIN), true)));';
  const input = JSON.stringify(Object.fromEntries(missing.map((e) => [e, DEMO_PASSWORD])));
  const out = JSON.parse(execFileSync('php', ['-r', php], { input }).toString());
  hashes = { ...hashes, ...out };
  writeFileSync(HASH_CACHE, JSON.stringify(hashes, null, 2) + '\n');
}

// ------------------------------------------------------------------ SQL output
const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${fmt(v)}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
};
const out = [];
const section = (title) => out.push('', `-- ${'-'.repeat(77)}`, `-- ${title}`, `-- ${'-'.repeat(77)}`);
const insert = (table, cols, rows, chunk = 150) => {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES`);
    out.push(part.map((r) => `  (${r.map(q).join(', ')})`).join(',\n') + ';');
  }
};

const ordersSorted = orders;
const allAllocations = orders.flatMap((o) => o.allocations.map((a) => ({ ...a, order: o })));
const allShipments = orders.flatMap((o) => o.shipments.map((s) => ({ ...s, order: o })));
movements.sort((a, b) => a.at - b.at || a.seq - b.seq);
transactions.sort((a, b) => a.id - b.id);

out.push(
  '-- =============================================================================',
  '-- MyEnterprise — File 06: sample data (generated — do not edit by hand)',
  '-- -----------------------------------------------------------------------------',
  '-- Produced by tools/seed/generate-seed.mjs, which simulates trading from',
  `-- ${fmt(START).slice(0, 10)} to ${fmt(NOW)}. Regenerate with: npm run seed`,
  '--',
  '-- Triggers stay ON while this loads, so the database re-validates the history:',
  '-- stock is built from the StockMovement ledger by trigger T1, and every return',
  '-- line (T2), refund (T3), allocation (T4) and warranty claim (T5) is checked.',
  '--',
  `-- Every account's password is: ${DEMO_PASSWORD}   (fictional sample data only)`,
  '--   Customer sign-in:  demo@gmail.com',
  '--   Admin sign-in:     demo@gmail.com  (at /admin)',
  '-- =============================================================================',
  '',
  'USE myenterprise;',
  'SET NAMES utf8mb4;',
  'START TRANSACTION;',
);

section('Core');
insert('Admin', ['admin_id', 'email', 'role', 'fullName', 'password_hash', 'isActive', 'createdAt'],
  admins.map((a) => [a.id, a.email, a.role, a.fullName, hashes[a.email], 1, a.createdAt]));
insert('Customer', ['customer_id', 'email', 'firstName', 'lastName', 'phone', 'password_hash', 'createdAt'],
  customers.map((c) => [c.id, c.email, c.first, c.last, c.phone, hashes[c.email], c.createdAt]));

section('Catalog');
insert('Category', ['category_id', 'category_name', 'slug', 'category_group', 'sortOrder'], categories.map((c) => [c.id, c.name, c.slug, c.group, c.sort]));
insert('Product', ['product_id', 'admin_id', 'name', 'brand', 'description', 'isActive', 'slug', 'createdAt'],
  products.map((p) => [p.id, p.adminId, p.name, p.brand, p.description, p.isActive, p.slug, p.launched]));
insert('ProductCategory', ['product_id', 'category_id'], productCategories);
insert('ProductVariant', ['variant_id', 'product_id', 'sku', 'configuration', 'color', 'price', 'color_hex', 'sortOrder', 'isActive'],
  variants.map((v) => [v.id, v.productId, v.sku, v.size, v.color, v.price, v.hex, v.sortOrder, 1]));
insert('ProductSpecification', ['specification_id', 'variant_id', 'spec_name', 'spec_value', 'unit'], specs.map((s) => [s.id, s.variantId, s.name, s.value, s.unit]));
insert('CompatibilityRule', ['rule_id', 'source_variant_id', 'target_variant_id', 'compatibility_type'], rules.map((r) => [r.id, r.source, r.target, r.type]));
insert('Warranty', ['warranty_id', 'variant_id', 'duration_months', 'coverage'], warranties.map((w) => [w.id, w.variantId, w.months, w.coverage]));

section('Warehouses and suppliers');
insert('Warehouse', ['warehouse_id', 'name', 'location', 'capacity'], warehouses.map((w) => [w.id, w.name, w.location, w.capacity]));
out.push('-- Inventory rows start at zero; the StockMovement ledger below fills them through trigger T1.');
insert('Inventory', ['warehouse_id', 'variant_id', 'quantity_on_hand', 'quantity_reserved', 'reorder_level'],
  [...inv.entries()].filter(([, r]) => r.par > 0 || r.onHand > 0).map(([k, r]) => { const [w, v] = k.split(':').map(Number); return [w, v, 0, 0, r.reorder]; })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]));
insert('Supplier', ['supplier_id', 'name', 'contact'], suppliers.map((s) => [s.id, s.name, s.contact]));
insert('SupplierProduct', ['supplier_id', 'variant_id', 'unit_cost', 'lead_time_days', 'minimum_order_qty'], offers.map((o) => [o.supplierId, o.variantId, o.cost, o.lead, o.moq]));
insert('PurchaseOrder', ['purchase_order_id', 'supplier_id', 'warehouse_id', 'status', 'orderedAt', 'receivedAt'],
  purchaseOrders.map((p) => [p.id, p.supplierId, p.warehouseId, p.status, p.orderedAt, p.receivedAt]));
insert('PurchaseOrderItem', ['po_item_id', 'purchase_order_id', 'variant_id', 'quantity', 'unit_cost'],
  purchaseOrders.flatMap((p) => p.items.map((i) => [i.id, p.id, i.variantId, i.qty, i.cost])));

section('Orders, payments and fulfillment');
insert('CustomerOrder', ['order_id', 'customer_id', 'orderNumber', 'status', 'totalAmount', 'placedAt', 'deliveryMethod', 'shippingFee', 'shipRecipient', 'shipLine1', 'shipCity', 'shipRegion', 'shipPostalCode', 'shipCountry'],
  ordersSorted.map((o) => [o.id, o.customer.id, o.number, o.status, o.total, o.placedAt, o.delivery, o.fee, o.ship.recipient, o.ship.line1, o.ship.city, o.ship.region, o.ship.postal, o.ship.country]));
insert('OrderItem', ['order_item_id', 'order_id', 'variant_id', 'quantity', 'unitPrice'], orders.flatMap((o) => o.items.map((i) => [i.id, o.id, i.variant.id, i.qty, i.price])));
insert('Payment', ['payment_id', 'order_id', 'amount', 'status', 'method', 'createdAt'], orders.map((o) => [o.payment.id, o.id, o.payment.amount, o.payment.status, o.payment.method, o.payment.createdAt]));
insert('`Transaction`', ['transaction_id', 'payment_id', 'transactionType', 'amount', 'status', 'reference', 'createdAt'], transactions.map((t) => [t.id, t.paymentId, t.type, t.amount, t.status, t.reference, t.at]));
insert('Fulfillment', ['fulfillment_id', 'order_id', 'admin_id', 'status', 'createdAt'], orders.map((o) => [o.fulfillment.id, o.id, o.fulfillment.adminId, o.fulfillment.status, o.fulfillment.createdAt]));
insert('Shipment', ['shipment_id', 'fulfillment_id', 'trackingNumber', 'status', 'carrier', 'shippedAt', 'deliveredAt'],
  allShipments.sort((a, b) => a.id - b.id).map((s) => [s.id, s.order.fulfillment.id, s.tracking, s.status, s.carrier, s.shippedAt, s.deliveredAt]));
insert('OrderAllocation', ['allocation_id', 'order_item_id', 'warehouse_id', 'fulfillment_id', 'shipment_id', 'allocated_qty', 'status'],
  allAllocations.sort((a, b) => a.id - b.id).map((a) => [a.id, a.item.id, a.w, a.order.fulfillment.id, a.shipment ? a.shipment.id : null, a.qty, a.status]));
insert('OrderCancellation', ['cancellation_id', 'order_id', 'cancelledBy', 'reason', 'cancelledAt', 'initiatedBy'],
  cancellations.map((c) => [c.id, c.order.id, c.adminId, c.reason, c.at, c.by]));

section('Stock ledger (trigger T1 turns each row into an Inventory change)');
insert('StockMovement', ['movement_id', 'warehouse_id', 'variant_id', 'quantity_change', 'reason', 'movedAt', 'reference'],
  movements.map((m, i) => [i + 1, m.w, m.v, m.change, m.reason, m.at, m.reference]), 200);

section('Returns and refunds (triggers T2 and T3 validate each row)');
insert('ReturnRequest', ['return_request_id', 'order_id', 'customer_id', 'status', 'reason', 'requestedAt', 'resolvedAt'],
  returns.map((r) => [r.id, r.order.id, r.customer.id, r.status, r.reason, r.requestedAt, r.resolvedAt]));
insert('ReturnItem', ['return_item_id', 'return_request_id', 'order_item_id', 'quantity'], returns.flatMap((r) => r.items.map((ri) => [ri.id, r.id, ri.item.id, ri.qty])));
insert('Refund', ['refund_id', 'return_item_id', 'transaction_id', 'amount', 'status', 'createdAt'], refunds.map((r) => [r.id, r.returnItemId, r.txId, r.amount, r.status, r.at]));

section('Quality guarantee claims (trigger T5 validates each row)');
insert('WarrantyClaim', ['claim_id', 'warranty_id', 'order_item_id', 'reason', 'status', 'submittedAt', 'resolution', 'resolvedAt'],
  claims.map((c) => [c.id, c.warranty.id, c.item.id, c.reason, c.status, c.submittedAt, c.resolution, c.resolvedAt]));

section('Shopping bags');
insert('Cart', ['cart_id', 'customer_id', 'status', 'createdAt', 'updatedAt'], carts.map((c) => [c.id, c.customer.id, c.status, c.createdAt, c.updatedAt]));
insert('CartItem', ['cart_item_id', 'cart_id', 'variant_id', 'quantity', 'unit_price', 'addedAt'], carts.flatMap((c) => c.items.map((i) => [i.id, c.id, i.variant.id, i.qty, i.price, i.addedAt])));

section('Open reservations: units held for orders that have not shipped yet');
out.push(
  'UPDATE Inventory i',
  '  JOIN (SELECT oa.warehouse_id, oi.variant_id, SUM(oa.allocated_qty) AS qty',
  '          FROM OrderAllocation oa',
  '          JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id',
  "         WHERE oa.status = 'RESERVED'",
  '         GROUP BY oa.warehouse_id, oi.variant_id) r',
  '    ON r.warehouse_id = i.warehouse_id AND r.variant_id = i.variant_id',
  '   SET i.quantity_reserved = r.qty;',
  '',
  'COMMIT;',
  '',
);

writeFileSync(OUT, out.join('\n'));

// Cross-check the simulation's own books before handing the file over.
for (const [k, r] of inv) if (r.reserved < 0 || r.onHand < r.reserved) throw new Error('bad stock row ' + k);
const count = (s) => orders.filter((o) => o.status === s).length;
console.log(`wrote ${OUT}`);
console.log(`products ${products.length}, variants ${variants.length}, specs ${specs.length}, rules ${rules.length}, customers ${customers.length}`);
console.log(`orders ${orders.length} (placed ${count('PLACED')}, processing ${count('PROCESSING')}, shipped ${count('SHIPPED')}, delivered ${count('DELIVERED')}, cancelled ${count('CANCELLED')})`);
console.log(`order lines ${orderItemSeq}, shipments ${shipmentSeq}, movements ${movements.length}, POs ${purchaseOrders.length} (open ${purchaseOrders.filter((p) => p.status === 'ORDERED').length})`);
console.log(`returns ${returns.length}, refunds ${refunds.length}, claims ${claims.length}, carts ${carts.length}, transactions ${transactions.length}`);
