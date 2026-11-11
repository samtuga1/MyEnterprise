-- =============================================================================
-- MyEnterprise — File 09: demonstrations of every trigger, procedure, function
--                         and cursor (for the presentation and paper screenshots)
-- -----------------------------------------------------------------------------
-- ⚠ THIS SCRIPT CHANGES DATA (it receives a purchase order, checks out a cart,
--   cancels and ships orders, refunds a return). Run it on the sample database
--   only. To start over, reload the sample with the reset script in
--   database/reset/.
--
-- How to run
--   phpMyAdmin: open the SQL tab and paste ONE numbered block at a time.
--     Blocks marked "EXPECTED ERROR" stop with the trigger's message — that
--     message is the demonstration. Take the screenshot, then run the next block.
--   mysql CLI:  mysql --force -t myenterprise < database/09_demonstrations.sql
--     (--force continues past the expected errors; -t prints tables)
--
-- Finish with database/08_verify_invariants.sql: every check stays at 0,
-- which shows the operations kept stock and money consistent.
-- =============================================================================

USE myenterprise;

-- -----------------------------------------------------------------------------
-- 1. FUNCTIONS
-- -----------------------------------------------------------------------------
-- F1: sellable units of a few variants across all warehouses
SELECT pv.sku, pv.configuration AS size, pv.color, fn_available_stock(pv.variant_id) AS available
  FROM ProductVariant pv
 WHERE pv.product_id = 1
 ORDER BY pv.sortOrder
 LIMIT 5;

-- F2 + F4: what the demo customer can still return, and when each guarantee ends
SELECT o.orderNumber, p.name, oi.quantity AS bought,
       fn_returnable_quantity(oi.order_item_id)                   AS still_returnable,
       fn_warranty_expires_on(oi.order_item_id, w.warranty_id)    AS guarantee_ends
  FROM CustomerOrder o
  JOIN OrderItem oi      ON oi.order_id = o.order_id
  JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
  JOIN Product p         ON p.product_id = pv.product_id
  JOIN Warranty w        ON w.variant_id = oi.variant_id
 WHERE o.customer_id = 1
 ORDER BY o.placedAt;


-- -----------------------------------------------------------------------------
-- 2. CURSOR 2 · sp_receive_purchase_order  +  TRIGGER T1 (stock ledger → Inventory)
-- -----------------------------------------------------------------------------
SELECT MIN(purchase_order_id) INTO @po FROM PurchaseOrder WHERE status = 'ORDERED';

-- Before: the lines on the purchase order and the stock they will refill
SELECT CONCAT('PO-', poi.purchase_order_id) AS po, pv.sku, poi.quantity AS ordering,
       i.quantity_on_hand AS on_hand_before
  FROM PurchaseOrderItem poi
  JOIN PurchaseOrder po  ON po.purchase_order_id = poi.purchase_order_id
  JOIN ProductVariant pv ON pv.variant_id = poi.variant_id
  LEFT JOIN Inventory i  ON i.variant_id = poi.variant_id AND i.warehouse_id = po.warehouse_id
 WHERE poi.purchase_order_id = @po;

CALL sp_receive_purchase_order(@po, @lines, @units);
SELECT @po AS purchase_order, @lines AS lines_received, @units AS units_received;

-- After: one PURCHASE_RECEIPT movement per line, and Inventory raised by trigger T1
SELECT m.movement_id, m.reference, pv.sku, m.quantity_change, m.reason, i.quantity_on_hand AS on_hand_after
  FROM StockMovement m
  JOIN ProductVariant pv ON pv.variant_id = m.variant_id
  JOIN Inventory i       ON i.variant_id = m.variant_id AND i.warehouse_id = m.warehouse_id
 WHERE m.reference = CONCAT('PO-', @po);

-- 2b. EXPECTED ERROR — receiving the same purchase order twice is refused
CALL sp_receive_purchase_order(@po, @lines, @units);


-- -----------------------------------------------------------------------------
-- 3. CURSOR 1 · sp_checkout_cart  +  TRIGGER T4 (allocation consistency)
-- -----------------------------------------------------------------------------
-- A customer with no open bag fills one with two items.
SELECT MIN(c.customer_id) INTO @shopper
  FROM Customer c
 WHERE c.customer_id > 1
   AND NOT EXISTS (SELECT 1 FROM Cart k WHERE k.customer_id = c.customer_id AND k.status = 'ACTIVE');

INSERT INTO Cart (customer_id, status) VALUES (@shopper, 'ACTIVE');
SET @cart = LAST_INSERT_ID();
INSERT INTO CartItem (cart_id, variant_id, quantity, unit_price)
SELECT @cart, v.variant_id, 1, v.price
  FROM v_variant_stock v
 WHERE v.available >= 2 AND v.product_id IN (3, 24)
 ORDER BY v.product_id, v.available DESC
 LIMIT 2;

SELECT ci.cart_id, pv.sku, ci.quantity, ci.unit_price FROM CartItem ci
  JOIN ProductVariant pv ON pv.variant_id = ci.variant_id WHERE ci.cart_id = @cart;

CALL sp_checkout_cart(@shopper, 'STANDARD', 'CARD', 'Demo Shopper', '1 Example Street',
                      'Chicago', 'IL', '60601', 'US', @new_order);

-- After: the order, its warehouse reservations, the simulated payment, the closed cart
SELECT orderNumber, status, totalAmount, shippingFee FROM CustomerOrder WHERE order_id = @new_order;
SELECT oa.allocation_id, pv.sku, w.name AS warehouse, oa.allocated_qty, oa.status,
       i.quantity_reserved AS now_reserved_in_warehouse
  FROM OrderAllocation oa
  JOIN OrderItem oi      ON oi.order_item_id = oa.order_item_id
  JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
  JOIN Warehouse w       ON w.warehouse_id = oa.warehouse_id
  JOIN Inventory i       ON i.warehouse_id = oa.warehouse_id AND i.variant_id = oi.variant_id
 WHERE oi.order_id = @new_order;
SELECT t.transactionType, t.amount, t.status, t.reference
  FROM `Transaction` t JOIN Payment p ON p.payment_id = t.payment_id WHERE p.order_id = @new_order;
SELECT cart_id, status FROM Cart WHERE cart_id = @cart;

-- 3b. EXPECTED ERROR — the same bag cannot be checked out twice
CALL sp_checkout_cart(@shopper, 'STANDARD', 'CARD', 'Demo Shopper', '1 Example Street',
                      'Chicago', 'IL', '60601', 'US', @again);


-- -----------------------------------------------------------------------------
-- 4. CURSOR 3 · sp_cancel_order — release reservations and refund
-- -----------------------------------------------------------------------------
CALL sp_cancel_order(@new_order, 'CUSTOMER', NULL, 'Ordered the wrong size.', @released, @refunded);
SELECT @released AS units_released, @refunded AS refunded;

SELECT oa.allocation_id, oa.status, i.quantity_reserved AS reserved_now
  FROM OrderAllocation oa
  JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id
  JOIN Inventory i  ON i.warehouse_id = oa.warehouse_id AND i.variant_id = oi.variant_id
 WHERE oi.order_id = @new_order;
SELECT * FROM OrderCancellation WHERE order_id = @new_order;

-- 4b. EXPECTED ERROR — a shipped order cannot be cancelled
SELECT MIN(order_id) INTO @shipped FROM CustomerOrder WHERE status = 'SHIPPED';
CALL sp_cancel_order(@shipped, 'ADMIN', 1, 'Too late', @r1, @r2);


-- -----------------------------------------------------------------------------
-- 5. CURSOR 4 · sp_ship_order  +  TRIGGER T1 (sale leaves stock)  +  TRIGGER T6
-- -----------------------------------------------------------------------------
SELECT MIN(order_id) INTO @to_ship FROM CustomerOrder WHERE status = 'PROCESSING';

CALL sp_ship_order(@to_ship, 2, 'UPS', @parcels);
SELECT @to_ship AS order_id, @parcels AS parcels_created;
SELECT s.shipment_id, s.trackingNumber, s.status, w.name AS from_warehouse, SUM(oa.allocated_qty) AS units
  FROM Shipment s
  JOIN OrderAllocation oa ON oa.shipment_id = s.shipment_id
  JOIN Warehouse w        ON w.warehouse_id = oa.warehouse_id
  JOIN Fulfillment f      ON f.fulfillment_id = s.fulfillment_id
 WHERE f.order_id = @to_ship
 GROUP BY s.shipment_id, s.trackingNumber, s.status, w.name;

-- T6: delivering the last parcel marks the whole order DELIVERED.
-- (Look the fulfillment up first: MariaDB forbids a trigger from writing a table
--  that its triggering statement reads, so UPDATE … JOIN Fulfillment would fail.)
SELECT fulfillment_id INTO @f FROM Fulfillment WHERE order_id = @to_ship;
UPDATE Shipment SET status = 'DELIVERED', deliveredAt = NOW() WHERE fulfillment_id = @f;
SELECT orderNumber, status FROM CustomerOrder WHERE order_id = @to_ship;


-- -----------------------------------------------------------------------------
-- 6. TRIGGER T2 · return rules
-- -----------------------------------------------------------------------------
SELECT oi.order_item_id, oi.quantity INTO @item, @bought
  FROM OrderItem oi WHERE oi.order_id = @to_ship ORDER BY oi.order_item_id LIMIT 1;
INSERT INTO ReturnRequest (order_id, customer_id, reason)
SELECT order_id, customer_id, 'Too small' FROM CustomerOrder WHERE order_id = @to_ship;
SET @rma = LAST_INSERT_ID();

-- 6a. EXPECTED ERROR — returning more units than were bought
INSERT INTO ReturnItem (return_request_id, order_item_id, quantity) VALUES (@rma, @item, @bought + 1);

-- 6b. a valid return line is accepted
INSERT INTO ReturnItem (return_request_id, order_item_id, quantity) VALUES (@rma, @item, 1);
SELECT ri.*, fn_returnable_quantity(ri.order_item_id) AS still_returnable FROM ReturnItem ri WHERE ri.return_request_id = @rma;


-- -----------------------------------------------------------------------------
-- 7. TRIGGER T3 · refund limits  +  sp_complete_return
-- -----------------------------------------------------------------------------
-- 7a. EXPECTED ERROR — refunds are refused while the return is not approved
INSERT INTO Refund (return_item_id, amount) SELECT return_item_id, 1.00 FROM ReturnItem WHERE return_request_id = @rma;

UPDATE ReturnRequest SET status = 'APPROVED' WHERE return_request_id = @rma;

-- 7b. EXPECTED ERROR — a refund larger than the returned value
INSERT INTO Refund (return_item_id, amount) SELECT return_item_id, 9999.00 FROM ReturnItem WHERE return_request_id = @rma;

-- 7c. the procedure restocks the item and refunds the price paid
CALL sp_complete_return(@rma, TRUE, @refund_total);
SELECT @rma AS return_id, @refund_total AS refunded;
SELECT r.refund_id, r.amount, r.status, t.reference FROM Refund r
  JOIN `Transaction` t ON t.transaction_id = r.transaction_id
  JOIN ReturnItem ri   ON ri.return_item_id = r.return_item_id
 WHERE ri.return_request_id = @rma;
SELECT reason, quantity_change, reference FROM StockMovement WHERE reference = CONCAT('RMA-', @rma);


-- -----------------------------------------------------------------------------
-- 8. TRIGGER T5 · quality-guarantee claims
-- -----------------------------------------------------------------------------
-- 8a. EXPECTED ERROR — a second open claim on the same item
SELECT warranty_id, order_item_id INTO @w, @claim_item FROM WarrantyClaim WHERE status = 'SUBMITTED' LIMIT 1;
INSERT INTO WarrantyClaim (warranty_id, order_item_id, reason) VALUES (@w, @claim_item, 'Same problem again');

-- 8b. EXPECTED ERROR — a claim against a guarantee for a different variant
INSERT INTO WarrantyClaim (warranty_id, order_item_id, reason)
SELECT (SELECT MIN(warranty_id) FROM Warranty WHERE variant_id <> oi.variant_id), oi.order_item_id, 'Wrong item'
  FROM OrderItem oi WHERE oi.order_item_id = @item;


-- -----------------------------------------------------------------------------
-- 9. TRIGGER T7 · the stock ledger is append-only   (EXPECTED ERRORS)
-- -----------------------------------------------------------------------------
UPDATE StockMovement SET quantity_change = 999 WHERE movement_id = 1;
DELETE FROM StockMovement WHERE movement_id = 1;

-- T1 rejection: taking out more than the unreserved stock
INSERT INTO StockMovement (warehouse_id, variant_id, quantity_change, reason, reference)
VALUES (1, 1, -10000, 'ADJUSTMENT', 'DEMO');


-- -----------------------------------------------------------------------------
-- 10. CHECK CONSTRAINTS   (EXPECTED ERRORS)
-- -----------------------------------------------------------------------------
UPDATE ProductVariant SET price = -5 WHERE variant_id = 1;                         -- chk_variant_price
UPDATE Inventory SET quantity_reserved = quantity_on_hand + 1 LIMIT 1;             -- chk_inventory_balance
INSERT INTO CustomerOrder (customer_id, orderNumber, status, totalAmount, shipRecipient, shipLine1, shipCity, shipRegion, shipPostalCode)
VALUES (1, 'BAD-1', 'LOST', 10, 'x', 'x', 'x', 'x', 'x');                           -- chk_order_status
INSERT INTO StockMovement (warehouse_id, variant_id, quantity_change, reason)
VALUES (1, 1, -1, 'PURCHASE_RECEIPT');                                             -- chk_movement_direction


-- -----------------------------------------------------------------------------
-- 10b. PRODUCT PICTURES stored as binary (ProductImage)  +  FUNCTION F6
-- -----------------------------------------------------------------------------
-- The bytes live in ProductImage.data (MEDIUMBLOB). byte_size and sha256 are
-- generated by the database from them, so this listing never reads the bytes.
SELECT image_id, color, sortOrder, mime_type, width, height, byte_size,
       LEFT(sha256, 16) AS sha256_start, alt_text
  FROM ProductImage
 WHERE product_id = 1;

-- F6 fn_product_image: the picture each colour shows. Its key is also its web
-- address, /api/images/{key}, which is how the PHP API sends the bytes.
SELECT pv.color, LEFT(fn_product_image(pv.product_id, pv.color), 16) AS picture_key_start
  FROM ProductVariant pv
 WHERE pv.product_id = 1
 GROUP BY pv.product_id, pv.color;

-- The first bytes of a stored picture: every JPEG photograph starts with the
-- bytes FF D8 FF. The credit names the photographer and the Pixabay page.
SELECT image_id, mime_type, HEX(LEFT(data, 4)) AS first_bytes_hex, credit
  FROM ProductImage
 WHERE product_id = 1
 ORDER BY image_id
 LIMIT 1;

-- 10c. EXPECTED ERRORS — the same file stored twice (uq_image_sha), and a file
--      type the shop does not accept (chk_image_mime)
INSERT INTO ProductImage (product_id, color, mime_type, width, height, alt_text, data)
SELECT product_id, 'White', mime_type, width, height, 'Copy of another picture', data
  FROM ProductImage WHERE product_id = 1 ORDER BY image_id LIMIT 1;                -- uq_image_sha
INSERT INTO ProductImage (product_id, color, mime_type, width, height, alt_text, data)
VALUES (1, 'Olive', 'image/gif', 1, 1, 'A tiny GIF', 0x474946383961010001000000);   -- chk_image_mime


-- -----------------------------------------------------------------------------
-- 11. Every invariant still holds — run database/08_verify_invariants.sql now.
-- -----------------------------------------------------------------------------
