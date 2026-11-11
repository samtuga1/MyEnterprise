-- =============================================================================
-- MyEnterprise — File 04: triggers
-- -----------------------------------------------------------------------------
-- The three required triggers (T1–T3) each react to a data change:
--   T1 trg_stock_movement_apply     AFTER  INSERT StockMovement  → Inventory balance
--   T2 trg_return_item_validate     BEFORE INSERT ReturnItem     → return rules
--   T3 trg_refund_validate          BEFORE INSERT Refund         → refund limits
-- Supporting integrity triggers:
--   T4 trg_allocation_before_insert / trg_allocation_before_update
--                                   cross-table order consistency for allocations
--   T5 trg_warranty_claim_validate  BEFORE INSERT WarrantyClaim  → guarantee rules
--   T6 trg_shipment_delivered       AFTER  UPDATE Shipment       → order DELIVERED
--   T7 trg_stock_movement_no_update / trg_stock_movement_no_delete
--                                   the stock ledger is append-only
--
-- Rejections use SIGNAL SQLSTATE '45000' with a sentence the shop can show.
-- A SIGNAL inside a trigger cancels the whole statement that fired it
-- (InnoDB statement atomicity), so nothing half-applies.
-- =============================================================================

USE myenterprise;

DROP TRIGGER IF EXISTS trg_stock_movement_apply;
DROP TRIGGER IF EXISTS trg_return_item_validate;
DROP TRIGGER IF EXISTS trg_refund_validate;
DROP TRIGGER IF EXISTS trg_allocation_before_insert;
DROP TRIGGER IF EXISTS trg_allocation_before_update;
DROP TRIGGER IF EXISTS trg_warranty_claim_validate;
DROP TRIGGER IF EXISTS trg_shipment_delivered;
DROP TRIGGER IF EXISTS trg_stock_movement_no_update;
DROP TRIGGER IF EXISTS trg_stock_movement_no_delete;

DELIMITER $$

-- -----------------------------------------------------------------------------
-- T1 · trg_stock_movement_apply  (AFTER INSERT ON StockMovement)
-- The ledger drives the balance: every movement row changes
-- Inventory.quantity_on_hand by quantity_change, so on hand always equals the
-- sum of the ledger. Nobody updates quantity_on_hand directly.
--   * incoming stock: refused if the warehouse would exceed its capacity;
--     creates the Inventory row the first time a variant arrives;
--   * outgoing stock: refused if it would take on hand below zero or below
--     the units already reserved for customers.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_stock_movement_apply
AFTER INSERT ON StockMovement
FOR EACH ROW
BEGIN
  DECLARE v_on_hand   INT;
  DECLARE v_reserved  INT;
  DECLARE v_capacity  INT;
  DECLARE v_used      INT;
  DECLARE v_msg       VARCHAR(255);

  IF NEW.quantity_change > 0 THEN
    SELECT MAX(w.capacity) INTO v_capacity
      FROM Warehouse w WHERE w.warehouse_id = NEW.warehouse_id;
    SELECT COALESCE(SUM(i.quantity_on_hand), 0) INTO v_used
      FROM Inventory i WHERE i.warehouse_id = NEW.warehouse_id;

    IF v_used + NEW.quantity_change > v_capacity THEN
      SET v_msg = CONCAT('Warehouse is full: ', v_used, ' of ', v_capacity,
                         ' places used, cannot take ', NEW.quantity_change, ' more.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;

    INSERT INTO Inventory (warehouse_id, variant_id, quantity_on_hand, quantity_reserved)
    VALUES (NEW.warehouse_id, NEW.variant_id, NEW.quantity_change, 0)
    ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + NEW.quantity_change;
  ELSE
    SELECT MAX(quantity_on_hand), MAX(quantity_reserved) INTO v_on_hand, v_reserved
      FROM Inventory
     WHERE warehouse_id = NEW.warehouse_id AND variant_id = NEW.variant_id;

    IF v_on_hand IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This warehouse holds no stock of that item.';
    END IF;

    IF v_on_hand + NEW.quantity_change < v_reserved THEN
      SET v_msg = CONCAT('Only ', v_on_hand - v_reserved, ' unreserved units on hand; cannot remove ',
                         -NEW.quantity_change, '.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;

    UPDATE Inventory
       SET quantity_on_hand = quantity_on_hand + NEW.quantity_change
     WHERE warehouse_id = NEW.warehouse_id AND variant_id = NEW.variant_id;
  END IF;
END$$


-- -----------------------------------------------------------------------------
-- T2 · trg_return_item_validate  (BEFORE INSERT ON ReturnItem)
-- A return line is accepted only if:
--   * the order line belongs to the order named on the return request;
--   * the order was delivered, and the request is within 30 days of the
--     delivery of that item's parcel (requestedAt, so history re-validates);
--   * the units requested plus every earlier non-rejected return of the same
--     line do not exceed the units bought.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_return_item_validate
BEFORE INSERT ON ReturnItem
FOR EACH ROW
BEGIN
  DECLARE v_request_order  INT;
  DECLARE v_requested_at   DATETIME;
  DECLARE v_item_order     INT;
  DECLARE v_purchased      INT;
  DECLARE v_order_status   VARCHAR(30);
  DECLARE v_delivered_at   DATETIME;
  DECLARE v_already        INT;
  DECLARE v_msg            VARCHAR(255);

  SELECT MAX(order_id), MAX(requestedAt) INTO v_request_order, v_requested_at
    FROM ReturnRequest WHERE return_request_id = NEW.return_request_id;

  SELECT MAX(order_id), MAX(quantity) INTO v_item_order, v_purchased
    FROM OrderItem WHERE order_item_id = NEW.order_item_id;

  IF v_item_order IS NULL OR v_item_order <> v_request_order THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That item is not part of the order being returned.';
  END IF;

  SELECT MAX(status) INTO v_order_status FROM CustomerOrder WHERE order_id = v_request_order;
  IF v_order_status <> 'DELIVERED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only delivered orders can be returned.';
  END IF;

  SELECT MAX(s.deliveredAt) INTO v_delivered_at
    FROM OrderAllocation oa
    JOIN Shipment s ON s.shipment_id = oa.shipment_id
   WHERE oa.order_item_id = NEW.order_item_id AND s.status = 'DELIVERED';

  IF v_delivered_at IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That item has not been delivered yet.';
  END IF;

  IF v_requested_at > v_delivered_at + INTERVAL 30 DAY THEN
    SET v_msg = CONCAT('The 30-day return window for this item closed on ',
                       DATE_FORMAT(v_delivered_at + INTERVAL 30 DAY, '%b %e, %Y'), '.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already
    FROM ReturnItem ri
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
   WHERE ri.order_item_id = NEW.order_item_id
     AND rr.status <> 'REJECTED';

  IF v_already + NEW.quantity > v_purchased THEN
    SET v_msg = CONCAT('Only ', GREATEST(v_purchased - v_already, 0), ' of ', v_purchased,
                       ' bought can still be returned.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
END$$


-- -----------------------------------------------------------------------------
-- T3 · trg_refund_validate  (BEFORE INSERT ON Refund)
-- A refund is accepted only if:
--   * its return request is APPROVED (or already being refunded);
--   * the amount fits inside what is still refundable for that line
--     (returned units × historical price − earlier refunds; fn_refundable_amount);
--   * a linked transaction is a REFUND against a payment of the SAME order,
--     for the same amount, and the payment's refunds stay within the payment.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_refund_validate
BEFORE INSERT ON Refund
FOR EACH ROW
BEGIN
  DECLARE v_refundable    DECIMAL(10,2);
  DECLARE v_return_status VARCHAR(30);
  DECLARE v_return_order  INT;
  DECLARE v_tx_type       VARCHAR(30);
  DECLARE v_tx_amount     DECIMAL(10,2);
  DECLARE v_tx_order      INT;
  DECLARE v_pay_amount    DECIMAL(10,2);
  DECLARE v_pay_refunded  DECIMAL(10,2);
  DECLARE v_payment       INT;
  DECLARE v_msg           VARCHAR(255);

  SELECT MAX(rr.status), MAX(rr.order_id) INTO v_return_status, v_return_order
    FROM ReturnItem ri
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
   WHERE ri.return_item_id = NEW.return_item_id;

  IF v_return_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds must belong to a return line.';
  ELSEIF v_return_status NOT IN ('APPROVED', 'REFUNDED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approve the return before refunding it.';
  END IF;

  SET v_refundable = fn_refundable_amount(NEW.return_item_id);
  IF NEW.amount > v_refundable THEN
    SET v_msg = CONCAT('Refund of $', FORMAT(NEW.amount, 2), ' is more than the $',
                       FORMAT(v_refundable, 2), ' still refundable for this item.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  IF NEW.transaction_id IS NOT NULL THEN
    SELECT MAX(t.transactionType), MAX(t.amount), MAX(p.order_id), MAX(p.payment_id), MAX(p.amount)
      INTO v_tx_type, v_tx_amount, v_tx_order, v_payment, v_pay_amount
      FROM `Transaction` t
      JOIN Payment p ON p.payment_id = t.payment_id
     WHERE t.transaction_id = NEW.transaction_id;

    IF v_tx_type IS NULL OR v_tx_type <> 'REFUND' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A refund must be documented by a REFUND transaction.';
    END IF;
    IF v_tx_order <> v_return_order THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That refund transaction belongs to a different order.';
    END IF;
    IF v_tx_amount <> NEW.amount THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refund amount must match its transaction.';
    END IF;

    SET v_pay_refunded = fn_payment_refunded_total(v_payment);
    IF v_pay_refunded > v_pay_amount THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds would exceed the amount paid for this order.';
    END IF;
  END IF;
END$$


-- -----------------------------------------------------------------------------
-- T4 · allocation consistency  (BEFORE INSERT / BEFORE UPDATE ON OrderAllocation)
-- Single foreign keys cannot prove that an allocation's order line, its
-- fulfillment and its shipment all belong to ONE order. These triggers do,
-- and stop an order line from being allocated beyond its quantity.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_allocation_before_insert
BEFORE INSERT ON OrderAllocation
FOR EACH ROW
BEGIN
  DECLARE v_item_order        INT;
  DECLARE v_item_qty          INT;
  DECLARE v_fulfillment_order INT;
  DECLARE v_allocated         INT;

  SELECT MAX(order_id), MAX(quantity) INTO v_item_order, v_item_qty
    FROM OrderItem WHERE order_item_id = NEW.order_item_id;
  SELECT MAX(order_id) INTO v_fulfillment_order
    FROM Fulfillment WHERE fulfillment_id = NEW.fulfillment_id;

  IF v_item_order IS NULL OR v_item_order <> v_fulfillment_order THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Allocation mixes lines from different orders.';
  END IF;

  SELECT COALESCE(SUM(allocated_qty), 0) INTO v_allocated
    FROM OrderAllocation
   WHERE order_item_id = NEW.order_item_id AND status <> 'RELEASED';

  IF v_allocated + NEW.allocated_qty > v_item_qty THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Allocation exceeds the quantity ordered.';
  END IF;
END$$

CREATE TRIGGER trg_allocation_before_update
BEFORE UPDATE ON OrderAllocation
FOR EACH ROW
BEGIN
  DECLARE v_shipment_fulfillment INT;

  IF NEW.order_item_id <> OLD.order_item_id OR NEW.fulfillment_id <> OLD.fulfillment_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An allocation cannot move to another order.';
  END IF;

  IF NEW.shipment_id IS NOT NULL THEN
    SELECT MAX(fulfillment_id) INTO v_shipment_fulfillment
      FROM Shipment WHERE shipment_id = NEW.shipment_id;
    IF v_shipment_fulfillment IS NULL OR v_shipment_fulfillment <> NEW.fulfillment_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shipment belongs to a different order.';
    END IF;
  END IF;

  IF OLD.status IN ('SHIPPED', 'RELEASED') AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shipped or released allocations are final.';
  END IF;
END$$


-- -----------------------------------------------------------------------------
-- T5 · trg_warranty_claim_validate  (BEFORE INSERT ON WarrantyClaim)
--   * the guarantee must cover the exact variant that was bought;
--   * the item must be delivered, and the claim submitted before the
--     guarantee ends (fn_warranty_expires_on: delivery + duration);
--   * one open claim per order line at a time.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_warranty_claim_validate
BEFORE INSERT ON WarrantyClaim
FOR EACH ROW
BEGIN
  DECLARE v_warranty_variant INT;
  DECLARE v_item_variant     INT;
  DECLARE v_expires          DATE;
  DECLARE v_open             INT;
  DECLARE v_msg              VARCHAR(255);

  SELECT MAX(variant_id) INTO v_warranty_variant FROM Warranty WHERE warranty_id = NEW.warranty_id;
  SELECT MAX(variant_id) INTO v_item_variant FROM OrderItem WHERE order_item_id = NEW.order_item_id;

  IF v_warranty_variant IS NULL OR v_item_variant IS NULL OR v_warranty_variant <> v_item_variant THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This guarantee does not cover the item bought.';
  END IF;

  SET v_expires = fn_warranty_expires_on(NEW.order_item_id, NEW.warranty_id);
  IF v_expires IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The guarantee starts once the item is delivered.';
  END IF;
  IF DATE(NEW.submittedAt) > v_expires THEN
    SET v_msg = CONCAT('The quality guarantee for this item ended on ', DATE_FORMAT(v_expires, '%b %e, %Y'), '.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  SELECT COUNT(*) INTO v_open
    FROM WarrantyClaim
   WHERE order_item_id = NEW.order_item_id AND status IN ('SUBMITTED', 'APPROVED');
  IF v_open > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'There is already an open claim for this item.';
  END IF;
END$$


-- -----------------------------------------------------------------------------
-- T6 · trg_shipment_delivered  (AFTER UPDATE ON Shipment)
-- When the last parcel of an order is delivered (no parcel in transit and no
-- unit still reserved), the fulfillment completes and the order is DELIVERED.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_shipment_delivered
AFTER UPDATE ON Shipment
FOR EACH ROW
BEGIN
  DECLARE v_order       INT;
  DECLARE v_in_transit  INT;
  DECLARE v_reserved    INT;

  IF NEW.status = 'DELIVERED' AND OLD.status <> 'DELIVERED' THEN
    SELECT MAX(order_id) INTO v_order FROM Fulfillment WHERE fulfillment_id = NEW.fulfillment_id;

    SELECT COUNT(*) INTO v_in_transit
      FROM Shipment
     WHERE fulfillment_id = NEW.fulfillment_id AND status <> 'DELIVERED';
    SELECT COUNT(*) INTO v_reserved
      FROM OrderAllocation
     WHERE fulfillment_id = NEW.fulfillment_id AND status = 'RESERVED';

    IF v_in_transit = 0 AND v_reserved = 0 THEN
      UPDATE Fulfillment   SET status = 'COMPLETED' WHERE fulfillment_id = NEW.fulfillment_id;
      UPDATE CustomerOrder SET status = 'DELIVERED' WHERE order_id = v_order;
    END IF;
  END IF;
END$$


-- -----------------------------------------------------------------------------
-- T7 · the stock ledger is append-only
-- Mistakes are corrected with a new ADJUSTMENT row, never by editing history.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_stock_movement_no_update
BEFORE UPDATE ON StockMovement
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock movements are permanent. Record an adjustment instead.';
END$$

CREATE TRIGGER trg_stock_movement_no_delete
BEFORE DELETE ON StockMovement
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock movements are permanent. Record an adjustment instead.';
END$$

DELIMITER ;
