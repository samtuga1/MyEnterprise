-- =============================================================================
-- Q6 · Return rates, reasons and refunds by product
-- -----------------------------------------------------------------------------
-- Business question
--   Which products come back most often relative to what was delivered, what
--   is the main reason, and how much money has been refunded for them?
-- Definitions
--   Cohort = orders placed in the period. Units delivered = units on those
--   orders that reached DELIVERED. Units returned = units on non-rejected
--   return requests for the same orders. Return rate = returned / delivered.
--   Refunded = COMPLETED refunds. Each measure is aggregated in its own CTE
--   before joining, so one-to-many joins cannot inflate the numbers.
-- Tables (7): Product, ProductVariant, OrderItem, CustomerOrder, ReturnItem,
--             ReturnRequest, Refund
-- Techniques: four CTEs, ROW_NUMBER() for the most common reason,
--             NULLIF to avoid division by zero.
-- =============================================================================

SET @date_from = '2026-01-01';
SET @date_to   = '2026-12-31';

-- @query
WITH cohort AS (
  SELECT oi.order_item_id, oi.quantity, pv.product_id, o.status
    FROM CustomerOrder o
    JOIN OrderItem oi      ON oi.order_id   = o.order_id
    JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
   WHERE o.placedAt >= CAST(@date_from AS DATE)
     AND o.placedAt <  CAST(@date_to AS DATE) + INTERVAL 1 DAY
),
delivered AS (
  SELECT product_id, SUM(quantity) AS units_delivered
    FROM cohort WHERE status = 'DELIVERED'
   GROUP BY product_id
),
returned AS (
  SELECT co.product_id,
         SUM(ri.quantity)                     AS units_returned,
         COUNT(DISTINCT rr.return_request_id) AS return_requests
    FROM ReturnItem ri
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
    JOIN cohort co        ON co.order_item_id     = ri.order_item_id
   WHERE rr.status <> 'REJECTED'
   GROUP BY co.product_id
),
refunded AS (
  SELECT co.product_id, SUM(r.amount) AS refunded
    FROM Refund r
    JOIN ReturnItem ri ON ri.return_item_id = r.return_item_id
    JOIN cohort co     ON co.order_item_id  = ri.order_item_id
   WHERE r.status = 'COMPLETED'
   GROUP BY co.product_id
),
reasons AS (
  SELECT co.product_id, rr.reason,
         ROW_NUMBER() OVER (PARTITION BY co.product_id ORDER BY COUNT(*) DESC, rr.reason) AS position
    FROM ReturnRequest rr
    JOIN ReturnItem ri ON ri.return_request_id = rr.return_request_id
    JOIN cohort co     ON co.order_item_id     = ri.order_item_id
   WHERE rr.status <> 'REJECTED'
   GROUP BY co.product_id, rr.reason
)
SELECT p.name                                                                 AS product,
       p.brand,
       d.units_delivered,
       r.units_returned,
       r.return_requests,
       ROUND(100 * r.units_returned / NULLIF(d.units_delivered, 0), 1)        AS return_rate_pct,
       COALESCE(f.refunded, 0)                                                AS refunded,
       rs.reason                                                              AS top_reason
  FROM returned r
  JOIN Product p        ON p.product_id  = r.product_id
  LEFT JOIN delivered d ON d.product_id  = r.product_id
  LEFT JOIN refunded f  ON f.product_id  = r.product_id
  LEFT JOIN reasons rs  ON rs.product_id = r.product_id AND rs.position = 1
 ORDER BY return_rate_pct DESC, r.units_returned DESC, p.name;
