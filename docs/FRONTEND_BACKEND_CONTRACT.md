# Frontend → future PHP contract

This document records presentation data needs, not a database migration. The 30-table diagram is unchanged. All current reads/writes use `assets/js/api.js`; page renderers receive plain snapshots. `reports.js` projects mock report results. Replace those boundaries with HTTP calls to PHP when backend work is authorized. Never give the browser database credentials or direct database access.

## Boundary and serialization

The mock API is synchronous. PHP integration must make controller handlers asynchronous, await each response before rendering, show loading/error states, and disable duplicate submissions while pending. Keep rendering functions pure. Use endpoint-specific DTOs rather than downloading every customer's records to the browser. Current full snapshots are convenient **only for the mock**.

Every mutation needs server-side validation, session authorization/ownership checks, CSRF protection for browser requests, transaction management, and idempotency where appropriate. Server totals/prices/stock win over client values. Return structured errors (`code`, `message`, optional `fields`) and stable identifiers. Money must travel as integer cents or decimal strings with a documented conversion; do not trust binary floating-point values for accounting. Dates should have a documented timezone, preferably ISO 8601 UTC with display conversion at the UI.

## Mapping to all 30 original tables

| Original name | Current view model | Fields consumed / needed |
| --- | --- | --- |
| Customer | `customers`, customer session | ID, email, firstName/lastName combined as display name; phone when later required |
| Admin | simulated admin session | ID, display name, role, permissions; current demo has no persistent admin credentials |
| Product | `products` | ID, admin/manager reference when exposed, name, brand, description, isActive; image/featured fields are UI-only needs |
| Category | `categories` | ID, category_name shown as name |
| ProductCategory | `product.categoryIds` | Product and category IDs; UI editor currently assigns one category, DTO can carry many |
| ProductVariant | `variants` | ID, product ID, sku, configuration, color, price |
| ProductSpecification | `variant.specs` | Stable specification ID, name, value, unit; mock uses array positions only |
| CompatibilityRule | `compatibility` | ID, source/target variant IDs, compatibility_type, target product label |
| Cart | browser `cart` plus session | ID, customer ID or guest identifier, status, version |
| CartItem | `cart[]` | ID, variant ID, quantity, price; mock recomputes from current variant price |
| Order | `orders` | ID, orderNumber, customer ID, status, totalAmount, placedAt; shipping snapshot needed |
| OrderItem | `order.items` | ID, variant ID, quantity, historical unitPrice; display snapshots for product name/configuration/color |
| Warehouse | `warehouses` | ID, name, location; capacity not enforced without a unit |
| Inventory | `inventory` | Warehouse/variant IDs, quantity_on_hand, quantity_reserved; available derived |
| StockMovement | `movements` | ID, warehouse/variant IDs, quantity_change, reason, movedAt; source audit reference needed later |
| Supplier | `suppliers` | ID, name, contact |
| SupplierProduct | `offers` | Supplier/variant IDs, unit_cost, lead_time_days, minimum_order_qty |
| PurchaseOrder | `purchases` | ID, supplier/warehouse IDs, status, orderedAt |
| PurchaseOrderItem | fields nested on each mock purchase | Stable item ID, variant ID, quantity, unit_cost; arrays required for multi-line backend orders |
| Payment | `order.payment` and total | ID, order ID, amount, status; full object needed from backend |
| Transaction | simulated payment/refund outcomes | ID, payment ID, transactionType, amount, status; no real gateway fields collected |
| Fulfillment | order lifecycle / allocations | ID, order ID, admin ID, status; current mock represents lifecycle in order status |
| OrderAllocation | `order.allocations` | ID, order-item ID, warehouse ID, fulfillment ID, nullable shipment ID, allocated_qty; mock variant IDs are sufficient because cart lines are unique |
| Shipment | `order.tracking` and status | ID, fulfillment ID, trackingNumber, status; array of shipments required for full diagram behavior |
| OrderCancellation | `order.cancelReason`, Cancelled status | ID, order ID, cancelledBy, reason, cancelledAt; actor semantics unresolved |
| ReturnRequest | `returns` | ID, order/customer IDs, status; reason is a UI-only input not shown in source columns |
| ReturnItem | embedded in `returns` | ID, return-request ID, order-item ID, quantity; backend supports multiple items per request |
| Refund | `refunds` | ID, return-item ID, nullable transaction ID, amount, status; cancellation refunds need separate agreed representation |
| Warranty | fields on `variants` | ID, variant ID, duration_months, coverage; mock assumes one policy per variant |
| WarrantyClaim | `claims` | ID, warranty/order-item IDs, reason, status; submitted timestamp needed for period filtering |

## Information absent from the diagram

These fields must be discussed before implementation. They may be supplied by configuration, joined response metadata, assets, or an explicitly approved schema change; they are not instructions to add columns now.

- Product image URL/path and accessible alt text; curated featured flag. Local SVG illustrations and fallback replace these today.
- Shipping recipient, address lines, city, region, postal code, country, delivery choice, and immutable order shipping snapshot. The demo supports one simple US-style address and free delivery.
- Secure credentials, password-reset mechanism, role permissions, and server sessions if real authentication is selected. The demo never collects/stores a password. Customer/Admin do not have password columns in the source.
- Item display snapshots if product names/configuration are editable; money snapshots already map to OrderItem.unitPrice.
- Return reason and submission/receipt timestamps; explicit return policy and inspection/restocking disposition.
- Warranty claim submission timestamp and resolution details; the mock report uses `createdAt` and computes eligibility today from placedAt.
- Shipment carrier, shipment/delivery timestamps, and quantities if partial shipments are implemented.
- Cancellation initiator type and actor ID; cancellation refund linkage. These require reconciliation with the diagram, not a client-side workaround in production.
- Payment simulation reference, order operation/idempotency keys, stock audit source links, and record versions for safe concurrent edits.
- Currency, tax, shipping fee, discount, and final total rules if anything beyond the prototype's USD/zero tax/free shipping is needed.

## Suggested endpoint responsibilities (not implemented)

| Screen/action | Suggested PHP responsibility | Success result / rejection examples |
| --- | --- | --- |
| Catalog | Search/filter/sort/page active products with variant summaries | Items, total count, page count; validated filter inputs |
| Product detail | Product, variants, specs, compatibility, warranty, stock availability | One product DTO; missing/inactive product error |
| Cart | Session-scoped add/update/remove; current validated prices | Recalculated cart and totals; invalid quantity/stock error |
| Checkout | Lock inventory; validate/pricing; create order/items/reservations and simulated payment atomically | Order ID/number; payment failure or insufficient stock with no partial order |
| Orders | Only current customer's orders; admin access separately authorized | Order detail with allocations/shipments/after-sales activity |
| Cancel | Verify eligibility/owner; release reservations and simulate approved refund policy atomically | Updated order; already cancelled/shipped error |
| Returns | Verify delivered item ownership and cumulative quantities | Request ID/status; excessive quantity or wrong-order error |
| Warranty | Verify purchase/policy/eligibility and duplicate requests | Claim ID; not eligible/open claim error |
| Catalog admin | Validate product/category/variant/spec operations | Updated entity; duplicate SKU/category, invalid relation errors |
| Inventory admin | Apply auditable adjustment, preserving reserved floor | Updated balance/movement; invalid balance error |
| Procurement | Validate supplier offer, minimum, item list, warehouse; receive once atomically | Purchase/receipt DTO; duplicate receipt/invalid supplier error |
| Fulfillment | Allocate/prepare, ship, confirm delivery with consistent order references | Allocations and shipment DTO; shortage/invalid transition error |
| Return/refund admin | Transition review/receipt; validate and record refundable amount atomically | Status/refund DTO; duplicate/over-refund error |
| Warranty admin | Review/resolve with audit information | Updated claim; invalid transition error |
| Reports 1–7 | Execute agreed SQL query with validated period/threshold | Column definitions and result rows; metric definitions matching report notes |

The seven report definitions are in `reports.js` and visible in the UI. They are proposals for integration, not claimed SQL contracts. The original candidate procedures/triggers/cursors in PROJECT_BRIEF.md remain unimplemented.

## Fashion view models — 2026-10-28

The store now focuses exclusively on clothing, shoes, bags, and accessories. No database design change is made. Future PHP responses must supply:

- Product names, fictional/demo label or brand, category membership, descriptions, and product image identifiers/URLs with fallbacks. Production variant-specific images are unresolved.
- Existing `configuration` as the displayed **size / fit** (for example M / Relaxed fit, EU 39 / Regular width, W28 / L30), plus `color`, SKU, price, and per-warehouse stock. No new size column is added. A normalized size chart, measurements, width system, and their storage are future decisions; do not infer universal size equivalence.
- Specification name/value/unit pairs for material composition, care, and size-system information. Size/fit comes from the variant so editing it cannot leave a duplicated specification stale.
- Existing compatibility source/target/type as **Style it with** recommendations. These are editorial outfit suggestions, not technical compatibility or guaranteed sizing.
- Quality warranty duration/coverage and claim state using existing warranty view models. Current fictional coverage concerns manufacturing defects in stitching or fastenings; final apparel/footwear policy requires agreement. Fit preferences use the return workflow; exchanges are not implemented.
- Historical item size/fit, color, name, and price snapshots for orders and refunds.

`catalogDomain: 'fashion'` is local fixture metadata, not a proposed database column. Older saved snapshots require a user-confirmed demo reset to load the current collection.

## Product presentation and dedicated admin entry — 2026-10-28

The user explicitly requested normal product UI without simulated/environment labels, and administration accessible only by manually entering `{base}/admin`. This supersedes earlier instructions to display simulation banners in product screens. The underlying frontend-only scope is unchanged. Customer header/footer/account screens have no admin link; admin uses its own header/sidebar and a compact dashboard, with no hero, customer category navigation, or entry gate. A physical `admin/index.html` works with Python/Apache without routing middleware; internal routes still use hashes. Legacy root admin hashes redirect.

Admin access uses an explicit local repository context rather than overwriting the customer session. It is not authentication or authorization; PHP integration must enforce those on the server. Customer sign-in remains an email-only local profile selection; no passwords, magic links, verification email, or identity checks are implemented. Checkout no longer offers payment-outcome testing controls; it calls the existing approved mock-payment branch internally. Paid/refund/shipment records remain simulations. No real credentials or card details are collected. Shipping fields begin empty. The confirmed reset utility moved to `/tools/reset.html`, outside product navigation. All limitations and running instructions remain documented in README.

## Password and admin login flows — 2026-10-29

The user now requires passwords for customer sign-in/registration and a dedicated admin login. This supersedes earlier passwordless/direct-admin-access presentation decisions; no backend or schema changes are authorized. Normal product wording and the violet theme remain.

The mock API exposes asynchronous `login(email, password)`, `register({name,email,password,confirmPassword})`, and `loginAdmin(email,password)`, plus separate customer/admin logout. Registration checks 8–128 characters and exact confirmation. Each new customer has a frontend-only credential object with PBKDF2/SHA-256 hash, 16-byte random salt, and 100,000 iterations. No plaintext password or confirmation is persisted. Public fixture accounts use documented test passwords. `authVersion:1` and `adminSession` are local view-model metadata, not proposed database columns. Existing passwordless snapshots gain the documented customer sample verifier and lose their old sessions; orders, carts, customers, and catalog edits remain. Admin actions require an authenticated admin session and admin context; a customer session is independent.

The admin route guard preserves an internal requested destination through login, and admin sign-out returns to login without changing the customer session/cart. Customer checkout still resumes after sign-in or registration. These client-side guards/verifiers are bypassable and do not establish real authentication or authorization. PHP must replace them with server-side password hashing, session issuance/expiry/revocation, CSRF protections, authorization and abuse controls. Do not send these local verifiers as proof of identity. Authentication endpoint errors should map to inline form feedback. Password recovery and identity verification remain deferred.

## Shared sample login — 2026-10-29

At the user’s request, both the primary customer and admin use `demo@gmail.com` / `password1234`. These are public frontend fixtures. Customer and admin sessions remain separate. `demoLoginVersion:1` is frontend-only migration metadata: older saved snapshots rename the original Alex sample account while preserving its ID, orders, cart, and other records. If the requested email already exists, that account receives the requested sample verifier instead, avoiding duplicate emails. Other registered credentials remain unchanged. The migration is saved with the next successful mutation; no reset is required. Secondary sample customers retain their documented passwords. No database design changes were made.

## Admin sign-in on entry — 2026-10-29

The user reported that opening `/admin/` skipped login because the previous implementation restored `adminSession` from localStorage. Admin authentication is now held only in memory for the current page. A new page load, reload, or newly opened tab always starts signed out, including when older storage contains an admin session. Hash navigation within the workspace retains login. The repository `refresh()` reloads shared records without importing another page’s admin authentication or discarding this page’s login. Persisted snapshots keep `adminSession:null`; customer sessions, carts, and business records keep their existing persistence. This supersedes earlier references to persisted admin sessions. The separate login and route guard remain frontend-only behavior; backend session policy is deferred.
