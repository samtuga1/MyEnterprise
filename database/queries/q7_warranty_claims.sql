-- =============================================================================
-- Q7 · Quality-guarantee claims and their eligibility
-- -----------------------------------------------------------------------------
-- Business question
--   Which quality-guarantee claims are open, was each one made inside its
--   guarantee period, and which products and customers are affected?
-- Definitions
--   The guarantee starts when the parcel carrying the item is delivered and
--   lasts Warranty.duration_months (fn_warranty_expires_on). A claim is
--   "Eligible" when it was submitted on or before that date. With
--   @only_open = 1 only SUBMITTED and APPROVED claims are listed.
-- Tables (7): WarrantyClaim, Warranty, OrderItem, CustomerOrder, Customer,
--             ProductVariant, Product  (+ OrderAllocation/Shipment via the function)
-- Techniques: stored function inside a query, DATEDIFF, CASE, FIELD() ordering.
-- =============================================================================

SET @only_open = 0;

-- @query
SELECT CONCAT('WC-', wc.claim_id)                                         AS claim,
       p.name                                                             AS product,
       CONCAT(pv.configuration, ' · ', pv.color)                          AS variant,
       CONCAT(c.firstName, ' ', c.lastName)                               AS customer,
       o.orderNumber                                                      AS order_number,
       w.duration_months                                                  AS guarantee_months,
       fn_warranty_expires_on(wc.order_item_id, wc.warranty_id)           AS covered_until,
       DATE(wc.submittedAt)                                               AS submitted_on,
       DATEDIFF(fn_warranty_expires_on(wc.order_item_id, wc.warranty_id),
                DATE(wc.submittedAt))                                     AS days_left_at_claim,
       CASE WHEN DATE(wc.submittedAt) <= fn_warranty_expires_on(wc.order_item_id, wc.warranty_id)
            THEN 'Eligible' ELSE 'Outside guarantee' END                  AS eligibility,
       wc.status,
       wc.reason,
       wc.resolution
  FROM WarrantyClaim wc
  JOIN Warranty w        ON w.warranty_id    = wc.warranty_id
  JOIN OrderItem oi      ON oi.order_item_id = wc.order_item_id
  JOIN CustomerOrder o   ON o.order_id       = oi.order_id
  JOIN Customer c        ON c.customer_id    = o.customer_id
  JOIN ProductVariant pv ON pv.variant_id    = oi.variant_id
  JOIN Product p         ON p.product_id     = pv.product_id
 WHERE @only_open = 0 OR wc.status IN ('SUBMITTED', 'APPROVED')
 ORDER BY FIELD(wc.status, 'SUBMITTED', 'APPROVED', 'RESOLVED', 'REJECTED'), wc.submittedAt DESC;
