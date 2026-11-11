# MyEnterprise database guide

This guide is for the group. It explains what the database contains, why it is designed this way, and how each required part works: tables, constraints, triggers, procedures, functions, cursors, the seven business queries, and the product pictures stored in the database. Every statement here was checked against the running database (MariaDB 10.4.28, the version in XAMPP 8.2). See `docs/VERIFICATION.md` for the exact checks and results.

Files are in `database/`:

| File | What it contains |
| --- | --- |
| `00_create_database.sql` | Creates the `myenterprise` database if it does not exist. |
| `01_schema.sql` | 31 tables (the 30 of the diagram plus `ProductImage`) with primary keys, foreign keys, UNIQUE and CHECK constraints, and indexes. |
| `02_functions.sql` | 6 stored functions. |
| `03_procedures.sql` | 6 stored procedures, 4 of them with cursors. |
| `04_triggers.sql` | 9 triggers (7 rules). |
| `05_views.sql` | 3 views used by the shop and the admin. |
| `06_seed_data.sql` | Sample data: 10 months of trading (generated, see below). |
| `06_seed_images.sql` | The product pictures, one INSERT per picture into `ProductImage` (generated). Import it after `06_seed_data.sql`. |
| `07_business_queries.sql` | The seven business queries in one file, for phpMyAdmin. |
| `queries/q1…q7_*.sql` | The same seven queries, one per file. The PHP reports page runs these files. |
| `08_verify_invariants.sql` | 23 integrity checks. Every one must return 0 violations. |
| `09_demonstrations.sql` | Runs every trigger, procedure, function and cursor, for screenshots. **Changes data.** |
| `myenterprise_full.sql` | Files 00–06 in one file, pictures included: the one to import in phpMyAdmin. |
| `reset/RESET_myenterprise_DESTRUCTIVE.sql` | Drops `myenterprise` and rebuilds it with the sample data. **Deletes all changes.** |

## 1. Installing

**phpMyAdmin (XAMPP):** start MySQL in the XAMPP control panel, open http://localhost/phpmyadmin, choose **Import**, select `database/myenterprise_full.sql`, and press **Go**. It creates the database, all objects and the sample data in a few seconds. phpMyAdmin understands the `DELIMITER $$` lines used around the routines and triggers.

**Command line:** `mysql -u root < database/myenterprise_full.sql`

**Rebuilding:** `myenterprise_full.sql` never drops anything. If the tables already exist it stops at the first `CREATE TABLE`. To start again from the sample data, import `database/reset/RESET_myenterprise_DESTRUCTIVE.sql`. It drops and rebuilds only the `myenterprise` database; your other databases are not touched.

**Checking:** run `database/08_verify_invariants.sql`. All 23 rows must say `OK`.

## 2. From the diagram to the tables

The logical table diagram (`docs/MyEnterprise_Final_ER_and_Table_Diagrams 2.pdf`) is the source. All 30 tables and every original column exist with the diagram's names. One table is added, `ProductImage`, for the product pictures (see below). The other changes are listed below; each one is needed by a workflow the diagram and flowchart already describe. A current diagram generated from the installed database is in `docs/ER_DIAGRAM.md`.

### Renamed

| Diagram | Database | Why |
| --- | --- | --- |
| `Order` | `CustomerOrder` | `ORDER` is a reserved SQL word. Every query would need backticks, and one missing backtick breaks the query. |

`Transaction` keeps its name. It is not reserved in MariaDB, and the SQL files still quote it as `` `Transaction` `` to be safe.

### Columns added (marked `-- [added]` in `01_schema.sql`)

| Table | Added columns | Needed for |
| --- | --- | --- |
| Customer | `password_hash`, `createdAt` | Sign-in with hashed passwords (bcrypt); "new customers" figures |
| Admin | `fullName`, `password_hash`, `isActive`, `createdAt` | Staff sign-in; names on fulfilments and cancellations; disabling staff without deleting history |
| Category | `slug`, `category_group`, `sortOrder` | Web addresses; Women/Men departments versus garment types versus collections; menu order |
| Product | `slug`, `createdAt` | Product pages; "New in" |
| ProductVariant | `color_hex`, `sortOrder`, `isActive` | Colour swatches; XS before S before M; retiring one size |
| Cart | `createdAt`, `updatedAt`, `active_customer_id` (generated) | Abandoned bags; the rule "one active bag per customer" |
| CartItem | `addedAt` | Bag history |
| CustomerOrder | `deliveryMethod`, `shippingFee`, shipping address (6 columns) | The flowchart's "enter shipping address and choose delivery option". The address is a snapshot: it stays as it was even if the customer moves |
| Inventory | `reorder_level`, `updatedAt` | Low-stock reports (Q3) and suggested reorders |
| StockMovement | `reference` | Which document caused the movement (PO-12, ME-10057, RMA-4) |
| PurchaseOrder | `receivedAt` | Receiving only once, and measuring real supplier lead times (Q4) |
| Payment | `method`, `createdAt` | Card, PayPal or Apple Pay (a label only; no card data is ever stored) |
| Transaction | `reference`, `createdAt` | Simulated gateway reference. It is UNIQUE, so the same refund cannot be written twice |
| Fulfillment | `createdAt` | Waiting times (Q5) |
| Shipment | `carrier`, `shippedAt`, `deliveredAt` | Tracking; the 30-day return window starts at delivery |
| OrderAllocation | `status` (RESERVED, SHIPPED, RELEASED) | Keeping cancelled reservations as history instead of deleting them |
| OrderCancellation | `initiatedBy` | Customer or staff cancelled (see below) |
| ReturnRequest | `reason`, `requestedAt`, `resolvedAt` | Return reasons (Q6); the return window |
| Refund | `createdAt` | Refund history |
| WarrantyClaim | `submittedAt`, `resolution`, `resolvedAt` | Guarantee eligibility is judged on the submission date (Q7) |

### Table added: ProductImage (pictures stored in the database)

The shop needs a picture for every product colour, and staff add pictures whenever they add a product or a colour. The pictures are stored **in the database as binary data**, not as files on the web server.

```
ProductImage (image_id PK, product_id FK → Product, color, sortOrder, mime_type, width, height,
              alt_text, credit, data MEDIUMBLOB, byte_size GENERATED, sha256 GENERATED UNIQUE,
              uploadedBy FK → Admin, createdAt)
```

- **One picture per colour, not per variant.** A colour comes in 4 to 6 sizes, and every size looks the same. A picture column on `ProductVariant` would store the same picture 4 to 6 times, and changing it would mean updating every size: a classic update anomaly. Keying the picture to (product, colour) stores it once. `color` NULL means the picture shows every colour, for example a close-up of the fabric.
- **Several pictures per colour.** `sortOrder` 0 is the main picture; the others appear as extra views on the product page.
- **The database computes `byte_size` and `sha256` from the bytes** (`STORED` generated columns). They can never disagree with the data, and listing pictures never has to read the BLOB itself.
- **`sha256` is UNIQUE.** The same file cannot be stored twice. It is also the picture's web address (`/api/images/{sha256}`). Because an address always means the same bytes, browsers may cache a picture for a year, and an updated picture simply gets a new address.
- **CHECK constraints:**
  - the type must be JPEG, PNG or SVG (`chk_image_mime`);
  - a file holds 1 byte to 512 KB (`chk_image_bytes`);
  - width and height are between 1 and 4,000 pixels;
  - the description for screen readers is at least 3 characters.
- **Delete rules.** Deleting a product deletes its pictures (`ON DELETE CASCADE`). If a staff account were deleted, its pictures would stay, with `uploadedBy` set to NULL.
- **Why there is no foreign key on `color`.** The diagram keeps the colour as text on `ProductVariant`, with no colour table, so nothing exists to reference. The API checks that the product is sold in a colour before it stores a picture for it.

**How a picture gets in.** In the admin, staff upload a JPEG or PNG of up to 12 MB. The PHP API then does four things before inserting the row:

1. It checks that the file really is a picture.
2. It turns phone photos the right way up.
3. It shrinks the picture to at most 1200 × 1500 pixels.
4. It saves it again as JPEG. This removes the camera data (GPS position, device) and keeps the file under 512 KB.

The 512 KB limit matters because XAMPP's MySQL refuses any single statement over 1 MB (`max_allowed_packet`). The sample pictures are in `06_seed_images.sql`, one INSERT per picture, written as `FROM_BASE64('…')`.

**How a picture gets out.**

- **Choosing the picture:** function F6 `fn_product_image(product, colour)` returns the key of the picture to show.
- **Sending it:** `GET /api/images/{key}` sends the bytes with the right content type, a year-long cache and an ETag. A browser that already has the picture gets `304 Not Modified` and no bytes.

**Files or BLOBs? The trade-off.**

| | Pictures in the database (chosen) | Pictures as files, path in the database |
| --- | --- | --- |
| Import / backup | One SQL file carries everything. A teammate who imports it gets the whole shop. | The SQL file and a folder of files must be copied together and kept in step. |
| Consistency | A picture and its row are written in the same transaction. Deleting a product deletes its pictures. | A file can exist with no row pointing to it, or a row can point to a missing file. |
| Size | The SQL file grows: the 77 sample photographs (7.3 MB) make `myenterprise_full.sql` about 10.8 MB, still well under phpMyAdmin's 40 MB upload limit on XAMPP. Every picture is limited to 512 KB. | The SQL file stays small, and there is no size limit. |
| Serving | PHP reads the row for each picture, which is slower than the web server sending a file. Long caching makes this a one-time cost per browser. | The web server sends the file directly. |

For a shop of this size the database wins. A store with millions of pictures would usually keep files in object storage instead.

### Changed nullability

- `Fulfillment.admin_id` may be NULL. A fulfilment row is created at checkout, before any staff member picks the order up. A CHECK constraint requires an admin once the status passes PENDING.
- `OrderCancellation.cancelledBy` may be NULL. The diagram links it to Admin, but customers also cancel their own orders. `initiatedBy` says who cancelled, and a CHECK constraint keeps the two columns consistent: ADMIN needs `cancelledBy`, CUSTOMER must leave it empty.

## 3. Keys and constraints

| | Count |
| --- | --- |
| Tables | 31 (all InnoDB, utf8mb4): the 30 of the diagram and ProductImage |
| Primary keys | 31 (3 composite: ProductCategory, Inventory, SupplierProduct) |
| Foreign keys | 45 |
| UNIQUE constraints | 25 |
| CHECK constraints | 64, on 28 of the 31 tables |
| Indexes | 94 |

Design choices worth presenting:

- **Money is `DECIMAL(10,2)`**, never FLOAT. A float cannot store 0.10 exactly.
- **Statuses are codes guarded by CHECK.** For example `CustomerOrder.status IN ('PLACED','PROCESSING','SHIPPED','DELIVERED','CANCELLED')`. A typo such as `'SHIPED'` is rejected by the database itself.
- **The stock invariant is one CHECK:** `0 <= quantity_reserved <= quantity_on_hand` (`chk_inventory_balance`). Nothing, not even a bug in PHP, can store more units reserved than are on the shelf.
- **Pairs of columns that must agree:**
  - A purchase order is RECEIVED exactly when it has a `receivedAt` date: `CHECK ((status = 'RECEIVED') = (receivedAt IS NOT NULL))`.
  - Shipments follow the same rule with DELIVERED and `deliveredAt`.
  - An allocation is SHIPPED exactly when it has a shipment.
- **A movement's direction must match its reason** (`chk_movement_direction`): a purchase receipt can only add stock, and a sale shipment can only remove it.
- **A composite foreign key:** `ReturnRequest (order_id, customer_id) → CustomerOrder (order_id, customer_id)`. It proves that the customer returning an order is the customer who placed it, with no trigger needed.
- **Generated columns for picture facts:** `ProductImage.byte_size` and `ProductImage.sha256` are computed by the database from the stored bytes. The UNIQUE index on `sha256` refuses a second copy of the same file.
- **A generated column for "one active bag per customer":** `Cart.active_customer_id` equals `customer_id` only while the bag is ACTIVE, and it carries a UNIQUE index. A customer can have many old bags but never two active ones.
- **Delete rules.** Catalog detail rows cascade with their parent: specifications, category links and supplier prices. Anything financial or historical uses RESTRICT: orders, payments, stock movements, returns. A product that has been sold cannot be deleted, so it is archived with `isActive = 0` instead.

## 4. Functions (6)

All six are in `02_functions.sql`. Each lookup uses an aggregate (SUM, MAX, COALESCE), which always returns exactly one row, or a scalar subquery, which returns NULL when nothing matches (F6). A plain `SELECT … INTO` that finds nothing raises a NOT FOUND condition, and that condition can end a calling procedure's cursor loop early. This is a subtle bug the design avoids.

| Function | Returns | Used by |
| --- | --- | --- |
| `fn_available_stock(variant)` | Units that can still be sold: on hand minus reserved, over all warehouses | Demonstrations only. The app reads the same figure from view `v_variant_stock`, which computes it for many variants in one query |
| `fn_returnable_quantity(order_item)` | Units bought minus units already on a non-rejected return | Order pages, demonstrations |
| `fn_refundable_amount(return_item)` | Returned units × the price actually paid, minus refunds already issued | Trigger T3, `sp_complete_return` |
| `fn_warranty_expires_on(order_item, warranty)` | Delivery date + guarantee months (NULL until delivered) | Trigger T5, Q7, order pages |
| `fn_payment_refunded_total(payment)` | Total successfully refunded against a payment | Trigger T3, procedures, invariants |
| `fn_product_image(product, colour)` | Key (SHA-256) of the picture to show. The order of preference: the colour's main picture, then a picture for every colour, then (when the colour is NULL) any picture of the product. NULL if there is none | Shop listings, bag, orders, admin pages, view `v_product_listing` |

## 5. Procedures and the cursors (6 procedures, 4 cursors)

All six are in `03_procedures.sql`, and every one follows the same pattern:

```sql
DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
START TRANSACTION;
  … checks, with SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a sentence for the customer';
  … the work
COMMIT;
```

If anything fails, everything the procedure did is rolled back, and the original error message travels to PHP and on to the screen. Each cursor loop sits in its own nested `BEGIN … END` block that owns the `NOT FOUND` handler, so a lookup elsewhere cannot stop the loop.

### Cursor 1: `sp_checkout_cart` (bag → paid order)

Called by the checkout page (`POST /api/checkout`). In one transaction it:

1. Locks the customer's ACTIVE bag (`SELECT … FOR UPDATE`). A double click waits here, then finds the bag already checked out ("Your bag is empty").
2. Writes the order header. The order number needs the new id, so a unique placeholder is written first, then replaced with `ME-` + (10000 + id).
3. **CURSOR over the bag lines, in variant order.** Every checkout locks stock rows in the same order, so two checkouts cannot deadlock each other. For each line it:
   - checks the item is still sold;
   - locks that variant's stock rows and checks there are enough units;
   - writes the OrderItem at today's price;
   - reserves the units warehouse by warehouse. It prefers a warehouse this order already uses, then one that can supply the whole line, so the order needs fewer parcels.
4. Calculates the delivery fee: express $18; standard free from $150, otherwise $6.
5. Records a simulated payment (Payment + a CAPTURE Transaction) and closes the bag.

If any line fails (sold out, for example), nothing is saved: no order, no reservation, no payment. This was tested; see the verification file.

### Cursor 2: `sp_receive_purchase_order` (supplier delivery → stock)

Called from the admin page Purchasing → Receive.

1. Locks the purchase order. RECEIVED or CANCELLED orders are refused with "PO-12 was already received. Stock was not added again." A repeated click can never add the stock twice.
2. **CURSOR over the purchase-order lines.** It writes one `PURCHASE_RECEIPT` row per line into the StockMovement ledger. The procedure never edits Inventory itself: trigger T1 does it.
3. Marks the order RECEIVED with `receivedAt = NOW()`. Q4 later compares that date with the supplier's quoted lead time.

### Cursor 3: `sp_cancel_order` (cancel before shipping)

Called by the customer ("Cancel order") or by staff.

1. Locks the order. The policy:
   - customers may cancel while the order is PLACED;
   - staff may also cancel while it is PROCESSING (being packed);
   - shipped orders must go through a return instead.
2. **CURSOR over the order's RESERVED allocations.** Each one gives its units back to its warehouse (`quantity_reserved - qty`) and becomes RELEASED. The row is kept as history, not deleted.
3. Records the OrderCancellation. UNIQUE on `order_id` enforces the diagram's "0..1 per order".
4. Refunds everything captured as one REFUND transaction, and marks the payment and fulfilment.

### Cursor 4: `sp_ship_order` (one parcel per warehouse)

Called from the admin order page → Ship.

**CURSOR over the warehouses that hold this order's reservations.** Each warehouse becomes one Shipment with its own tracking number. For each parcel the procedure:

1. releases the reservation;
2. writes `SALE_SHIPMENT` ledger rows, and trigger T1 lowers on-hand stock;
3. points the allocations at the parcel, which trigger T4 checks.

This is the flowchart's "shipments may be split across warehouses".

### `sp_start_fulfillment` and `sp_complete_return`

- `sp_start_fulfillment` lets a staff member take a PLACED order. The order shows "Processing", and customers can no longer self-cancel it.
- `sp_complete_return` closes an APPROVED return once the parcel is back:
  - it optionally restocks with `RETURN_RESTOCK` movements;
  - it writes one REFUND transaction and one Refund row per returned line, for the historical price;
  - it sets the payment to PARTIALLY_REFUNDED or REFUNDED.

  It needs no cursor: each statement is set-based (`INSERT … SELECT`). The assignment asks for cursors where appropriate, and they are not forced in where a single statement does the job.

## 6. Triggers (9 objects, 7 rules)

All nine are in `04_triggers.sql`. A `SIGNAL` inside a trigger cancels the whole statement that fired it, so nothing is half-applied.

| Trigger | Fires | What it does |
| --- | --- | --- |
| **T1 `trg_stock_movement_apply`** | AFTER INSERT ON StockMovement | **The ledger drives the balance.** Each movement changes `Inventory.quantity_on_hand` by `quantity_change`, and creates the Inventory row when a variant first arrives in a warehouse. It refuses stock beyond the warehouse capacity, and refuses removals that would go below zero or below the units reserved for customers. Because of this trigger, on hand always equals the sum of the ledger (invariant S1). |
| **T2 `trg_return_item_validate`** | BEFORE INSERT ON ReturnItem | A return line is accepted only if:<br>• the line belongs to the order being returned;<br>• the order is delivered;<br>• the request is within 30 days of that item's delivery;<br>• the units plus earlier non-rejected returns do not exceed the units bought.<br>Message example: "Only 1 of 1 bought can still be returned." |
| **T3 `trg_refund_validate`** | BEFORE INSERT ON Refund | A refund is accepted only if:<br>• the return is approved;<br>• the amount fits in what is still refundable for that line;<br>• the linked transaction is a REFUND for the same order and the same amount;<br>• the payment's refunds stay within the payment. |
| T4 `trg_allocation_before_insert` / `_before_update` | OrderAllocation | Foreign keys alone cannot prove that an allocation's order line, fulfilment and shipment belong to **one** order; these two triggers do. They also stop a line being allocated beyond its quantity, and keep shipped and released allocations final. |
| T5 `trg_warranty_claim_validate` | BEFORE INSERT ON WarrantyClaim | Allows one open claim per item. The guarantee must cover the exact variant bought, the item must be delivered, and the claim must be submitted before the guarantee ends (`fn_warranty_expires_on`). |
| T6 `trg_shipment_delivered` | AFTER UPDATE ON Shipment | When the last parcel of an order is delivered, the fulfilment completes and the order becomes DELIVERED. |
| T7 `trg_stock_movement_no_update` / `_no_delete` | BEFORE UPDATE / DELETE ON StockMovement | The ledger is append-only. Mistakes are corrected with a new ADJUSTMENT row, never by editing history. |

T1, T2 and T3 are the three required triggers; T4–T7 protect integrity that keys and CHECK constraints alone cannot express.

**A limitation worth discussing in the paper:** MariaDB does not let a trigger change a table that the statement firing it is reading. Delivering parcels with `UPDATE Shipment JOIN Fulfillment … SET …` therefore fails with error 1442, because trigger T6 updates Fulfillment. The application updates `Shipment` by its id instead, and the demonstrations file shows the same pattern.

## 7. The seven business queries

Each query lives in `database/queries/` and joins between 4 and 8 tables. The top of each file states:

- the business question;
- exact definitions (what counts as revenue, which date range, which statuses);
- the tables used;
- the SQL techniques.

Parameters are session variables (`SET @date_from = '2026-01-01';`), so each file runs as-is in phpMyAdmin. The admin page **Reports** runs the same files with the dates chosen on screen and shows the SQL beside the results.

| # | Question | Tables | Techniques |
| --- | --- | --- | --- |
| Q1 | Which garment categories earned the most, what share of sales is each, and which product leads each category? | 6 | CTEs, `ROW_NUMBER()` and `SUM() OVER` window functions |
| Q2 | Who are the most valuable customers once refunds are taken off, and how often do they come back? | 6 | Pre-aggregated refunds (no join multiplication), CASE segmentation |
| Q3 | Which sizes and colours are at or under their reorder level in each warehouse, what is already on order, and which supplier refills them most cheaply? | 8 | `ROW_NUMBER()` to pick one offer per variant, LEFT JOIN of open purchase orders |
| Q4 | Which suppliers take the most purchasing spend, and do they deliver within their quoted lead time? | 4 | Per-PO CTE, conditional aggregation, `DATEDIFF`, window share |
| Q5 | Which paid orders are still waiting to be packed or delivered, for how long, from which warehouses, and are they overdue? | 8 | Separate derived tables per one-to-many join, `GROUP_CONCAT`, `TIMESTAMPDIFF` |
| Q6 | Which products are returned most often relative to deliveries, why, and how much was refunded? | 7 | Four CTEs, `ROW_NUMBER()` for the top reason, `NULLIF` |
| Q7 | Which quality-guarantee claims are open, and was each submitted inside its guarantee? | 7 | A stored function inside the query, `DATEDIFF`, `FIELD()` ordering |

Sample results on the fresh seed data, 2026-01-01 to 2026-12-31 (they change as the shop is used):

- **Q1:** Shoes lead with 22.5% of revenue ($10,543), and Leather Chelsea Boots are the top product in that category.
- **Q4:** Harbor Outerwear Co. takes the largest share of purchasing ($19,699) but delivers on time only 13% of the time, while Stride Footwear Wholesale is on time 67% of the time.
- **Q5:** the open orders, with any that have waited past 48 hours (24 for express) flagged "Overdue".

## 8. Integrity checks (23 invariants)

`08_verify_invariants.sql` checks stock, orders, money, after-sales and procurement. Examples:

- on hand equals the ledger;
- reserved equals open allocations;
- every order's capture equals its total;
- refunds never exceed payments;
- returned units never exceed units bought;
- received purchase orders added exactly their units.

The admin page **Database → Run integrity checks** runs the same file. The checks pass on the fresh seed, after the demonstrations, and after the automated API tests.

## 9. The sample data

`06_seed_data.sql` is generated by `tools/seed/generate-seed.mjs` (run `npm run seed`). The generator simulates trading from 5 January to 7 November 2026, applying the same rules as the procedures:

- opening stock;
- orders reserved at checkout and shipped per warehouse;
- cancellations;
- returns refunded and restocked;
- weekly purchase orders that refill low stock;
- quarterly stock counts;
- guarantee claims.

It then writes plain INSERT statements. Triggers stay ON while the file loads, so the database re-validates the whole history. Inventory is never inserted directly: it starts at zero and is built from the 1,500 ledger rows by trigger T1.

`06_seed_images.sql` is generated by `tools/seed/generate-images.mjs` (also part of `npm run seed`). It stores 77 photographs: one for each of the 70 product colours, plus a second view for seven of them. For each colour it uses:

- the photograph in `tools/photos/products/{product}/{colour}.jpg` (and `{colour}-2.jpg` for another view); the photographer and Pixabay page are recorded in `tools/photos/credits.json` and in the `credit` column;
- if a colour had no photograph, the drawing made by `npm run art` (`tools/art/products/`). None is needed today.

The photographs come from Pixabay (free to use under the Pixabay Content License, no attribution required; credits are kept anyway). `tools/photos/pixabay.mjs` searched Pixabay's API for each product and colour. The chosen pictures are listed in `tools/photos/picks.json`; the same tool downloads them and crops each to the shop's 4:5 frame with `tools/photos/crop.php` (GD). Photographs with visible real brand names or logos were not used, because the shop's labels are fictional. Where Pixabay had no good photograph of a colour, the colour was changed to the one the best photograph shows. For example, the wrap dress is sold in blush and cornflower instead of forest and navy.

| Data | Count |
| --- | --- |
| Customers | 60 |
| Products, variants (size × colour) | 34, 289 |
| Specifications | 1,135 |
| Orders, order lines | 354, 581 |
| Stock movements | 1,500 |
| Purchase orders, purchase-order lines | 153, 926 |
| Returns, guarantee claims | 46, 13 |
| Product pictures | 77 photographs (7.3 MB): one per product colour, plus 7 second views |
| All rows | about 9,000 |

Order statuses on the seed: placed 6, being packed 6, in transit 12, delivered 306, cancelled 24.

**Sample accounts** (fictional; every account uses the password `password1234`):

| Who | Email |
| --- | --- |
| Shopper with a full history | `demo@gmail.com` |
| Administrator (at `/admin`) | `demo@gmail.com` |
| Operations | `priya.nair@myenterprise.example` |
| Catalog | `marcus.bell@myenterprise.example` |
| Customer care | `lena.ortiz@myenterprise.example` |

The demo shopper has:

- a delivered order still inside its 30-day return window;
- an order in transit;
- an order that can still be cancelled;
- a refunded return;
- an approved guarantee claim.

## 10. Engine notes

- Tested on **MariaDB 10.4.28** (XAMPP 8.2.4). CHECK constraints are enforced from MariaDB 10.2.1 onwards; older engines silently ignore them.
- The database uses `utf8mb4_general_ci`, XAMPP's server default. Mixing collations makes comparisons between table columns and session variables fail.
- MySQL 8 was not tested. Known differences: MySQL forbids CHECK constraints on columns used by a foreign key with `ON DELETE CASCADE`, which affects `CompatibilityRule`, and it reports some errors with different codes. (ProductImage has no CHECK on its foreign-key columns.)
- `max_allowed_packet` is 1 MB in XAMPP's `my.cnf`. No statement in the SQL files comes near it (`npm test` checks this), and each picture is at most 512 KB.

## 11. Suggested demonstration order (presentation)

1. Admin → **Database**: 31 tables in 8 domains, the keys and CHECK constraints, then the triggers and routines tabs, then **Run integrity checks**.
2. Shop: sign in as `demo@gmail.com`, add two items, check out. This is cursor 1; the stock is now reserved.
3. Admin → **Orders**: start packing, then ship. This is cursor 4 plus trigger T1; an order split across warehouses ships as two parcels. Mark the parcels delivered, and trigger T6 completes the order.
4. Shop → the delivered order → return more than you bought. Trigger T2 refuses. Return one item.
5. Admin → **Returns**: approve, then "Mark received and refund". This is `sp_complete_return` plus trigger T3.
6. Admin → **Purchasing**: receive an open purchase order (cursor 2), then try again to show it is refused.
7. Admin → **Reports**: run Q1 and Q5 with different dates, and show the SQL panel.
8. phpMyAdmin: run `09_demonstrations.sql` block by block for screenshots of every rejection message.
9. Admin → **Products** → a product → **Pictures**: upload a photograph for one colour. It becomes the main picture in the shop at once. Then show the row in phpMyAdmin (`ProductImage`: the BLOB, `byte_size` and `sha256`), and try uploading the same file again: the UNIQUE `sha256` refuses it.
