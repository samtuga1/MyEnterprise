# MyEnterprise API

The PHP backend answers JSON under `{base}/api/…`, where `{base}` is the folder the site is installed in (`/MyEnterprise` on XAMPP, empty with `php -S`). This file replaces the older FRONTEND_BACKEND_CONTRACT.md, which described mock data.

## Conventions

- **Success:** `{ "data": … }`.
- **Failure:** `{ "error": { "code", "message", "fields"? } }`. `message` is written for people and is shown in the interface as-is. `fields` maps a form field to its error.

| Status | Meaning |
| --- | --- |
| 401 | Not signed in |
| 404 | Not found |
| 409 | Conflict: a duplicate, or a record still in use |
| 403 + code `csrf` | The CSRF token is missing or expired; fetch `/api/session` again (the client retries once). A plain 403 means the role is not allowed |
| 422 | Invalid input, or a business rule refused it. A trigger or procedure `SIGNAL` arrives here with its own message, for example "Only 2 left of FF-001-SAG-M." |
| 429 | Too many sign-in attempts |
| 503 | The database is not reachable |

- **CSRF:** every POST, PATCH, PUT or DELETE needs the header `X-CSRF-Token`. Its value comes from `GET /api/session` or `GET /api/admin/session`.
- **Money** travels as strings with two decimals (`"58.00"`). **Dates** use the store's local time, `2026-11-07T14:00:00`.
- **Access** (declared per route in `backend/routes.php`):
  - `public`;
  - `customer` (a signed-in shopper);
  - `admin` (any staff member);
  - `admin:ROLE` (ADMINISTRATOR always passes; OPERATIONS buys stock and ships; CATALOG edits products; SUPPORT handles returns and claims).
- **Scoping:** customer endpoints are always limited to the signed-in shopper's own records.

## Storefront

| Method and path | Access | Does |
| --- | --- | --- |
| GET `/session` | public | Signed-in customer, CSRF token, number of items in the bag |
| POST `/auth/register` | public | `{firstName, lastName, email, password}`, then signs in and merges the guest bag |
| POST `/auth/login` | public | `{email, password}`, then merges the guest bag into the saved bag |
| POST `/auth/logout` | public | Signs out the shopper (staff sign-in is unaffected) |
| GET `/home` | public | New-in, outerwear and best-selling shelves |
| GET `/categories` | public | Departments, types and collections, with product counts |
| GET `/products` | public | Listing. Query: `category`, `also` (a second category, e.g. women + dresses), `q`, `sizes`, `colors`, `brands`, `min`, `max`, `inStock=1`, `sort` (featured, new, price_asc, price_desc, name), `page`, `perPage`. Returns items, total, pages and facets |
| GET `/products/{slug}` | public | Product page: variants with live stock, specs, colours (each with its `images`: `src`, `alt`, `width`, `height`), sizes, guarantee, "style it with" pairings |
| GET `/images/{sha256}` | public | A picture from `ProductImage.data`, with its own content type. `Cache-Control: public, max-age=31536000, immutable` and `ETag: "{sha256}"`; `If-None-Match` gives 304. No session is started. Every `image` field in the API is such an address (`api/images/…`), relative to the site folder |
| GET `/images/products/{slug}?color=` | public | The current main picture of a product colour (`fn_product_image`), cached for 5 minutes. Used by page artwork that names a product rather than a picture |
| GET `/cart` | public | Bag lines with current prices and stock problems, subtotal, delivery prices |
| POST `/cart/items` | public | `{variantId, quantity}` adds to the bag |
| PATCH `/cart/items/{variantId}` | public | `{quantity}` sets the quantity (0 removes) |
| DELETE `/cart/items/{variantId}` | public | Removes a line |
| GET `/checkout/defaults` | customer | The last delivery address, to prefill the form |
| POST `/checkout` | customer | `{recipient, line1, city, region, postalCode, country, phone?, deliveryMethod, paymentMethod}` → **`sp_checkout_cart`** → `{orderNumber, total}` |
| GET / PATCH `/account` | customer | Profile, order count and spend / update name and phone |
| POST `/account/password` | customer | `{currentPassword, newPassword}` |
| GET `/account/orders` | customer | Your orders |
| GET `/account/orders/{number}` | customer | Full order: items (returnable quantity, return deadline, guarantee end), allocations, parcels, transactions, returns, claims, and what can still be done (`can.cancel`, `can.return`, `can.claim`) |
| POST `/account/orders/{number}/cancel` | customer | `{reason}` → **`sp_cancel_order`** (allowed while the order is PLACED) |
| POST `/account/orders/{number}/returns` | customer | `{reason, items:[{orderItemId, quantity}]}` writes the request and its lines in one transaction; trigger **T2** checks each line |
| POST `/account/orders/{number}/claims` | customer | `{orderItemId, reason}`; trigger **T5** checks the guarantee |

## Admin (`/api/admin/…`)

| Method and path | Access | Does |
| --- | --- | --- |
| GET `/session`, POST `/auth/login`, POST `/auth/logout` | public | Staff sign-in. Returns `{admin: {name, role, can: [...]}}`. Sessions end after 30 minutes without activity |
| GET `/dashboard?days=30` | admin | KPIs against the previous period, daily sales, pipeline, work queues, top products, recent orders, warehouse use |
| GET `/orders?status=&q=&page=` | admin | Orders with counts per status (`status=OPEN` shows placed, processing and shipped) |
| GET `/orders/{id}` | admin | The same order detail as the shop, with staff fields |
| POST `/orders/{id}/start` | OPERATIONS | **`sp_start_fulfillment`** |
| POST `/orders/{id}/ship` | OPERATIONS | `{carrier}` → **`sp_ship_order`** (one parcel per warehouse); the response adds `parcelsCreated` |
| POST `/shipments/{id}/deliver` | OPERATIONS | Marks a parcel delivered; trigger **T6** completes the order |
| POST `/orders/{id}/cancel` | OPERATIONS, SUPPORT | `{reason}` → **`sp_cancel_order`** as staff (allowed while PLACED or PROCESSING) |
| GET/POST `/products`, GET/PATCH `/products/{id}` | admin / CATALOG | Products with categories and the active flag |
| POST `/products/{id}/variants`, PATCH `/variants/{id}` | CATALOG | Add a size or colour (fabric, care and guarantee are copied from a sibling) / change price, size, colour, active flag, guarantee months |
| PUT `/variants/{id}/specs` | CATALOG | Replace the specification list |
| POST `/products/{id}/images` | CATALOG | Multipart `image` (JPEG or PNG, 12 MB at most) with optional `color`, `alt` and `main`. The picture is checked, shrunk to at most 1200 × 1500, re-encoded as JPEG (no EXIF) and stored in `ProductImage`. Without `main` it becomes the colour's main picture when the colour has none or only a drawing. 409 if the same file is already stored; 422 for a non-picture or a colour the product is not sold in. Returns the product with `images` (id, src, colour, isMain, type, size, bytes, sha256, alt, credit) |
| POST `/images/{id}/main`, DELETE `/images/{id}` | CATALOG | Make a picture its colour's main one / delete it (the next picture becomes main) |
| GET `/variants?q=&supplier=` | admin | Variant lookup, with the supplier's price list when `supplier` is given |
| GET/POST/PATCH/DELETE `/categories` | admin / CATALOG | Categories |
| GET `/warehouses`, GET `/inventory?warehouse=&q=&low=1&page=` | admin | Stock by warehouse |
| POST `/inventory/adjust` | OPERATIONS | `{warehouseId, variantId, change, reason: ADJUSTMENT or DAMAGE_WRITE_OFF, note}` writes a StockMovement; trigger **T1** applies it |
| POST `/inventory/reorder-level` | OPERATIONS | `{warehouseId, variantId, reorderLevel}` |
| GET `/inventory/movements?warehouse=&variant=&reason=&q=&page=` | admin | The stock ledger |
| GET/POST `/suppliers`, GET `/suppliers/{id}`, PUT `/suppliers/{id}/offers/{variantId}` | admin / OPERATIONS | Suppliers and their price lists |
| GET `/purchase-orders?status=`, GET `/purchase-orders/{id}` | admin | Purchase orders |
| POST `/purchase-orders` | OPERATIONS | `{supplierId, warehouseId, items:[{variantId, quantity}]}`. Costs come from SupplierProduct, and the minimum order quantity is enforced |
| GET `/purchase-orders/suggestions` | admin | Low-stock lines with the cheapest supplier (the Q3 logic) |
| POST `/purchase-orders/{id}/receive` | OPERATIONS | **`sp_receive_purchase_order`** (only once) |
| POST `/purchase-orders/{id}/cancel` | OPERATIONS | Cancels an order not yet received |
| GET `/returns?status=` | admin | Returns, with items and refundable amounts |
| POST `/returns/{id}/approve`, POST `/returns/{id}/reject` | OPERATIONS, SUPPORT | Decide a return |
| POST `/returns/{id}/complete` | OPERATIONS | `{restock}` → **`sp_complete_return`**; trigger **T3** checks each refund |
| GET `/claims?status=`, POST `/claims/{id}/{approve|reject|resolve}` | admin / OPERATIONS, SUPPORT | Quality-guarantee claims (`resolution` text is required to reject or resolve) |
| GET `/customers?q=`, GET `/customers/{id}` | admin | Customers, spend, orders and active bag |
| GET `/reports` | admin | The seven business queries: question, definitions, tables, techniques, default parameters |
| GET `/reports/{q1…q7}?date_from=&date_to=&buffer=&only_open=` | admin | Runs the query file from `database/queries/`. Returns columns (with a display type), rows, the SQL and the time taken |
| GET `/database` | admin | Live schema from information_schema: tables by domain with columns, keys, CHECK clauses and row counts; triggers; routines with parameters and cursor counts; views; totals |
| GET `/database/invariants` | admin | Runs `database/08_verify_invariants.sql` |
