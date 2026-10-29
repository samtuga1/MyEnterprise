import { warrantyEligible } from "./api.js?v=auth-20261029-3";
export const reportTitles = [
  "Revenue by product & category",
  "Customer spending & repeat purchases",
  "Low stock & replenishment options",
  "Supplier procurement comparison",
  "Outstanding allocations & shipments",
  "Product returns & completed refunds",
  "Open warranty claims & eligibility",
];
// Report projections use the mock snapshot only. Replace with PHP report endpoints later.
export function reports(
  s,
  { start = "2026-01-01", end = "2026-12-31", threshold = 5 } = {},
) {
  const inPeriod = (d) => d.slice(0, 10) >= start && d.slice(0, 10) <= end;
  const orders = s.orders.filter((o) => inPeriod(o.placedAt)),
    valid = orders.filter((o) => o.status !== "Cancelled"),
    delivered = orders.filter((o) => o.status === "Delivered");
  const product = (id) =>
    s.products.find(
      (p) => p.id === s.variants.find((v) => v.id === id).productId,
    );
  const revenue = new Map();
  for (const o of valid)
    for (const i of o.items) {
      const p = product(i.variantId);
      revenue.set(p.id, (revenue.get(p.id) || 0) + i.quantity * i.price);
    }
  const revenueRows = [...revenue]
    .sort((a, b) => b[1] - a[1])
    .map(([id, total]) => ({
      kind: "Product",
      name: s.products.find((p) => p.id === id).name,
      total,
    }));
  for (const c of s.categories) {
    const total = [...revenue].reduce(
      (sum, [id, value]) =>
        sum +
        (s.products.find((p) => p.id === id).categoryIds.includes(c.id)
          ? value
          : 0),
      0,
    );
    if (total) revenueRows.push({ kind: "Category", name: c.name, total });
  }
  const customerRows = s.customers
    .map((c) => {
      const os = delivered.filter((o) => o.customerId === c.id);
      return {
        name: c.name,
        count: os.length,
        total: os.reduce((n, o) => n + o.total, 0),
      };
    })
    .filter((c) => c.count)
    .sort((a, b) => b.total - a.total);
  const stockRows = s.inventory
    .filter((i) => i.onHand - i.reserved <= Number(threshold))
    .flatMap((i) => {
      const offers = s.offers.filter((o) => o.variantId === i.variantId);
      return (offers.length ? offers : [null]).map((o) => ({
        sku: s.variants.find((v) => v.id === i.variantId).sku,
        warehouse: s.warehouses.find((w) => w.id === i.warehouseId).name,
        available: i.onHand - i.reserved,
        supplier: o
          ? s.suppliers.find((x) => x.id === o.supplierId).name
          : "No supplier offer",
        cost: o?.cost,
        leadDays: o?.leadDays,
      }));
    });
  const procurement = s.suppliers
    .map((supplier) => {
      const pos = s.purchases.filter(
          (p) => p.supplierId === supplier.id && inPeriod(p.orderedAt),
        ),
        offers = s.offers.filter((o) => o.supplierId === supplier.id);
      return {
        name: supplier.name,
        count: pos.length,
        total: pos.reduce((n, p) => n + p.quantity * p.cost, 0),
        averageCost: offers.length
          ? Math.round(offers.reduce((n, o) => n + o.cost, 0) / offers.length)
          : null,
        lead: offers.length
          ? (
              offers.reduce((n, o) => n + o.leadDays, 0) / offers.length
            ).toFixed(1)
          : "—",
      };
    })
    .sort((a, b) => b.total - a.total);
  const outstanding = valid
    .filter((o) => !["Delivered"].includes(o.status))
    .map((o) => {
      const qty = o.items.reduce((n, i) => n + i.quantity, 0),
        allocated = o.allocations.reduce((n, a) => n + a.quantity, 0),
        shipped = o.status === "Shipped" ? qty : 0;
      return {
        number: o.number,
        status: o.status,
        unallocated: qty - allocated,
        unshipped: qty - shipped,
      };
    })
    .filter((o) => o.unallocated || o.unshipped);
  const returnRows = s.products
    .map((p) => {
      const items = delivered.flatMap((o) =>
          o.items
            .filter((i) => product(i.variantId).id === p.id)
            .map((i) => ({ orderId: o.id, ...i })),
        ),
        sold = items.reduce((n, i) => n + i.quantity, 0),
        rs = s.returns.filter(
          (r) =>
            ["Received", "Refunded"].includes(r.status) &&
            items.some((i) => i.orderId === r.orderId && i.id === r.itemId),
        ),
        returned = rs.reduce((n, r) => n + r.quantity, 0),
        refunds = s.refunds
          .filter(
            (f) => f.type === "Return" && rs.some((r) => r.id === f.returnId),
          )
          .reduce((n, f) => n + f.amount, 0);
      return {
        name: p.name,
        sold,
        returned,
        rate: sold ? `${((returned / sold) * 100).toFixed(1)}%` : "—",
        refunds,
      };
    })
    .filter((r) => r.sold)
    .sort((a, b) => b.returned - a.returned);
  const warranty = s.claims
    .filter(
      (c) =>
        !["Rejected", "Resolved"].includes(c.status) && inPeriod(c.createdAt),
    )
    .map((c) => {
      const o = s.orders.find((o) => o.id === c.orderId),
        i = o.items.find((i) => i.id === c.itemId),
        v = s.variants.find((v) => v.id === i.variantId);
      return {
        id: c.id,
        product: i.name,
        order: o.number,
        status: c.status,
        duration: v.warrantyMonths,
        eligible: warrantyEligible(o, v),
      };
    });
  return [
    revenueRows,
    customerRows,
    stockRows,
    procurement,
    outstanding,
    returnRows,
    warranty,
  ];
}
export const reportNotes = [
  "Gross merchandise order value for non-cancelled orders placed in the period. Category totals attribute each product to its categories; never sum category rows with product rows. Shipping, tax, and refunds are excluded.",
  "Delivered orders placed in the selected period. Spending is gross order value before refunds; two or more delivered orders indicate repeat purchasing.",
  "Current inventory snapshot, independent of date filters. Available = on hand − reserved. Supplier costs and lead times are quoted values, not observed delivery performance.",
  "Committed purchase value for orders created in the selected period, including received orders. Average unit cost and lead time describe current offers across different SKUs; this is not a like-for-like price ranking.",
  "Non-cancelled orders placed in the selected period. Unallocated = ordered − allocated. Unshipped = ordered − shipped. Shipments cover entire orders.",
  "Cohort of delivered orders placed in the period. Return rate = received/refunded units ÷ purchased units. Includes all subsequent completed return refunds for that cohort; pending requests and cancellation refunds are excluded.",
  "Open claims submitted in the selected period. Eligibility is evaluated today, with warranty starting at order placedAt; manufacturer defects only. Claim and purchase dates have different roles.",
];
