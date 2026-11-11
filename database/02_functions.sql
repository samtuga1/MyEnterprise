-- =============================================================================
-- MyEnterprise — File 02: stored functions
-- -----------------------------------------------------------------------------
-- Small, reusable calculations. Procedures, triggers, views, the business
-- queries and the PHP API all call these, so a rule is written once.
--
-- Every lookup here uses an aggregate (SUM/MAX/COALESCE), which always returns
-- exactly one row. A plain SELECT … INTO that finds nothing raises a NOT FOUND
-- condition, and that condition could stop a caller's cursor loop early.
-- (F6 uses scalar subqueries, which return NULL instead of raising it.)
--
-- phpMyAdmin: import this file as-is; it contains DELIMITER statements.
-- =============================================================================

USE myenterprise;

DROP FUNCTION IF EXISTS fn_available_stock;
DROP FUNCTION IF EXISTS fn_returnable_quantity;
DROP FUNCTION IF EXISTS fn_refundable_amount;
DROP FUNCTION IF EXISTS fn_warranty_expires_on;
DROP FUNCTION IF EXISTS fn_payment_refunded_total;
DROP FUNCTION IF EXISTS fn_product_image;

DELIMITER $$

-- F1. Units of a variant that can still be sold: on hand minus reserved,
--     summed over every warehouse.
CREATE FUNCTION fn_available_stock(p_variant_id INT)
RETURNS INT
NOT DETERMINISTIC
READS SQL DATA
COMMENT 'Sellable units of a variant across all warehouses'
BEGIN
  DECLARE v_available INT;
  SELECT COALESCE(SUM(quantity_on_hand - quantity_reserved), 0)
    INTO v_available
    FROM Inventory
   WHERE variant_id = p_variant_id;
  RETURN v_available;
END$$

-- F2. How many units of an order line can still be returned:
--     purchased quantity minus every non-rejected return of that line.
CREATE FUNCTION fn_returnable_quantity(p_order_item_id INT)
RETURNS INT
NOT DETERMINISTIC
READS SQL DATA
COMMENT 'Purchased units minus units already on a non-rejected return'
BEGIN
  DECLARE v_purchased INT;
  DECLARE v_returned  INT;

  SELECT COALESCE(MAX(quantity), 0) INTO v_purchased
    FROM OrderItem
   WHERE order_item_id = p_order_item_id;

  SELECT COALESCE(SUM(ri.quantity), 0) INTO v_returned
    FROM ReturnItem ri
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
   WHERE ri.order_item_id = p_order_item_id
     AND rr.status <> 'REJECTED';

  RETURN GREATEST(v_purchased - v_returned, 0);
END$$

-- F3. Money still refundable for one return line:
--     returned units × the historical unit price, minus refunds already
--     issued (pending or completed) for that line.
CREATE FUNCTION fn_refundable_amount(p_return_item_id INT)
RETURNS DECIMAL(10,2)
NOT DETERMINISTIC
READS SQL DATA
COMMENT 'Returned quantity x historical price, less refunds already issued'
BEGIN
  DECLARE v_value    DECIMAL(10,2);
  DECLARE v_refunded DECIMAL(10,2);

  SELECT COALESCE(MAX(ri.quantity * oi.unitPrice), 0) INTO v_value
    FROM ReturnItem ri
    JOIN OrderItem oi ON oi.order_item_id = ri.order_item_id
   WHERE ri.return_item_id = p_return_item_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
    FROM Refund
   WHERE return_item_id = p_return_item_id
     AND status <> 'FAILED';

  RETURN GREATEST(v_value - v_refunded, 0);
END$$

-- F4. Last day a quality guarantee covers an order line.
--     Coverage starts when the parcel holding the item is delivered,
--     and lasts duration_months. NULL = not delivered yet (no coverage).
CREATE FUNCTION fn_warranty_expires_on(p_order_item_id INT, p_warranty_id INT)
RETURNS DATE
NOT DETERMINISTIC
READS SQL DATA
COMMENT 'Delivery date + warranty duration; NULL until the item is delivered'
BEGIN
  DECLARE v_delivered DATETIME;
  DECLARE v_months    INT;

  SELECT MAX(s.deliveredAt) INTO v_delivered
    FROM OrderAllocation oa
    JOIN Shipment s ON s.shipment_id = oa.shipment_id
   WHERE oa.order_item_id = p_order_item_id
     AND s.status = 'DELIVERED';

  SELECT MAX(duration_months) INTO v_months
    FROM Warranty
   WHERE warranty_id = p_warranty_id;

  IF v_delivered IS NULL OR v_months IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN DATE(v_delivered + INTERVAL v_months MONTH);
END$$

-- F5. Total successfully refunded against one payment
--     (return refunds and cancellation refunds alike).
CREATE FUNCTION fn_payment_refunded_total(p_payment_id INT)
RETURNS DECIMAL(10,2)
NOT DETERMINISTIC
READS SQL DATA
COMMENT 'Sum of successful REFUND transactions for a payment'
BEGIN
  DECLARE v_total DECIMAL(10,2);
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM `Transaction`
   WHERE payment_id = p_payment_id
     AND transactionType = 'REFUND'
     AND status = 'SUCCESS';
  RETURN v_total;
END$$

-- F6. Which picture to show for a product in one colour: that colour's main
--     picture, otherwise a picture made for every colour (color IS NULL).
--     With p_color NULL it answers for the product as a whole: its first
--     colour, falling back to any picture of the product.
--     Returns the picture's key (its SHA-256), which is also its web address,
--     /api/images/{key}. NULL means the product has no picture yet.
CREATE FUNCTION fn_product_image(p_product_id INT, p_color VARCHAR(50))
RETURNS CHAR(64)
NOT DETERMINISTIC
READS SQL DATA
COMMENT 'Key (SHA-256) of the main picture for a product colour; NULL if none'
BEGIN
  DECLARE v_color VARCHAR(50) DEFAULT p_color;
  IF v_color IS NULL THEN
    SET v_color = (SELECT color FROM ProductVariant
                    WHERE product_id = p_product_id
                    ORDER BY isActive DESC, sortOrder, variant_id
                    LIMIT 1);
  END IF;
  RETURN (SELECT sha256 FROM ProductImage
           WHERE product_id = p_product_id
             AND (color <=> v_color OR color IS NULL OR p_color IS NULL)
           ORDER BY (color <=> v_color) DESC, (color IS NULL) DESC, sortOrder, image_id
           LIMIT 1);
END$$

DELIMITER ;
