-- =============================================================================
-- MyEnterprise — File 05: views
-- -----------------------------------------------------------------------------
-- Read-only shapes the storefront and admin screens use again and again.
-- They hide joins, never business rules.
-- =============================================================================

USE myenterprise;

-- Stock per variant over all warehouses.
CREATE OR REPLACE VIEW v_variant_stock AS
SELECT pv.variant_id,
       pv.product_id,
       pv.sku,
       pv.configuration                                        AS size_label,
       pv.color,
       pv.price,
       COALESCE(SUM(i.quantity_on_hand), 0)                    AS on_hand,
       COALESCE(SUM(i.quantity_reserved), 0)                   AS reserved,
       COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved), 0) AS available
  FROM ProductVariant pv
  LEFT JOIN Inventory i ON i.variant_id = pv.variant_id
 GROUP BY pv.variant_id, pv.product_id, pv.sku, pv.configuration, pv.color, pv.price;

-- One row per product for listings: price range, colours, stock, categories.
CREATE OR REPLACE VIEW v_product_listing AS
SELECT p.product_id,
       p.slug,
       p.name,
       p.brand,
       fn_product_image(p.product_id, NULL) AS image_key,
       p.isActive,
       p.createdAt,
       MIN(vs.price)                         AS min_price,
       MAX(vs.price)                         AS max_price,
       COUNT(DISTINCT vs.color)              AS color_count,
       COUNT(vs.variant_id)                  AS variant_count,
       COALESCE(SUM(vs.available), 0)        AS available
  FROM Product p
  LEFT JOIN v_variant_stock vs ON vs.product_id = p.product_id
 GROUP BY p.product_id, p.slug, p.name, p.brand, p.isActive, p.createdAt;

-- Orders with their customer and money position.
CREATE OR REPLACE VIEW v_order_overview AS
SELECT o.order_id,
       o.orderNumber,
       o.status,
       o.placedAt,
       o.totalAmount,
       o.shippingFee,
       o.deliveryMethod,
       c.customer_id,
       CONCAT(c.firstName, ' ', c.lastName)                                    AS customer_name,
       c.email                                                                 AS customer_email,
       (SELECT COALESCE(SUM(oi.quantity), 0) FROM OrderItem oi WHERE oi.order_id = o.order_id) AS units,
       (SELECT COALESCE(SUM(t.amount), 0)
          FROM Payment p JOIN `Transaction` t ON t.payment_id = p.payment_id
         WHERE p.order_id = o.order_id AND t.transactionType = 'CAPTURE' AND t.status = 'SUCCESS') AS captured,
       (SELECT COALESCE(SUM(t.amount), 0)
          FROM Payment p JOIN `Transaction` t ON t.payment_id = p.payment_id
         WHERE p.order_id = o.order_id AND t.transactionType = 'REFUND' AND t.status = 'SUCCESS')  AS refunded
  FROM CustomerOrder o
  JOIN Customer c ON c.customer_id = o.customer_id;
