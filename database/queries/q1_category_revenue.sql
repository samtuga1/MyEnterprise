-- =============================================================================
-- Q1 · Category revenue and the leading product in each category
-- -----------------------------------------------------------------------------
-- Business question
--   Which garment categories earned the most in a period, what share of sales
--   does each represent, and which product leads each category?
-- Definitions
--   Revenue = units × the price actually paid (OrderItem.unitPrice), excluding
--   delivery fees, for orders placed in the period that were not cancelled.
--   Each product has exactly one TYPE category, so nothing is counted twice.
-- Tables (6): CustomerOrder, OrderItem, ProductVariant, Product,
--             ProductCategory, Category
-- Techniques: common table expressions, GROUP BY, window functions
--             (ROW_NUMBER and SUM … OVER) for the leader and the share.
-- =============================================================================

SET @date_from = '2026-01-01';
SET @date_to   = '2026-12-31';

-- @query
WITH line_revenue AS (
  SELECT p.product_id,
         p.name                      AS product,
         o.order_id,
         oi.quantity,
         oi.quantity * oi.unitPrice  AS revenue
    FROM CustomerOrder o
    JOIN OrderItem oi      ON oi.order_id    = o.order_id
    JOIN ProductVariant pv ON pv.variant_id  = oi.variant_id
    JOIN Product p         ON p.product_id   = pv.product_id
   WHERE o.status <> 'CANCELLED'
     AND o.placedAt >= CAST(@date_from AS DATE)
     AND o.placedAt <  CAST(@date_to AS DATE) + INTERVAL 1 DAY
),
by_product AS (
  SELECT c.category_name,
         lr.product,
         SUM(lr.quantity)            AS units,
         SUM(lr.revenue)             AS revenue,
         COUNT(DISTINCT lr.order_id) AS orders
    FROM line_revenue lr
    JOIN ProductCategory pc ON pc.product_id = lr.product_id
    JOIN Category c         ON c.category_id = pc.category_id AND c.category_group = 'TYPE'
   GROUP BY c.category_name, lr.product_id, lr.product
),
ranked AS (
  SELECT bp.*,
         ROW_NUMBER() OVER (PARTITION BY category_name ORDER BY revenue DESC, product) AS position,
         SUM(revenue) OVER (PARTITION BY category_name) AS category_revenue,
         SUM(units)   OVER (PARTITION BY category_name) AS category_units,
         SUM(orders)  OVER (PARTITION BY category_name) AS category_lines
    FROM by_product bp
)
SELECT category_name                                                      AS category,
       category_units                                                     AS units_sold,
       category_revenue                                                   AS revenue,
       ROUND(100 * category_revenue / SUM(category_revenue) OVER (), 1)   AS share_pct,
       product                                                            AS top_product,
       revenue                                                            AS top_product_revenue,
       ROUND(100 * revenue / category_revenue, 1)                         AS top_product_share_pct
  FROM ranked
 WHERE position = 1
 ORDER BY category_revenue DESC;
