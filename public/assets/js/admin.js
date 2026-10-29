import {passwordField} from './ui.js?v=auth-20261029-3';
import {
  esc,
  money,
  date,
  icon,
  btn,
  link,
  badge,
  img,
  input,
  select,
  empty,
  heading,
  table,
} from "./ui.js?v=auth-20261029-3";
import { reports, reportTitles, reportNotes } from "./reports.js?v=auth-20261029-3";
export const adminNav = [
  ["dashboard", "Overview", "grid"],
  ["products", "Products", "box"],
  ["categories", "Categories", "grid"],
  ["inventory", "Inventory", "box"],
  ["suppliers", "Suppliers", "user"],
  ["purchases", "Purchase orders", "cart"],
  ["orders", "Orders & fulfillment", "truck"],
  ["returns", "Returns & refunds", "refresh"],
  ["warranties", "Warranty claims", "shield"],
  ["reports", "Business reports", "chart"],
];
export function adminShell(s, section, content) {
  return `<div class="admin-layout"><aside class="admin-sidebar"><div class="eyebrow">WORKSPACE</div><h2>Store management</h2><nav aria-label="Admin navigation">${adminNav.map(([id, name, ico]) => `<a href="#/admin/${id}" class="${section === id ? "active" : ""}" ${section === id ? 'aria-current="page"' : ""}>${icon(ico)}${name}</a>`).join("")}</nav></aside><section class="admin-content">${content}</section></div>`;
}
const productName = (s, id) => {
  const v = s.variants.find((v) => v.id === Number(id));
  return `${s.products.find((p) => p.id === v.productId).name} · ${v.sku}`;
};
const orderTable = (s, orders) =>
  table(
    ["Order", "Customer", "Date", "Total", "Status", ""],
    orders.map((o) => [
      link(o.number, `/admin/order/${o.id}`, "text-btn"),
      esc(s.customers.find((c) => c.id === o.customerId).name),
      date(o.placedAt),
      money(o.total),
      badge(o.status),
      link("Manage →", `/admin/order/${o.id}`, "text-btn"),
    ]),
  );
export function dashboard(s) {
  const gross = s.orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((n, o) => n + o.total, 0),
    refunds = s.refunds.reduce((n, r) => n + r.amount, 0),
    low = s.inventory.filter((i) => i.onHand - i.reserved <= 5).length,
    open = s.returns.filter(
      (r) => !["Refunded", "Rejected"].includes(r.status),
    ).length;
  const monthly = Array.from({ length: 6 }, (_, i) => ({
    name: ["May", "Jun", "Jul", "Aug", "Sep", "Oct"][i],
    value: s.orders
      .filter(
        (o) =>
          o.status !== "Cancelled" &&
          o.placedAt.slice(0, 7) === `2026-${String(i + 5).padStart(2, "0")}`,
      )
      .reduce((n, o) => n + o.total, 0),
  }));
  const max = Math.max(1, ...monthly.map((m) => m.value));
  return `${heading("OVERVIEW", "Dashboard", "Sales, orders, and inventory at a glance.")}<div class="stats">${[
    ["Gross order sales", money(gross), "Non-cancelled orders", "chart"],
    [
      "Orders to fulfill",
      s.orders.filter((o) => ["Paid", "Processing"].includes(o.status)).length,
      "Paid and processing",
      "box",
    ],
    ["Low-stock balances", low, "5 or fewer available", "box"],
    ["Open returns", open, "Awaiting resolution", "refresh"],
  ]
    .map(
      ([label, value, note, ic]) =>
        `<div class="stat"><div>${label}${icon(ic)}</div><strong>${value}</strong><small>${note}</small></div>`,
    )
    .join(
      "",
    )}</div><div class="dashboard-grid"><section class="panel"><div class="section-heading"><div><h2>Sales at a glance</h2><p>Gross order value · May–October 2026</p></div></div><div class="bar-chart">${monthly.map((m) => `<div class="bar-column"><span>${money(m.value)}</span><div class="bar" style="height:${Math.max(2, (m.value / max) * 150)}px" title="${m.name}: ${money(m.value)}"></div><small>${m.name}</small></div>`).join("")}</div></section><section class="panel attention"><h2>Needs attention</h2><a href="#/admin/inventory">${icon("box")} ${low} stock balances to review ${icon("arrow")}</a><a href="#/admin/returns">${icon("refresh")} ${open} open return requests ${icon("arrow")}</a><a href="#/admin/purchases">${icon("truck")} ${s.purchases.filter((p) => p.status === "Ordered").length} incoming purchase orders ${icon("arrow")}</a><p>Completed refunds: <strong>${money(refunds)}</strong></p></section></div><section class="panel top-space"><div class="section-heading"><h2>Recent orders</h2><a class="inline-link" href="#/admin/orders">View all orders ${icon("arrow")}</a></div>${orderTable(
    s,
    s.orders
      .slice()
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
      .slice(0, 5),
  )}</section>`;
}
export function products(s, params) {
  const q = (params.get("q") || "").toLowerCase();
  return `${heading("CATALOG MANAGEMENT", "Products", "Manage fashion products, sizes, colors, fabric/care details, and quality warranty policies.", btn(`${icon("plus")} Add product`, "product-form", "", "primary"))}<form data-form="admin-search" class="table-search">${input("Search products", "q", q, "search", 'placeholder="Search name or brand"')}<button class="btn secondary">Search</button></form>${table(
    ["Product", "Category", "Variants", "Status", "Actions"],
    s.products
      .filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(q))
      .map((p) => [
        `<div class="table-product">${img(p)}<span><strong>${esc(p.name)}</strong><small>${esc(p.brand)}</small></span></div>`,
        p.categoryIds
          .map((id) => esc(s.categories.find((c) => c.id === id)?.name))
          .join(", "),
        s.variants.filter((v) => v.productId === p.id).length,
        badge(p.active ? "Active" : "Archived"),
        `<div class="actions">${btn("Edit", "product-form", `data-id="${p.id}"`)}${link("Variants & specs", `/admin/product/${p.id}`)}</div>`,
      ]),
  )}`;
}
export function variants(s, id) {
  const p = s.products.find((p) => p.id === Number(id));
  if (!p)
    return empty(
      "Product not found",
      "Return to the catalog manager.",
      "/admin/products",
      "All products",
    );
  const vs = s.variants.filter((v) => v.productId === p.id);
  return `${heading("VARIANTS & SPECIFICATIONS", esc(p.name), "Stock is tracked independently for each variant.", btn(`${icon("plus")} Add variant`, "variant-form", `data-product="${p.id}"`, "primary"))}<p>${link("← All products", "/admin/products", "text-btn")}</p>${
    vs.length
      ? vs
          .map(
            (v) =>
              `<section class="panel top-space"><div class="section-heading"><div><h2>${esc(v.configuration)} · ${esc(v.color)}</h2><p>${esc(v.sku)} · ${money(v.price)} · ${v.warrantyMonths}-month warranty</p></div>${btn("Edit variant", "variant-form", `data-id="${v.id}" data-product="${p.id}"`)}</div><p>${esc(v.coverage.replace(/^Simulated quality warranty/, 'Quality warranty'))}</p>${table(
                ["Specification", "Value", "Unit", "Actions"],
                v.specs.map((sp, i) => [
                  esc(sp.name),
                  esc(sp.value),
                  esc(sp.unit) || "—",
                  `<div class="actions">${btn("Edit", "spec-form", `data-variant="${v.id}" data-index="${i}"`)}${btn("Remove", "remove-spec", `data-variant="${v.id}" data-index="${i}"`, "text-btn danger")}</div>`,
                ]),
              )}${btn("Add specification", "spec-form", `data-variant="${v.id}"`, "text-btn")}</section>`,
          )
          .join("")
      : empty(
          "Add your first size / color variant",
          "Create a variant, then add specifications and warehouse stock.",
          "",
          "",
        )
  }`;
}
export function categories(s) {
  return `${heading("CATALOG ORGANIZATION", "Categories", "Keep the collection easy to explore.", btn("Add category", "category-form", "", "primary"))}${table(
    ["Category", "Products", ""],
    s.categories.map((c) => [
      esc(c.name),
      s.products.filter((p) => p.categoryIds.includes(c.id)).length,
      btn("Rename", "category-form", `data-id="${c.id}"`),
    ]),
  )}`;
}
export function inventory(s, params) {
  const warehouse = params.get("warehouse") || "",
    low = params.get("low") === "on",
    rows = s.inventory.filter(
      (i) =>
        (!warehouse || i.warehouseId === Number(warehouse)) &&
        (!low || i.onHand - i.reserved <= 5),
    );
  return `${heading("WAREHOUSE OPERATIONS", "Inventory", "Available stock = on hand − reserved. Checkout reserves; shipping deducts.")}<form data-form="inventory-filter" class="toolbar">${select("Warehouse", "warehouse", [{ id: "", name: "All warehouses" }, ...s.warehouses], warehouse)}<label class="check-field"><input type="checkbox" name="low" ${low ? "checked" : ""}> Low stock only (≤ 5)</label><button class="btn secondary">Apply</button></form>${table(
    ["Product / variant", "Warehouse", "On hand", "Reserved", "Available", ""],
    rows.map((i) => [
      esc(productName(s, i.variantId)),
      esc(s.warehouses.find((w) => w.id === i.warehouseId).name),
      i.onHand,
      i.reserved,
      badge(String(i.onHand - i.reserved)),
      btn(
        "Adjust",
        "inventory-form",
        `data-variant="${i.variantId}" data-warehouse="${i.warehouseId}"`,
      ),
    ]),
  )}<section class="panel top-space"><h2>Recent stock movements</h2>${table(
    ["Date", "Variant", "Warehouse", "Change", "Reason"],
    s.movements
      .slice(0, 12)
      .map((m) => [
        date(m.date),
        esc(s.variants.find((v) => v.id === m.variantId).sku),
        esc(s.warehouses.find((w) => w.id === m.warehouseId).name),
        `${m.quantity > 0 ? "+" : ""}${m.quantity}`,
        esc(m.reason),
      ]),
  )}</section>`;
}
export function suppliers(s) {
  return `${heading("PROCUREMENT", "Suppliers", "Maintain contacts and quoted replenishment terms.", btn("Add supplier", "supplier-form", "", "primary"))}${table(
    ["Supplier", "Contact", "Offers", ""],
    s.suppliers.map((p) => [
      esc(p.name),
      esc(p.contact),
      s.offers.filter((o) => o.supplierId === p.id).length,
      btn("Edit", "supplier-form", `data-id="${p.id}"`),
    ]),
  )}<section class="panel top-space"><div class="section-heading"><h2>Supplier offers</h2>${btn("Add / update offer", "offer-form", "", "primary")}</div>${table(
    ["Supplier", "Variant", "Unit cost", "Lead time", "Minimum order"],
    s.offers.map((o) => [
      esc(s.suppliers.find((p) => p.id === o.supplierId).name),
      esc(productName(s, o.variantId)),
      money(o.cost),
      `${o.leadDays} days`,
      o.minimum,
    ]),
  )}</section>`;
}
export function purchases(s) {
  return `${heading("PROCUREMENT", "Purchase orders", "Receive a full purchase order to add stock to its destination warehouse.", btn("Create purchase order", "purchase-form", "", "primary"))}${table(
    [
      "PO",
      "Supplier / warehouse",
      "Product / variant",
      "Quantity",
      "Total",
      "Status",
      "",
    ],
    s.purchases.map((p) => [
      `PO-${p.id}`,
      `${esc(s.suppliers.find((x) => x.id === p.supplierId).name)}<small>${esc(s.warehouses.find((x) => x.id === p.warehouseId).name)}</small>`,
      esc(productName(s, p.variantId)),
      p.quantity,
      money(p.quantity * p.cost),
      badge(p.status),
      p.status === "Ordered"
        ? btn("Receive stock", "receive", `data-id="${p.id}"`)
        : "Received",
    ]),
  )}`;
}
export function adminOrders(s, params) {
  const status = params.get("status") || "";
  return `${heading("ORDER OPERATIONS", "Orders & fulfillment", "Allocate inventory, prepare orders, and create shipments.")}<form data-form="orders-filter" class="toolbar">${select("Order status", "status", [{ id: "", name: "All statuses" }, ...["Paid", "Processing", "Shipped", "Delivered", "Cancelled"].map((v) => ({ id: v, name: v }))], status)}<button class="btn secondary">Apply</button></form>${orderTable(
    s,
    s.orders.filter((o) => !status || o.status === status),
  )}`;
}
export function returns(s) {
  return `${heading("AFTER-SALES", "Returns & refunds", "Review requests, confirm receipt, and issue refunds.")}<div class="notice">Received returns are held outside sellable inventory pending inspection. They are not automatically restocked.</div>${table(
    ["Return / order", "Product", "Qty", "Reason", "Status", "Actions"],
    s.returns.map((r) => {
      const o = s.orders.find((o) => o.id === r.orderId),
        i = o.items.find((i) => i.id === r.itemId);
      return [
        `#${r.id}<small>${o.number}</small>`,
        esc(i.name),
        r.quantity,
        esc(r.reason),
        badge(r.status),
        r.status === "Requested"
          ? `<div class="actions">${btn("Approve", "return-status", `data-id="${r.id}" data-status="Approved"`)}${btn("Reject", "return-status", `data-id="${r.id}" data-status="Rejected"`, "text-btn danger")}</div>`
          : r.status === "Approved"
            ? btn(
                "Confirm received",
                "return-status",
                `data-id="${r.id}" data-status="Received"`,
              )
            : r.status === "Received"
              ? btn(
                  `Refund ${money(r.amount)}`,
                  "return-status",
                  `data-id="${r.id}" data-status="Refunded"`,
                  "primary",
                )
              : "—",
      ];
    }),
  )}<section class="panel top-space"><h2>Completed refunds</h2>${table(
    ["Reference", "Order", "Type", "Amount", "Status"],
    s.refunds.map((r) => [
      `RF-${r.id}`,
      `ME-${r.orderId}`,
      esc(r.type),
      money(r.amount),
      badge(r.status),
    ]),
  )}</section>`;
}
export function warranties(s) {
  return `${heading("AFTER-SALES", "Warranty claims", "Review manufacturer-defect claims and record a resolution.")} ${table(
    ["Claim", "Order / product", "Reason", "Status", "Actions"],
    s.claims.map((c) => {
      const o = s.orders.find((o) => o.id === c.orderId),
        i = o.items.find((i) => i.id === c.itemId);
      return [
        `WC-${c.id}`,
        `${o.number}<small>${esc(i.name)}</small>`,
        esc(c.reason),
        badge(c.status),
        ["Submitted", "Under review"].includes(c.status)
          ? `<div class="actions">${btn(c.status === "Submitted" ? "Begin review" : "Resolve", "claim-status", `data-id="${c.id}" data-status="${c.status === "Submitted" ? "Under review" : "Resolved"}"`)}${btn("Reject", "claim-status", `data-id="${c.id}" data-status="Rejected"`, "text-btn danger")}</div>`
          : "—",
      ];
    }),
  )}`;
}
export function reportPage(s, params) {
  const index = Math.max(
      0,
      Math.min(6, (Number(params.get("report")) || 1) - 1),
    ),
    start = params.get("start") || "2026-01-01",
    end = params.get("end") || "2026-12-31",
    threshold = params.get("threshold") || 5,
    result = reports(s, { start, end, threshold })[index];
  const definitions = [
    [
      ["Type", "Product / category", "Gross value"],
      (r) => [r.kind, esc(r.name), money(r.total)],
    ],
    [
      ["Customer", "Completed orders", "Gross spending", "Repeat customer"],
      (r) => [
        esc(r.name),
        r.count,
        money(r.total),
        r.count >= 2 ? "Yes" : "No",
      ],
    ],
    [
      ["SKU", "Warehouse", "Available", "Supplier", "Unit cost", "Lead time"],
      (r) => [
        esc(r.sku),
        esc(r.warehouse),
        r.available,
        esc(r.supplier),
        r.cost == null ? "—" : money(r.cost),
        r.leadDays ? `${r.leadDays} days` : "—",
      ],
    ],
    [
      [
        "Supplier",
        "Purchase orders",
        "Committed spend",
        "Avg. quoted unit cost",
        "Avg. quoted lead days",
      ],
      (r) => [
        esc(r.name),
        r.count,
        money(r.total),
        r.averageCost == null ? "—" : money(r.averageCost),
        r.lead,
      ],
    ],
    [
      ["Order", "Status", "Unallocated units", "Unshipped units"],
      (r) => [esc(r.number), badge(r.status), r.unallocated, r.unshipped],
    ],
    [
      [
        "Product",
        "Purchased units",
        "Returned units",
        "Return rate",
        "Completed refunds",
      ],
      (r) => [esc(r.name), r.sold, r.returned, r.rate, money(r.refunds)],
    ],
    [
      ["Claim", "Product", "Order", "Status", "Coverage", "Eligible today"],
      (r) => [
        `WC-${r.id}`,
        esc(r.product),
        r.order,
        badge(r.status),
        `${r.duration} months`,
        r.eligible ? "Yes" : "No",
      ],
    ],
  ];
  const [headers, row] = definitions[index];
  return `${heading("BUSINESS INTELLIGENCE", "Reports", "Review sales, inventory, procurement, and after-sales activity.")}<form data-form="reports-filter" class="panel report-filters">${select(
    "Business question",
    "report",
    reportTitles.map((name, i) => ({ id: i + 1, name: `${i + 1}. ${name}` })),
    index + 1,
  )}<div class="toolbar">${input("From (inclusive)", "start", start, "date", "required")}${input("To (inclusive)", "end", end, "date", "required")}${input("Low-stock threshold", "threshold", threshold, "number", 'min="0" max="999" required')}<button class="btn primary">Run report</button></div><div class="form-error" role="alert" tabindex="-1" hidden></div></form><section class="panel top-space"><div class="eyebrow">QUESTION ${index + 1} OF 7</div><h2>${reportTitles[index]}</h2><p class="report-note">${reportNotes[index]}</p>${table(headers, result.map(row))}<p class="small muted-text">${result.length} result rows · Values reflect the selected records.</p></section>`;
}

export function login(params) {
 return `<div class="admin-auth"><section class="panel admin-login-card" aria-labelledby="admin-login-title"><div class="eyebrow">MYENTERPRISE ADMINISTRATION</div><h1 id="admin-login-title">Sign in</h1><p>Access your store’s orders, products, and inventory.</p><form data-form="admin-login"><input type="hidden" name="next" value="${esc(params.get('next')||'/admin/dashboard')}"><div class="form-error" role="alert" tabindex="-1" hidden></div>${input('Email address','email','','email','required maxlength="100" autocomplete="username"')}${passwordField('Password')}<button class="btn primary full" type="submit">Sign in</button></form></section></div>`;
}
