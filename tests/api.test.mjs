// End-to-end API tests: real PHP, real MariaDB, real stored procedures and triggers.
//
// ⚠ These tests place orders, ship, refund and receive stock. Point them at a
// disposable copy of the sample database, never at data you want to keep:
//   1. import database/reset/RESET_myenterprise_DESTRUCTIVE.sql into a test server
//   2. ME_DB_PORT=… php -S 127.0.0.1:8099 -t public public/router.php
//   3. API_URL=http://127.0.0.1:8099 npm run test:api
//
// Each test reads what it needs from the API instead of assuming fixed ids, and
// the last test runs the database's own invariant checks (database/08_…sql).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

const BASE = process.env.API_URL || 'http://127.0.0.1:8099';

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async call(method, path, body, { csrf = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf && method !== 'GET' && this.csrf) headers['X-CSRF-Token'] = this.csrf;
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) if (c.startsWith('ME_SESSION=')) this.cookie = c.split(';')[0];
    const json = await res.json();
    if (json.data?.csrfToken) this.csrf = json.data.csrfToken;
    return { status: res.status, data: json.data, error: json.error };
  }
  get(p) { return this.call('GET', p); }
  post(p, b = {}) { return this.call('POST', p, b); }
  patch(p, b) { return this.call('PATCH', p, b); }
  async del(path) {
    const res = await fetch(BASE + path, { method: 'DELETE', headers: { Accept: 'application/json', Cookie: this.cookie, 'X-CSRF-Token': this.csrf } });
    const json = await res.json();
    return { status: res.status, data: json.data, error: json.error };
  }
  /** multipart/form-data, as the admin's picture upload sends it */
  async upload(path, fields) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch(BASE + path, { method: 'POST', body: form, headers: { Accept: 'application/json', Cookie: this.cookie, 'X-CSRF-Token': this.csrf } });
    const json = await res.json();
    return { status: res.status, data: json.data, error: json.error };
  }
}

/** A real PNG (width × height, a colour gradient), built without libraries. */
function png(width, height, seed = 0) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      rows[o] = (x + seed) % 256; rows[o + 1] = (y * 2) % 256; rows[o + 2] = 140;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const ok = (r, label = '') => { assert.ok(r.status < 300, `${label} → ${r.status} ${JSON.stringify(r.error)}`); return r.data; };

const shopper = new Client();
const admin = new Client();

before(async () => {
  ok(await shopper.get('/api/session'), 'session');
  ok(await admin.get('/api/admin/session'), 'admin session');
});

test('catalogue: categories, filtered listing and a product page', async () => {
  const cats = ok(await shopper.get('/api/categories'));
  assert.ok(cats.find((c) => c.slug === 'women' && c.productCount > 0));
  const list = ok(await shopper.get('/api/products?category=shoes&sort=price_asc&perPage=4'));
  assert.ok(list.total > 0 && list.items.length <= 4);
  const prices = list.items.map((i) => Number(i.minPrice));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'sorted by price');
  assert.ok(list.facets.sizes.length > 0);
  const p = ok(await shopper.get('/api/products/relaxed-linen-shirt'));
  assert.equal(p.name, 'Relaxed Linen Shirt');
  assert.ok(p.variants.length >= 5 && p.colors.length === 2 && p.warranty.months === 6);
  assert.equal((await shopper.get('/api/products/no-such-thing')).status, 404);
});

test('security: CSRF token is required for changes; customer cannot reach admin', async () => {
  const r = await shopper.call('POST', '/api/cart/items', { variantId: 1, quantity: 1 }, { csrf: false });
  assert.equal(r.status, 403);
  assert.equal(r.error.code, 'csrf');
  assert.equal((await shopper.get('/api/admin/dashboard')).status, 401);
  assert.equal((await shopper.get('/api/account')).status, 401);
});

let orderNumber;
test('guest bag merges at sign-in; checkout runs sp_checkout_cart', async () => {
  const p = ok(await shopper.get('/api/products/everyday-cotton-tee'));
  const v = p.variants.find((x) => x.available >= 2);
  const bag = ok(await shopper.post('/api/cart/items', { variantId: v.id, quantity: 2 }));
  assert.equal(bag.lines.find((l) => l.variantId === v.id).quantity, 2);

  const bad = await shopper.post('/api/auth/login', { email: 'demo@gmail.com', password: 'wrong-password' });
  assert.equal(bad.status, 401);
  const me = ok(await shopper.post('/api/auth/login', { email: 'demo@gmail.com', password: 'password1234' }), 'login');
  assert.equal(me.customer.email, 'demo@gmail.com');

  const merged = ok(await shopper.get('/api/cart'));
  assert.ok(merged.lines.some((l) => l.variantId === v.id), 'guest line kept after sign-in');

  const missing = await shopper.post('/api/checkout', { deliveryMethod: 'STANDARD' });
  assert.equal(missing.status, 422);
  assert.ok(missing.error.fields.line1);

  const placed = ok(await shopper.post('/api/checkout', {
    recipient: 'Alex Morgan', line1: '12 Maple Avenue', city: 'Chicago', region: 'IL', postalCode: '60614',
    country: 'US', deliveryMethod: 'STANDARD', paymentMethod: 'CARD',
  }), 'checkout');
  assert.match(placed.orderNumber, /^ME-\d+$/);
  orderNumber = placed.orderNumber;
  assert.equal(ok(await shopper.get('/api/cart')).count, 0, 'bag emptied');

  const again = await shopper.post('/api/checkout', {
    recipient: 'Alex Morgan', line1: '12 Maple Avenue', city: 'Chicago', region: 'IL', postalCode: '60614', deliveryMethod: 'STANDARD',
  });
  assert.equal(again.status, 422, 'a second checkout of the same bag is refused');
});

test('customer cancels a placed order (sp_cancel_order, cursor 3)', async () => {
  const o = ok(await shopper.get(`/api/account/orders/${orderNumber}`));
  assert.equal(o.status, 'PLACED');
  assert.ok(o.items.every((i) => i.allocations.every((a) => a.status === 'RESERVED')));
  const c = ok(await shopper.post(`/api/account/orders/${orderNumber}/cancel`, { reason: 'Ordered the wrong size.' }));
  assert.equal(c.status, 'CANCELLED');
  assert.equal(c.money.refunded, c.money.total);
  assert.equal((await shopper.post(`/api/account/orders/${orderNumber}/cancel`, {})).status, 422);
});

test('returns: trigger T2 limits quantities; a valid return is accepted', async () => {
  const orders = ok(await shopper.get('/api/account/orders'));
  let target;
  for (const s of orders.filter((x) => x.status === 'DELIVERED')) {
    const d = ok(await shopper.get(`/api/account/orders/${s.number}`));
    const item = d.items.find((i) => i.canReturn);
    if (item) { target = { d, item }; break; }
  }
  assert.ok(target, 'demo customer has a delivered order inside the return window');
  const tooMany = await shopper.post(`/api/account/orders/${target.d.number}/returns`, {
    reason: 'Too small', items: [{ orderItemId: target.item.id, quantity: target.item.quantity + 1 }],
  });
  assert.equal(tooMany.status, 422);
  assert.match(tooMany.error.message, /can still be returned/);
  const r = ok(await shopper.post(`/api/account/orders/${target.d.number}/returns`, {
    reason: 'Too small', items: [{ orderItemId: target.item.id, quantity: 1 }],
  }), 'return');
  assert.match(r.reference, /^RMA-\d+$/);
});

test('admin: sign-in, role permissions and the dashboard', async () => {
  assert.equal((await admin.post('/api/admin/auth/login', { email: 'demo@gmail.com', password: 'nope-nope' })).status, 401);
  const catalogStaff = new Client();
  ok(await catalogStaff.get('/api/admin/session'));
  ok(await catalogStaff.post('/api/admin/auth/login', { email: 'marcus.bell@myenterprise.example', password: 'password1234' }));
  assert.equal((await catalogStaff.post('/api/admin/purchase-orders', { supplierId: 1, warehouseId: 1, items: [] })).status, 403, 'catalog role cannot buy stock');

  const me = ok(await admin.post('/api/admin/auth/login', { email: 'demo@gmail.com', password: 'password1234' }));
  assert.equal(me.admin.role, 'ADMINISTRATOR');
  const dash = ok(await admin.get('/api/admin/dashboard'));
  assert.ok(Number(dash.kpis.revenue) > 0 && dash.daily.length > 0 && dash.warehouses.length === 3);
});

test('admin fulfils an order: start → ship (cursor 4) → deliver (trigger T6)', async () => {
  const list = ok(await admin.get('/api/admin/orders?status=PLACED'));
  const target = list.items[0];
  assert.ok(target, 'a placed order exists');
  ok(await admin.post(`/api/admin/orders/${target.id}/start`), 'start');
  const shipped = ok(await admin.post(`/api/admin/orders/${target.id}/ship`, { carrier: 'UPS' }), 'ship');
  assert.equal(shipped.status, 'SHIPPED');
  assert.ok(shipped.shipments.length >= 1);
  let last;
  for (const s of shipped.shipments) last = ok(await admin.post(`/api/admin/shipments/${s.id}/deliver`), 'deliver');
  assert.equal(last.status, 'DELIVERED');
});

test('admin refunds an approved return (sp_complete_return + trigger T3)', async () => {
  const open = ok(await admin.get('/api/admin/returns?status=REQUESTED'));
  const rma = open[0];
  ok(await admin.post(`/api/admin/returns/${rma.id}/approve`));
  const done = ok(await admin.post(`/api/admin/returns/${rma.id}/complete`, { restock: true }));
  assert.equal(done.status, 'REFUNDED');
  assert.equal(done.refundTotal, done.value);
  assert.equal((await admin.post(`/api/admin/returns/${rma.id}/complete`, { restock: true })).status, 422, 'no double refund');
});

test('procurement: receive once (cursor 2 + trigger T1); minimum order enforced', async () => {
  const pos = ok(await admin.get('/api/admin/purchase-orders?status=ORDERED'));
  const po = pos[0];
  const received = ok(await admin.post(`/api/admin/purchase-orders/${po.id}/receive`), 'receive');
  assert.equal(received.status, 'RECEIVED');
  assert.equal(received.received.units, received.items.reduce((s, i) => s + i.quantity, 0));
  const twice = await admin.post(`/api/admin/purchase-orders/${po.id}/receive`);
  assert.equal(twice.status, 422);
  assert.match(twice.error.message, /already received/);

  const supplier = ok(await admin.get('/api/admin/suppliers/1'));
  const offer = supplier.offers[0];
  const small = await admin.post('/api/admin/purchase-orders', { supplierId: 1, warehouseId: 1, items: [{ variantId: offer.variantId, quantity: 1 }] });
  assert.equal(small.status, 422);
  const created = ok(await admin.post('/api/admin/purchase-orders', { supplierId: 1, warehouseId: 1, items: [{ variantId: offer.variantId, quantity: offer.minimumOrder }] }));
  assert.equal(created.status, 'ORDERED');
});

test('inventory adjustments go through the ledger and respect reservations', async () => {
  const inv = ok(await admin.get('/api/admin/inventory?low=0'));
  const row = inv.items.find((i) => i.available >= 1);
  const tooMuch = await admin.post('/api/admin/inventory/adjust', { warehouseId: row.warehouseId, variantId: row.variantId, change: -(row.onHand + 5), reason: 'ADJUSTMENT' });
  assert.equal(tooMuch.status, 422);
  const r = ok(await admin.post('/api/admin/inventory/adjust', { warehouseId: row.warehouseId, variantId: row.variantId, change: 2, reason: 'ADJUSTMENT', note: 'Recount' }));
  assert.equal(r.onHand, row.onHand + 2);
});

test('reports: all seven business queries run with parameters', async () => {
  const reports = ok(await admin.get('/api/admin/reports'));
  assert.equal(reports.length, 7);
  for (const rep of reports) {
    const run = ok(await admin.get(`/api/admin/reports/${rep.key}?date_from=2026-01-01&date_to=2026-12-31`), rep.key);
    assert.ok(run.columns.length > 2, rep.key + ' columns');
    assert.ok(run.rows.length > 0, rep.key + ' rows');
    assert.ok(run.sql.toUpperCase().includes('JOIN'), rep.key + ' joins tables');
  }
  assert.equal((await admin.get('/api/admin/reports/q1?date_from=2026-13-40')).status, 422);
});

test('pictures: stored as binary in ProductImage, served by hash, uploads shrunk and de-duplicated', async () => {
  // A seed picture: the bytes come out of the MEDIUMBLOB and hash to their own address.
  const product = ok(await shopper.get('/api/products/relaxed-linen-shirt'));
  const white = () => product.colors.find((c) => c.name === 'White');
  const src = white().images[0].src;
  assert.match(src, /^api\/images\/[0-9a-f]{64}$/);
  const res = await fetch(`${BASE}/${src}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg', 'seed pictures are photographs');
  assert.match(res.headers.get('cache-control'), /immutable/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), src.slice(-64), 'address = SHA-256 of the stored bytes');
  assert.equal((await fetch(`${BASE}/${src}`, { headers: { 'If-None-Match': res.headers.get('etag') } })).status, 304);
  assert.equal((await fetch(`${BASE}/api/images/${'0'.repeat(64)}`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/images/products/relaxed-linen-shirt?color=White`)).status, 200);

  // Admin upload: a large PNG is shrunk, re-encoded as JPEG and, asked to, becomes the colour's main picture.
  const id = ok(await admin.get('/api/admin/products?q=Relaxed Linen')).find((p) => p.slug === 'relaxed-linen-shirt').id;
  const file = new Blob([png(1600, 2000)], { type: 'image/png' });
  assert.equal((await shopper.upload(`/api/admin/products/${id}/images`, { image: file, color: 'White' })).status, 401, 'shoppers cannot upload');
  const up = await admin.upload(`/api/admin/products/${id}/images`, { image: file, color: 'White', main: 'true' });
  assert.equal(up.status, 201, JSON.stringify(up.error));
  const added = up.data.images.find((i) => i.color === 'White' && i.isMain);
  assert.equal(added.type, 'JPEG');
  assert.ok(added.width <= 1200 && added.height <= 1500 && added.bytes <= 512 * 1024, `${added.width}×${added.height}, ${added.bytes} bytes`);
  const jpeg = Buffer.from(await (await fetch(`${BASE}/${added.src}`)).arrayBuffer());
  assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8], 'served as JPEG');
  const shop = ok(await shopper.get('/api/products/relaxed-linen-shirt'));
  assert.equal(shop.colors.find((c) => c.name === 'White').image, added.src, 'the store shows the new main picture');

  assert.equal((await admin.upload(`/api/admin/products/${id}/images`, { image: file, color: 'White' })).status, 409, 'same file twice');
  const fake = new Blob(['<?php echo 1; ?>'], { type: 'image/jpeg' });
  assert.equal((await admin.upload(`/api/admin/products/${id}/images`, { image: fake, color: 'White' })).status, 422, 'not a picture');
  assert.equal((await admin.upload(`/api/admin/products/${id}/images`, { image: new Blob([png(300, 300, 7)], { type: 'image/png' }), color: 'Purple' })).status, 422, 'unknown colour');

  // Make the original photograph main again, then delete the upload: the original stays the main picture.
  const original = up.data.images.find((i) => i.color === 'White' && !i.isMain);
  assert.equal(original.type, 'JPEG');
  assert.ok(ok(await admin.post(`/api/admin/images/${original.id}/main`)).images.find((i) => i.id === original.id).isMain);
  const after = ok(await admin.del(`/api/admin/images/${added.id}`));
  assert.ok(!after.images.some((i) => i.id === added.id));
  assert.equal(after.images.find((i) => i.color === 'White').id, original.id);

  // Without "main", a picture added to a colour that already has a photograph is an extra view.
  const extra = await admin.upload(`/api/admin/products/${id}/images`, { image: new Blob([png(900, 1100, 3)], { type: 'image/png' }), color: 'White' });
  assert.equal(extra.status, 201, JSON.stringify(extra.error));
  const view = extra.data.images.filter((i) => i.color === 'White');
  assert.equal(view[0].id, original.id, 'the photograph stays first');
  ok(await admin.del(`/api/admin/images/${view.find((i) => i.id !== original.id).id}`));
});

test('database explorer and invariants: every rule still holds after the tests', async () => {
  const db = ok(await admin.get('/api/admin/database'));
  assert.equal(db.totals.tables, 31);
  assert.ok(db.totals.checks >= 50 && db.totals.triggers >= 3 && db.totals.procedures >= 3 && db.totals.cursors >= 3);
  const inv = ok(await admin.get('/api/admin/database/invariants'));
  const failing = inv.checks.filter((c) => !c.ok);
  assert.deepEqual(failing, [], 'invariants');
});
