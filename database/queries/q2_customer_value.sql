-- =============================================================================
-- Q2 · Most valuable customers and repeat purchasing
-- -----------------------------------------------------------------------------
-- Business question
--   Who are the most valuable customers in a period once refunds are taken
--   off, how often do they come back, and how much do they spend per order?
-- Definitions
--   Gross spend = order totals (items + delivery) of non-cancelled orders
--   placed in the period. Refunded = completed return refunds on those same
--   orders. Segment: 3+ orders "Loyal", 2 "Repeat", 1 "One-time".
--   Refunds are summed in their own CTE first, so joining them cannot
--   multiply the order rows.
-- Tables (6): Customer, CustomerOrder, Refund, ReturnItem, ReturnRequest,
--             OrderItem (through the refund path)
-- Techniques: CTEs, LEFT JOIN of a pre-aggregated subquery, CASE segmentation,
--             HAVING-free top-N with ORDER BY … LIMIT.
-- =============================================================================

SET @date_from = '2026-01-01';
SET @date_to   = '2026-12-31';

-- @query
WITH orders_in_period AS (
  SELECT o.order_id, o.customer_id, o.totalAmount, o.placedAt
    FROM CustomerOrder o
   WHERE o.status <> 'CANCELLED'
     AND o.placedAt >= CAST(@date_from AS DATE)
     AND o.placedAt <  CAST(@date_to AS DATE) + INTERVAL 1 DAY
),
refunds AS (
  SELECT op.customer_id, SUM(r.amount) AS refunded
    FROM Refund r
    JOIN ReturnItem ri       ON ri.return_item_id    = r.return_item_id
    JOIN ReturnRequest rr    ON rr.return_request_id = ri.return_request_id
    JOIN orders_in_period op ON op.order_id          = rr.order_id
   WHERE r.status = 'COMPLETED'
   GROUP BY op.customer_id
)
SELECT CONCAT(c.firstName, ' ', c.lastName)               AS customer,
       c.email,
       COUNT(op.order_id)                                  AS orders,
       SUM(op.totalAmount)                                 AS gross_spend,
       COALESCE(MAX(rf.refunded), 0)                       AS refunded,
       SUM(op.totalAmount) - COALESCE(MAX(rf.refunded), 0) AS net_spend,
       ROUND(AVG(op.totalAmount), 2)                       AS avg_order_value,
       DATE(MIN(op.placedAt))                              AS first_order,
       DATE(MAX(op.placedAt))                              AS last_order,
       CASE WHEN COUNT(op.order_id) >= 3 THEN 'Loyal'
            WHEN COUNT(op.order_id) = 2  THEN 'Repeat'
            ELSE 'One-time' END                            AS segment
  FROM Customer c
  JOIN orders_in_period op ON op.customer_id = c.customer_id
  LEFT JOIN refunds rf     ON rf.customer_id = c.customer_id
 GROUP BY c.customer_id, c.firstName, c.lastName, c.email
 ORDER BY net_spend DESC, orders DESC
 LIMIT 15;
