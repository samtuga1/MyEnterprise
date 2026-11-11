-- =============================================================================
-- MyEnterprise — File 03: stored procedures (with the three required cursors)
-- -----------------------------------------------------------------------------
--   P1 sp_checkout_cart           CURSOR 1  cart lines → order, stock reservation, payment
--   P2 sp_receive_purchase_order  CURSOR 2  PO lines   → stock ledger (trigger T1 adds stock)
--   P3 sp_cancel_order            CURSOR 3  allocations → reservations released, refund
--   P4 sp_ship_order              CURSOR 4  warehouses → one parcel per warehouse
--   P5 sp_start_fulfillment                 PLACED → PROCESSING, assigns the packer
--   P6 sp_complete_return                   approved return → restock + refunds
--
-- Every procedure owns its transaction:
--   START TRANSACTION … COMMIT, and an EXIT HANDLER that rolls back and
--   re-raises the original error, so a failure leaves no partial data.
-- Business-rule failures use SIGNAL SQLSTATE '45000' with a sentence the shop
-- can show to people as-is. The PHP API calls these procedures; it does not
-- wrap them in a transaction of its own.
--
-- Cursor loops are written in a nested BEGIN … END block that owns the
-- NOT FOUND handler, so a lookup elsewhere cannot end a loop early.
-- =============================================================================

USE myenterprise;

DROP PROCEDURE IF EXISTS sp_checkout_cart;
DROP PROCEDURE IF EXISTS sp_receive_purchase_order;
DROP PROCEDURE IF EXISTS sp_cancel_order;
DROP PROCEDURE IF EXISTS sp_ship_order;
DROP PROCEDURE IF EXISTS sp_start_fulfillment;
DROP PROCEDURE IF EXISTS sp_complete_return;

DELIMITER $$

-- -----------------------------------------------------------------------------
-- P1 · sp_checkout_cart — CURSOR 1
-- Turns the customer's ACTIVE cart into a paid order in one transaction:
--   1. locks the cart (a double-click cannot check out twice);
--   2. CURSOR over cart lines in variant order (every checkout locks stock
--      rows in the same order, so two checkouts cannot deadlock);
--   3. per line: checks the item is still sold, locks its stock rows, checks
--      availability, writes the OrderItem at today's price, then reserves
--      stock per warehouse — preferring a warehouse already used by this
--      order, then one that can supply the whole line (fewer parcels);
--   4. sets the delivery fee, simulates the card capture (Payment +
--      Transaction), and closes the cart.
-- Delivery: EXPRESS 18.00; STANDARD free from 150.00, otherwise 6.00.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_checkout_cart(
  IN  p_customer_id      INT,
  IN  p_delivery_method  VARCHAR(20),
  IN  p_payment_method   VARCHAR(30),
  IN  p_recipient        VARCHAR(100),
  IN  p_line1            VARCHAR(150),
  IN  p_city             VARCHAR(80),
  IN  p_region           VARCHAR(80),
  IN  p_postal_code      VARCHAR(20),
  IN  p_country          CHAR(2),
  OUT p_order_id         INT
)
MODIFIES SQL DATA
COMMENT 'Cursor 1: active cart -> order, warehouse reservations and simulated payment'
BEGIN
  DECLARE v_cart_id      INT;
  DECLARE v_fulfillment  INT;
  DECLARE v_payment      INT;
  DECLARE v_subtotal     DECIMAL(10,2) DEFAULT 0;
  DECLARE v_fee          DECIMAL(10,2) DEFAULT 0;
  DECLARE v_lines        INT DEFAULT 0;
  DECLARE v_msg          VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_order_id = NULL;

  IF p_delivery_method IS NULL OR p_delivery_method NOT IN ('STANDARD', 'EXPRESS') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose standard or express delivery.';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CARD', 'PAYPAL', 'APPLE_PAY') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a payment method.';
  END IF;
  IF COALESCE(TRIM(p_recipient), '') = '' OR COALESCE(TRIM(p_line1), '') = ''
     OR COALESCE(TRIM(p_city), '') = '' OR COALESCE(TRIM(p_region), '') = ''
     OR COALESCE(TRIM(p_postal_code), '') = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Complete the delivery address.';
  END IF;

  START TRANSACTION;

  -- 1. Lock the active cart. A second, concurrent checkout waits here and then
  --    finds the cart already CHECKED_OUT.
  SELECT MAX(cart_id) INTO v_cart_id
    FROM Cart
   WHERE customer_id = p_customer_id AND status = 'ACTIVE'
   FOR UPDATE;

  IF v_cart_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your bag is empty.';
  END IF;

  -- 2. Order header. orderNumber needs the new id, so a unique placeholder is
  --    written first and replaced straight after.
  INSERT INTO CustomerOrder
    (customer_id, orderNumber, status, totalAmount, placedAt, deliveryMethod, shippingFee,
     shipRecipient, shipLine1, shipCity, shipRegion, shipPostalCode, shipCountry)
  VALUES
    (p_customer_id, CONCAT('TMP-', UUID()), 'PLACED', 0, NOW(), p_delivery_method, 0,
     TRIM(p_recipient), TRIM(p_line1), TRIM(p_city), TRIM(p_region), TRIM(p_postal_code),
     UPPER(COALESCE(NULLIF(TRIM(p_country), ''), 'US')));
  SET p_order_id = LAST_INSERT_ID();

  UPDATE CustomerOrder
     SET orderNumber = CONCAT('ME-', 10000 + p_order_id)
   WHERE order_id = p_order_id;

  INSERT INTO Fulfillment (order_id, admin_id, status) VALUES (p_order_id, NULL, 'PENDING');
  SET v_fulfillment = LAST_INSERT_ID();

  -- 3. CURSOR 1 — one pass per cart line.
  cart_lines: BEGIN
    DECLARE v_done        TINYINT DEFAULT 0;
    DECLARE v_variant_id  INT;
    DECLARE v_quantity    INT;
    DECLARE v_price       DECIMAL(10,2);
    DECLARE v_sellable    TINYINT;
    DECLARE v_sku         VARCHAR(80);
    DECLARE v_available   INT;
    DECLARE v_order_item  INT;
    DECLARE v_remaining   INT;
    DECLARE v_wh          INT;
    DECLARE v_take        INT;

    DECLARE cart_cursor CURSOR FOR
      SELECT ci.variant_id, ci.quantity, pv.price, (pv.isActive AND p.isActive), pv.sku
        FROM CartItem ci
        JOIN ProductVariant pv ON pv.variant_id = ci.variant_id
        JOIN Product p        ON p.product_id  = pv.product_id
       WHERE ci.cart_id = v_cart_id
       ORDER BY ci.variant_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN cart_cursor;
    read_line: LOOP
      FETCH cart_cursor INTO v_variant_id, v_quantity, v_price, v_sellable, v_sku;
      IF v_done = 1 THEN
        LEAVE read_line;
      END IF;

      SET v_lines = v_lines + 1;

      IF v_sellable = 0 THEN
        SET v_msg = CONCAT('Item ', v_sku, ' is no longer sold. Remove it from your bag to continue.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
      END IF;

      -- Lock every stock row of this variant, then check the total.
      SELECT COALESCE(SUM(quantity_on_hand - quantity_reserved), 0) INTO v_available
        FROM Inventory
       WHERE variant_id = v_variant_id
       FOR UPDATE;

      IF v_available < v_quantity THEN
        SET v_msg = CONCAT('Only ', v_available, ' left of ', v_sku, '. Lower the quantity to continue.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
      END IF;

      INSERT INTO OrderItem (order_id, variant_id, quantity, unitPrice)
      VALUES (p_order_id, v_variant_id, v_quantity, v_price);
      SET v_order_item = LAST_INSERT_ID();
      SET v_subtotal   = v_subtotal + v_quantity * v_price;

      -- Reserve the units, splitting across warehouses only when needed.
      SET v_remaining = v_quantity;
      WHILE v_remaining > 0 DO
        SELECT MAX(pick.warehouse_id), MAX(pick.available) INTO v_wh, v_take
          FROM (SELECT i.warehouse_id,
                       i.quantity_on_hand - i.quantity_reserved AS available
                  FROM Inventory i
                 WHERE i.variant_id = v_variant_id
                   AND i.quantity_on_hand - i.quantity_reserved > 0
                 ORDER BY EXISTS (SELECT 1 FROM OrderAllocation oa
                                   WHERE oa.fulfillment_id = v_fulfillment
                                     AND oa.warehouse_id  = i.warehouse_id) DESC,
                          (i.quantity_on_hand - i.quantity_reserved >= v_remaining) DESC,
                          i.quantity_on_hand - i.quantity_reserved DESC,
                          i.warehouse_id
                 LIMIT 1) AS pick;

        IF v_wh IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock changed during checkout. Please try again.';
        END IF;

        SET v_take = LEAST(v_take, v_remaining);

        UPDATE Inventory
           SET quantity_reserved = quantity_reserved + v_take
         WHERE warehouse_id = v_wh AND variant_id = v_variant_id;

        INSERT INTO OrderAllocation (order_item_id, warehouse_id, fulfillment_id, shipment_id, allocated_qty, status)
        VALUES (v_order_item, v_wh, v_fulfillment, NULL, v_take, 'RESERVED');

        SET v_remaining = v_remaining - v_take;
      END WHILE;
    END LOOP read_line;
    CLOSE cart_cursor;
  END cart_lines;

  IF v_lines = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your bag is empty.';
  END IF;

  -- 4. Totals, simulated payment, close the cart.
  SET v_fee = CASE
                WHEN p_delivery_method = 'EXPRESS' THEN 18.00
                WHEN v_subtotal >= 150.00          THEN 0.00
                ELSE 6.00
              END;

  UPDATE CustomerOrder
     SET totalAmount = v_subtotal + v_fee,
         shippingFee = v_fee
   WHERE order_id = p_order_id;

  INSERT INTO Payment (order_id, amount, status, method)
  VALUES (p_order_id, v_subtotal + v_fee, 'CAPTURED', p_payment_method);
  SET v_payment = LAST_INSERT_ID();

  INSERT INTO `Transaction` (payment_id, transactionType, amount, status, reference)
  VALUES (v_payment, 'CAPTURE', v_subtotal + v_fee, 'SUCCESS', CONCAT('SIM-CAP-', v_payment));

  UPDATE Cart SET status = 'CHECKED_OUT' WHERE cart_id = v_cart_id;

  COMMIT;
END$$


-- -----------------------------------------------------------------------------
-- P2 · sp_receive_purchase_order — CURSOR 2
-- Receives a purchase order in full, exactly once:
--   * locks the PO row; RECEIVED or CANCELLED orders are refused, so a
--     repeated click cannot add the stock twice;
--   * CURSOR over the PO lines writes one PURCHASE_RECEIPT StockMovement per
--     line. Trigger T1 (trg_stock_movement_apply) adds the units to Inventory
--     and enforces warehouse capacity — the procedure never edits Inventory;
--   * marks the PO RECEIVED with the receipt time (used for real lead times).
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_receive_purchase_order(
  IN  p_purchase_order_id  INT,
  OUT p_lines_received     INT,
  OUT p_units_received     INT
)
MODIFIES SQL DATA
COMMENT 'Cursor 2: purchase-order lines -> stock ledger; PO marked RECEIVED once'
BEGIN
  DECLARE v_status     VARCHAR(30);
  DECLARE v_warehouse  INT;
  DECLARE v_msg        VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_lines_received = 0;
  SET p_units_received = 0;

  START TRANSACTION;

  SELECT MAX(status), MAX(warehouse_id) INTO v_status, v_warehouse
    FROM PurchaseOrder
   WHERE purchase_order_id = p_purchase_order_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchase order not found.';
  ELSEIF v_status = 'RECEIVED' THEN
    SET v_msg = CONCAT('PO-', p_purchase_order_id, ' was already received. Stock was not added again.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  ELSEIF v_status <> 'ORDERED' THEN
    SET v_msg = CONCAT('PO-', p_purchase_order_id, ' is ', LOWER(v_status), ' and cannot be received.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  po_lines: BEGIN
    DECLARE v_done     TINYINT DEFAULT 0;
    DECLARE v_variant  INT;
    DECLARE v_quantity INT;

    DECLARE po_cursor CURSOR FOR
      SELECT variant_id, quantity
        FROM PurchaseOrderItem
       WHERE purchase_order_id = p_purchase_order_id
       ORDER BY variant_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN po_cursor;
    read_line: LOOP
      FETCH po_cursor INTO v_variant, v_quantity;
      IF v_done = 1 THEN
        LEAVE read_line;
      END IF;

      -- Trigger T1 turns this ledger row into an Inventory increase.
      INSERT INTO StockMovement (warehouse_id, variant_id, quantity_change, reason, movedAt, reference)
      VALUES (v_warehouse, v_variant, v_quantity, 'PURCHASE_RECEIPT', NOW(),
              CONCAT('PO-', p_purchase_order_id));

      SET p_lines_received = p_lines_received + 1;
      SET p_units_received = p_units_received + v_quantity;
    END LOOP read_line;
    CLOSE po_cursor;
  END po_lines;

  IF p_lines_received = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This purchase order has no lines to receive.';
  END IF;

  UPDATE PurchaseOrder
     SET status = 'RECEIVED', receivedAt = NOW()
   WHERE purchase_order_id = p_purchase_order_id;

  COMMIT;
END$$


-- -----------------------------------------------------------------------------
-- P3 · sp_cancel_order — CURSOR 3
-- Cancels an order that has not shipped:
--   * customers may cancel while the order is PLACED; staff also while it is
--     PROCESSING (being packed). Shipped orders go through returns instead;
--   * CURSOR over the RESERVED allocations gives each unit back to its
--     warehouse and marks the allocation RELEASED (history is kept);
--   * records the OrderCancellation (0..1 per order, enforced by UNIQUE);
--   * refunds whatever was captured as one simulated REFUND transaction.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_cancel_order(
  IN  p_order_id      INT,
  IN  p_initiated_by  VARCHAR(10),
  IN  p_admin_id      INT,
  IN  p_reason        VARCHAR(255),
  OUT p_units_released INT,
  OUT p_refunded       DECIMAL(10,2)
)
MODIFIES SQL DATA
COMMENT 'Cursor 3: release reserved stock per allocation, record cancellation, refund'
BEGIN
  DECLARE v_status    VARCHAR(30);
  DECLARE v_number    VARCHAR(50);
  DECLARE v_payment   INT;
  DECLARE v_captured  DECIMAL(10,2);
  DECLARE v_msg       VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_units_released = 0;
  SET p_refunded = 0;

  IF p_initiated_by NOT IN ('CUSTOMER', 'ADMIN') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation must be made by the customer or a staff member.';
  END IF;
  IF p_initiated_by = 'ADMIN' AND p_admin_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A staff cancellation needs the staff member.';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Give a reason for the cancellation.';
  END IF;

  START TRANSACTION;

  SELECT MAX(status), MAX(orderNumber) INTO v_status, v_number
    FROM CustomerOrder
   WHERE order_id = p_order_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found.';
  ELSEIF v_status = 'CANCELLED' THEN
    SET v_msg = CONCAT('Order ', v_number, ' is already cancelled.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  ELSEIF v_status IN ('SHIPPED', 'DELIVERED') THEN
    SET v_msg = CONCAT('Order ', v_number, ' has shipped. Start a return once it arrives.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  ELSEIF v_status = 'PROCESSING' AND p_initiated_by = 'CUSTOMER' THEN
    SET v_msg = CONCAT('Order ', v_number, ' is being packed. Contact customer care to cancel it.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  release_stock: BEGIN
    DECLARE v_done       TINYINT DEFAULT 0;
    DECLARE v_allocation INT;
    DECLARE v_warehouse  INT;
    DECLARE v_variant    INT;
    DECLARE v_qty        INT;

    DECLARE alloc_cursor CURSOR FOR
      SELECT oa.allocation_id, oa.warehouse_id, oi.variant_id, oa.allocated_qty
        FROM OrderAllocation oa
        JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id
       WHERE oi.order_id = p_order_id
         AND oa.status = 'RESERVED'
       ORDER BY oi.variant_id, oa.warehouse_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN alloc_cursor;
    read_allocation: LOOP
      FETCH alloc_cursor INTO v_allocation, v_warehouse, v_variant, v_qty;
      IF v_done = 1 THEN
        LEAVE read_allocation;
      END IF;

      UPDATE Inventory
         SET quantity_reserved = quantity_reserved - v_qty
       WHERE warehouse_id = v_warehouse AND variant_id = v_variant;

      UPDATE OrderAllocation
         SET status = 'RELEASED'
       WHERE allocation_id = v_allocation;

      SET p_units_released = p_units_released + v_qty;
    END LOOP read_allocation;
    CLOSE alloc_cursor;
  END release_stock;

  INSERT INTO OrderCancellation (order_id, cancelledBy, reason, cancelledAt, initiatedBy)
  VALUES (p_order_id, IF(p_initiated_by = 'ADMIN', p_admin_id, NULL), TRIM(p_reason), NOW(), p_initiated_by);

  -- Refund everything captured and not yet refunded (simulated).
  SELECT MAX(payment_id) INTO v_payment
    FROM Payment
   WHERE order_id = p_order_id AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED')
   FOR UPDATE;

  IF v_payment IS NOT NULL THEN
    SELECT amount - fn_payment_refunded_total(payment_id) INTO v_captured
      FROM Payment WHERE payment_id = v_payment;

    IF v_captured > 0 THEN
      INSERT INTO `Transaction` (payment_id, transactionType, amount, status, reference)
      VALUES (v_payment, 'REFUND', v_captured, 'SUCCESS', CONCAT('SIM-RFD-C', v_payment));
      SET p_refunded = v_captured;
    END IF;

    UPDATE Payment SET status = 'REFUNDED' WHERE payment_id = v_payment;
  END IF;

  UPDATE Fulfillment SET status = 'CANCELLED' WHERE order_id = p_order_id;
  UPDATE CustomerOrder SET status = 'CANCELLED' WHERE order_id = p_order_id;

  COMMIT;
END$$


-- -----------------------------------------------------------------------------
-- P4 · sp_ship_order — CURSOR 4
-- Ships every reserved unit of an order. CURSOR over the warehouses holding
-- reservations: each warehouse becomes one Shipment (parcel) with its own
-- tracking number. For each parcel the reservation is released and a
-- SALE_SHIPMENT ledger row removes the units (trigger T1 updates on hand),
-- then the allocations point at the parcel.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_ship_order(
  IN  p_order_id   INT,
  IN  p_admin_id   INT,
  IN  p_carrier    VARCHAR(40),
  OUT p_shipments  INT
)
MODIFIES SQL DATA
COMMENT 'Cursor 4: one shipment per warehouse; reservations become stock movements'
BEGIN
  DECLARE v_status       VARCHAR(30);
  DECLARE v_number       VARCHAR(50);
  DECLARE v_fulfillment  INT;
  DECLARE v_msg          VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_shipments = 0;

  IF p_admin_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A staff member must ship the order.';
  END IF;
  IF COALESCE(TRIM(p_carrier), '') = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a carrier.';
  END IF;

  START TRANSACTION;

  SELECT MAX(status), MAX(orderNumber) INTO v_status, v_number
    FROM CustomerOrder
   WHERE order_id = p_order_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found.';
  ELSEIF v_status NOT IN ('PLACED', 'PROCESSING') THEN
    SET v_msg = CONCAT('Order ', v_number, ' is ', LOWER(v_status), ' and cannot be shipped.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  SELECT MAX(fulfillment_id) INTO v_fulfillment
    FROM Fulfillment
   WHERE order_id = p_order_id
   FOR UPDATE;

  parcels: BEGIN
    DECLARE v_done      TINYINT DEFAULT 0;
    DECLARE v_warehouse INT;
    DECLARE v_shipment  INT;

    DECLARE warehouse_cursor CURSOR FOR
      SELECT DISTINCT warehouse_id
        FROM OrderAllocation
       WHERE fulfillment_id = v_fulfillment AND status = 'RESERVED'
       ORDER BY warehouse_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN warehouse_cursor;
    read_warehouse: LOOP
      FETCH warehouse_cursor INTO v_warehouse;
      IF v_done = 1 THEN
        LEAVE read_warehouse;
      END IF;

      INSERT INTO Shipment (fulfillment_id, trackingNumber, status, carrier, shippedAt)
      VALUES (v_fulfillment, CONCAT('TMP-', UUID()), 'IN_TRANSIT', TRIM(p_carrier), NOW());
      SET v_shipment = LAST_INSERT_ID();

      UPDATE Shipment
         SET trackingNumber = CONCAT(UPPER(LEFT(TRIM(p_carrier), 3)), '-', LPAD(v_shipment, 9, '0'))
       WHERE shipment_id = v_shipment;

      -- Reservation ends …
      UPDATE Inventory i
        JOIN (SELECT oi.variant_id, SUM(oa.allocated_qty) AS qty
                FROM OrderAllocation oa
                JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id
               WHERE oa.fulfillment_id = v_fulfillment
                 AND oa.warehouse_id   = v_warehouse
                 AND oa.status = 'RESERVED'
               GROUP BY oi.variant_id) AS r
          ON r.variant_id = i.variant_id
         SET i.quantity_reserved = i.quantity_reserved - r.qty
       WHERE i.warehouse_id = v_warehouse;

      -- … and the units leave the building through the ledger (trigger T1).
      INSERT INTO StockMovement (warehouse_id, variant_id, quantity_change, reason, movedAt, reference)
      SELECT v_warehouse, oi.variant_id, -oa.allocated_qty, 'SALE_SHIPMENT', NOW(), v_number
        FROM OrderAllocation oa
        JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id
       WHERE oa.fulfillment_id = v_fulfillment
         AND oa.warehouse_id   = v_warehouse
         AND oa.status = 'RESERVED';

      UPDATE OrderAllocation
         SET status = 'SHIPPED', shipment_id = v_shipment
       WHERE fulfillment_id = v_fulfillment
         AND warehouse_id   = v_warehouse
         AND status = 'RESERVED';

      SET p_shipments = p_shipments + 1;
    END LOOP read_warehouse;
    CLOSE warehouse_cursor;
  END parcels;

  IF p_shipments = 0 THEN
    SET v_msg = CONCAT('Order ', v_number, ' has nothing left to ship.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  UPDATE Fulfillment
     SET status = 'SHIPPED', admin_id = COALESCE(admin_id, p_admin_id)
   WHERE fulfillment_id = v_fulfillment;

  UPDATE CustomerOrder SET status = 'SHIPPED' WHERE order_id = p_order_id;

  COMMIT;
END$$


-- -----------------------------------------------------------------------------
-- P5 · sp_start_fulfillment
-- A staff member takes a PLACED order: the fulfillment is assigned to them and
-- the order shows "Processing" (customers can no longer self-cancel).
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_start_fulfillment(
  IN p_order_id  INT,
  IN p_admin_id  INT
)
MODIFIES SQL DATA
COMMENT 'Assign the packer; PLACED -> PROCESSING'
BEGIN
  DECLARE v_status VARCHAR(30);
  DECLARE v_number VARCHAR(50);
  DECLARE v_msg    VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT MAX(status), MAX(orderNumber) INTO v_status, v_number
    FROM CustomerOrder WHERE order_id = p_order_id FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found.';
  ELSEIF v_status <> 'PLACED' THEN
    SET v_msg = CONCAT('Order ', v_number, ' is ', LOWER(v_status), '; only new orders can be started.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  UPDATE Fulfillment   SET admin_id = p_admin_id, status = 'PROCESSING' WHERE order_id = p_order_id;
  UPDATE CustomerOrder SET status = 'PROCESSING' WHERE order_id = p_order_id;

  COMMIT;
END$$


-- -----------------------------------------------------------------------------
-- P6 · sp_complete_return
-- Closes an APPROVED return once the parcel is back:
--   * optional restock: a RETURN_RESTOCK ledger row per line, into the
--     warehouse that shipped it (trigger T1 updates Inventory);
--   * one simulated REFUND transaction per line (Refund.transaction_id is
--     UNIQUE) for the historical price; trigger T3 re-checks every refund;
--   * the payment becomes PARTIALLY_REFUNDED or REFUNDED.
-- Set-based statements, no cursor: each line is independent.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_complete_return(
  IN  p_return_request_id  INT,
  IN  p_restock            BOOLEAN,
  OUT p_refund_total       DECIMAL(10,2)
)
MODIFIES SQL DATA
COMMENT 'Approved return -> optional restock + refunds; return becomes REFUNDED'
BEGIN
  DECLARE v_status   VARCHAR(30);
  DECLARE v_order    INT;
  DECLARE v_payment  INT;
  DECLARE v_amount   DECIMAL(10,2);
  DECLARE v_msg      VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_refund_total = 0;

  START TRANSACTION;

  SELECT MAX(status), MAX(order_id) INTO v_status, v_order
    FROM ReturnRequest
   WHERE return_request_id = p_return_request_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Return not found.';
  ELSEIF v_status = 'REFUNDED' THEN
    SET v_msg = CONCAT('Return RMA-', p_return_request_id, ' was already refunded.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  ELSEIF v_status <> 'APPROVED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approve the return before refunding it.';
  END IF;

  SELECT MAX(payment_id) INTO v_payment
    FROM Payment
   WHERE order_id = v_order AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED')
   FOR UPDATE;

  IF v_payment IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This order has no captured payment to refund.';
  END IF;

  IF (SELECT COUNT(*) FROM ReturnItem WHERE return_request_id = p_return_request_id) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This return has no items to refund.';
  END IF;

  IF p_restock THEN
    INSERT INTO StockMovement (warehouse_id, variant_id, quantity_change, reason, movedAt, reference)
    SELECT (SELECT MIN(oa.warehouse_id)
              FROM OrderAllocation oa
             WHERE oa.order_item_id = ri.order_item_id AND oa.status = 'SHIPPED'),
           oi.variant_id, ri.quantity, 'RETURN_RESTOCK', NOW(), CONCAT('RMA-', p_return_request_id)
      FROM ReturnItem ri
      JOIN OrderItem oi ON oi.order_item_id = ri.order_item_id
     WHERE ri.return_request_id = p_return_request_id;
  END IF;

  INSERT INTO `Transaction` (payment_id, transactionType, amount, status, reference)
  SELECT v_payment, 'REFUND', fn_refundable_amount(ri.return_item_id), 'SUCCESS',
         CONCAT('SIM-RFD-R', ri.return_item_id)
    FROM ReturnItem ri
   WHERE ri.return_request_id = p_return_request_id
     AND fn_refundable_amount(ri.return_item_id) > 0;

  -- Trigger T3 validates each of these rows.
  INSERT INTO Refund (return_item_id, transaction_id, amount, status)
  SELECT ri.return_item_id, t.transaction_id, t.amount, 'COMPLETED'
    FROM ReturnItem ri
    JOIN `Transaction` t ON t.reference = CONCAT('SIM-RFD-R', ri.return_item_id)
   WHERE ri.return_request_id = p_return_request_id;

  SELECT COALESCE(SUM(r.amount), 0) INTO p_refund_total
    FROM Refund r
    JOIN ReturnItem ri ON ri.return_item_id = r.return_item_id
   WHERE ri.return_request_id = p_return_request_id
     AND r.status = 'COMPLETED';

  SELECT amount INTO v_amount FROM Payment WHERE payment_id = v_payment;

  UPDATE Payment
     SET status = CASE WHEN fn_payment_refunded_total(v_payment) >= v_amount THEN 'REFUNDED'
                       WHEN fn_payment_refunded_total(v_payment) > 0         THEN 'PARTIALLY_REFUNDED'
                       ELSE 'CAPTURED' END
   WHERE payment_id = v_payment;

  UPDATE ReturnRequest
     SET status = 'REFUNDED', resolvedAt = NOW()
   WHERE return_request_id = p_return_request_id;

  COMMIT;
END$$

DELIMITER ;
