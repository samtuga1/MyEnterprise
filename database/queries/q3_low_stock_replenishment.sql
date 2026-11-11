-- =============================================================================
-- Q3 · Low stock by warehouse and the best supplier to refill it
-- -----------------------------------------------------------------------------
-- Business question
--   Which sizes and colours are at or under their reorder level in each
--   warehouse, how much is already on order, and which supplier can refill
--   them most cheaply — at what cost and lead time?
-- Definitions
--   Available = on hand − reserved. Low = available <= reorder_level + @buffer.
--   On order = units on ORDERED purchase orders for that warehouse.
--   Suggested quantity refills to three times the reorder level, never below
--   the supplier's minimum order; 0 when open orders already cover it.
--   Best offer = lowest unit cost, then shortest lead time.
-- Tables (7): Inventory, Warehouse, ProductVariant, Product, PurchaseOrder,
--             PurchaseOrderItem, SupplierProduct, Supplier
-- Techniques: CTEs, ROW_NUMBER() to pick one offer per variant, LEFT JOIN of
--             aggregated open purchases, computed columns with GREATEST/CASE.
-- =============================================================================

SET @buffer = 0;

-- @query
WITH low_stock AS (
  SELECT i.warehouse_id,
         i.variant_id,
         i.quantity_on_hand - i.quantity_reserved AS available,
         i.reorder_level
    FROM Inventory i
    JOIN ProductVariant pv ON pv.variant_id = i.variant_id AND pv.isActive = 1
    JOIN Product p         ON p.product_id  = pv.product_id AND p.isActive = 1
   WHERE i.quantity_on_hand - i.quantity_reserved <= i.reorder_level + @buffer
),
on_order AS (
  SELECT po.warehouse_id, poi.variant_id, SUM(poi.quantity) AS units
    FROM PurchaseOrder po
    JOIN PurchaseOrderItem poi ON poi.purchase_order_id = po.purchase_order_id
   WHERE po.status = 'ORDERED'
   GROUP BY po.warehouse_id, poi.variant_id
),
best_offer AS (
  SELECT sp.variant_id, s.name AS supplier, sp.unit_cost, sp.lead_time_days, sp.minimum_order_qty,
         ROW_NUMBER() OVER (PARTITION BY sp.variant_id ORDER BY sp.unit_cost, sp.lead_time_days) AS position
    FROM SupplierProduct sp
    JOIN Supplier s ON s.supplier_id = sp.supplier_id
),
planned AS (
  SELECT ls.*,
         COALESCE(oo.units, 0) AS on_order,
         GREATEST(ls.reorder_level * 3 - ls.available - COALESCE(oo.units, 0), 0) AS shortfall
    FROM low_stock ls
    LEFT JOIN on_order oo ON oo.warehouse_id = ls.warehouse_id AND oo.variant_id = ls.variant_id
)
SELECT w.name                                    AS warehouse,
       pv.sku,
       p.name                                    AS product,
       pv.configuration                          AS size,
       pv.color,
       pl.available,
       pl.reorder_level,
       pl.on_order,
       bo.supplier                               AS best_supplier,
       bo.unit_cost,
       bo.lead_time_days,
       CASE WHEN pl.shortfall = 0 THEN 0
            ELSE GREATEST(pl.shortfall, bo.minimum_order_qty) END                AS suggested_qty,
       CASE WHEN pl.shortfall = 0 THEN 0
            ELSE GREATEST(pl.shortfall, bo.minimum_order_qty) * bo.unit_cost END AS estimated_cost
  FROM planned pl
  JOIN Warehouse w        ON w.warehouse_id = pl.warehouse_id
  JOIN ProductVariant pv  ON pv.variant_id  = pl.variant_id
  JOIN Product p          ON p.product_id   = pv.product_id
  LEFT JOIN best_offer bo ON bo.variant_id  = pl.variant_id AND bo.position = 1
 ORDER BY (pl.available - pl.reorder_level), w.name, pv.sku;
