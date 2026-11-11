-- =============================================================================
-- Q4 · Supplier spend and delivery performance
-- -----------------------------------------------------------------------------
-- Business question
--   Which suppliers take the largest share of purchasing spend, and do they
--   deliver within the lead time they quote?
-- Definitions
--   Spend = quantity × unit cost on purchase orders placed in the period,
--   excluding cancelled orders. Quoted lead time of a purchase order = the
--   longest quoted lead time among its lines (SupplierProduct). Actual lead
--   time = receivedAt − orderedAt in days, for received orders only.
--   On time = received within the quoted lead time.
-- Tables (4): Supplier, PurchaseOrder, PurchaseOrderItem, SupplierProduct
-- Techniques: CTE that aggregates per purchase order first (so lines are not
--             double counted), conditional aggregation (SUM/AVG over CASE),
--             DATEDIFF, correlated subquery for the size of the price list.
-- =============================================================================

SET @date_from = '2026-01-01';
SET @date_to   = '2026-12-31';

-- @query
WITH po_summary AS (
  SELECT po.purchase_order_id,
         po.supplier_id,
         po.status,
         po.orderedAt,
         po.receivedAt,
         SUM(poi.quantity * poi.unit_cost) AS order_value,
         SUM(poi.quantity)                 AS units,
         MAX(sp.lead_time_days)            AS quoted_days
    FROM PurchaseOrder po
    JOIN PurchaseOrderItem poi    ON poi.purchase_order_id = po.purchase_order_id
    LEFT JOIN SupplierProduct sp  ON sp.supplier_id = po.supplier_id AND sp.variant_id = poi.variant_id
   WHERE po.orderedAt >= CAST(@date_from AS DATE)
     AND po.orderedAt <  CAST(@date_to AS DATE) + INTERVAL 1 DAY
   GROUP BY po.purchase_order_id, po.supplier_id, po.status, po.orderedAt, po.receivedAt
)
SELECT s.name                                                                   AS supplier,
       COUNT(*)                                                                 AS purchase_orders,
       SUM(ps.status = 'RECEIVED')                                              AS received,
       SUM(ps.status = 'ORDERED')                                               AS open_orders,
       SUM(CASE WHEN ps.status <> 'CANCELLED' THEN ps.units END)                AS units,
       SUM(CASE WHEN ps.status <> 'CANCELLED' THEN ps.order_value END)          AS spend,
       ROUND(100 * SUM(CASE WHEN ps.status <> 'CANCELLED' THEN ps.order_value END)
                 / SUM(SUM(CASE WHEN ps.status <> 'CANCELLED' THEN ps.order_value END)) OVER (), 1) AS spend_share_pct,
       ROUND(AVG(ps.quoted_days), 1)                                            AS avg_quoted_days,
       ROUND(AVG(CASE WHEN ps.status = 'RECEIVED'
                      THEN DATEDIFF(ps.receivedAt, ps.orderedAt) END), 1)       AS avg_actual_days,
       ROUND(100 * AVG(CASE WHEN ps.status = 'RECEIVED'
                            THEN DATEDIFF(ps.receivedAt, ps.orderedAt) <= ps.quoted_days END), 0) AS on_time_pct,
       (SELECT COUNT(*) FROM SupplierProduct sp2 WHERE sp2.supplier_id = s.supplier_id) AS variants_offered
  FROM Supplier s
  JOIN po_summary ps ON ps.supplier_id = s.supplier_id
 GROUP BY s.supplier_id, s.name
 ORDER BY spend DESC;
