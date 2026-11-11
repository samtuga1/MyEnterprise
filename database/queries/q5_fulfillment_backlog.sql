-- =============================================================================
-- Q5 · Fulfillment backlog: paid orders not yet delivered
-- -----------------------------------------------------------------------------
-- Business question
--   Which paid orders are still waiting to be packed, shipped or delivered,
--   how long has each waited, which warehouses hold the units, and who is
--   packing them?
-- Definitions
--   Open = PLACED, PROCESSING or SHIPPED. Hours waiting are counted from
--   placedAt to @as_of (NOW() when @as_of is NULL). An order is "overdue"
--   when it has not shipped within 48 hours (standard) or 24 hours (express).
--   Units and allocations are aggregated in separate derived tables so the
--   two one-to-many joins cannot multiply each other.
-- Tables (7): CustomerOrder, Customer, OrderItem, Fulfillment, Admin,
--             OrderAllocation, Warehouse, Shipment
-- Techniques: derived tables, conditional SUM, GROUP_CONCAT, TIMESTAMPDIFF,
--             CASE for the stage and overdue flag.
-- =============================================================================

SET @as_of = NULL;

-- @query
SELECT o.orderNumber                                               AS order_number,
       CONCAT(c.firstName, ' ', c.lastName)                        AS customer,
       o.status,
       o.deliveryMethod                                            AS delivery,
       o.placedAt                                                  AS placed_at,
       TIMESTAMPDIFF(HOUR, o.placedAt, COALESCE(@as_of, NOW()))    AS hours_waiting,
       items.units                                                 AS units,
       COALESCE(alloc.reserved_units, 0)                           AS units_to_ship,
       COALESCE(alloc.shipped_units, 0)                            AS units_shipped,
       alloc.warehouses,
       COALESCE(par.in_transit, 0)                                 AS parcels_in_transit,
       COALESCE(a.fullName, 'Unassigned')                          AS packer,
       CASE o.status WHEN 'PLACED'     THEN 'Waiting to be picked'
                     WHEN 'PROCESSING' THEN 'Being packed'
                     ELSE 'With the carrier' END                   AS stage,
       CASE WHEN o.status IN ('PLACED', 'PROCESSING')
             AND TIMESTAMPDIFF(HOUR, o.placedAt, COALESCE(@as_of, NOW()))
                 > IF(o.deliveryMethod = 'EXPRESS', 24, 48)
            THEN 'Overdue' ELSE 'On track' END                     AS sla
  FROM CustomerOrder o
  JOIN Customer c    ON c.customer_id = o.customer_id
  JOIN Fulfillment f ON f.order_id    = o.order_id
  LEFT JOIN Admin a  ON a.admin_id    = f.admin_id
  JOIN (SELECT order_id, SUM(quantity) AS units
          FROM OrderItem GROUP BY order_id) items ON items.order_id = o.order_id
  LEFT JOIN (SELECT oa.fulfillment_id,
                    SUM(CASE WHEN oa.status = 'RESERVED' THEN oa.allocated_qty ELSE 0 END) AS reserved_units,
                    SUM(CASE WHEN oa.status = 'SHIPPED'  THEN oa.allocated_qty ELSE 0 END) AS shipped_units,
                    GROUP_CONCAT(DISTINCT w.name ORDER BY w.name SEPARATOR ', ')            AS warehouses
               FROM OrderAllocation oa
               JOIN Warehouse w ON w.warehouse_id = oa.warehouse_id
              WHERE oa.status <> 'RELEASED'
              GROUP BY oa.fulfillment_id) alloc ON alloc.fulfillment_id = f.fulfillment_id
  LEFT JOIN (SELECT fulfillment_id, SUM(status = 'IN_TRANSIT') AS in_transit
               FROM Shipment GROUP BY fulfillment_id) par ON par.fulfillment_id = f.fulfillment_id
 WHERE o.status IN ('PLACED', 'PROCESSING', 'SHIPPED')
 ORDER BY FIELD(o.status, 'PLACED', 'PROCESSING', 'SHIPPED'), o.placedAt;
