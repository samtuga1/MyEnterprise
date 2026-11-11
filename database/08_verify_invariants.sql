-- =============================================================================
-- MyEnterprise — File 08: invariant checks (read-only)
-- -----------------------------------------------------------------------------
-- Each row names one rule the data must always satisfy and counts the rows
-- that break it. Every count must be 0. Run it after importing the seed, after
-- the demonstrations, or any time the data has been changed through the shop.
-- It never modifies data.
-- =============================================================================

USE myenterprise;

SELECT invariant, violations, IF(violations = 0, 'OK', 'FAIL') AS result
FROM (

  -- STOCK -------------------------------------------------------------------
  SELECT 'S1 on hand equals the sum of the stock ledger' AS invariant, COUNT(*) AS violations
    FROM Inventory i
    LEFT JOIN (SELECT warehouse_id, variant_id, SUM(quantity_change) AS ledger
                 FROM StockMovement GROUP BY warehouse_id, variant_id) m
      ON m.warehouse_id = i.warehouse_id AND m.variant_id = i.variant_id
   WHERE i.quantity_on_hand <> COALESCE(m.ledger, 0)

  UNION ALL
  SELECT 'S2 reserved equals units on open (RESERVED) allocations', COUNT(*)
    FROM Inventory i
    LEFT JOIN (SELECT oa.warehouse_id, oi.variant_id, SUM(oa.allocated_qty) AS qty
                 FROM OrderAllocation oa JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id
                WHERE oa.status = 'RESERVED'
                GROUP BY oa.warehouse_id, oi.variant_id) r
      ON r.warehouse_id = i.warehouse_id AND r.variant_id = i.variant_id
   WHERE i.quantity_reserved <> COALESCE(r.qty, 0)

  UNION ALL
  SELECT 'S3 0 <= reserved <= on hand', COUNT(*)
    FROM Inventory WHERE quantity_reserved < 0 OR quantity_reserved > quantity_on_hand

  UNION ALL
  SELECT 'S4 every warehouse within its capacity', COUNT(*)
    FROM (SELECT w.warehouse_id FROM Warehouse w JOIN Inventory i ON i.warehouse_id = w.warehouse_id
           GROUP BY w.warehouse_id, w.capacity HAVING SUM(i.quantity_on_hand) > w.capacity) x

  UNION ALL
  SELECT 'S5 shipped units left the building through SALE_SHIPMENT', COUNT(*)
    FROM (SELECT oi.variant_id, oa.warehouse_id, SUM(oa.allocated_qty) AS shipped
            FROM OrderAllocation oa JOIN OrderItem oi ON oi.order_item_id = oa.order_item_id
           WHERE oa.status = 'SHIPPED' GROUP BY oi.variant_id, oa.warehouse_id) s
    LEFT JOIN (SELECT variant_id, warehouse_id, -SUM(quantity_change) AS moved
                 FROM StockMovement WHERE reason = 'SALE_SHIPMENT' GROUP BY variant_id, warehouse_id) m
      ON m.variant_id = s.variant_id AND m.warehouse_id = s.warehouse_id
   WHERE s.shipped <> COALESCE(m.moved, 0)

  -- ORDERS ------------------------------------------------------------------
  UNION ALL
  SELECT 'O1 order total = lines + delivery fee', COUNT(*)
    FROM CustomerOrder o
    JOIN (SELECT order_id, SUM(quantity * unitPrice) AS line_total FROM OrderItem GROUP BY order_id) l
      ON l.order_id = o.order_id
   WHERE o.totalAmount <> l.line_total + o.shippingFee

  UNION ALL
  SELECT 'O2 every order has at least one line', COUNT(*)
    FROM CustomerOrder o WHERE NOT EXISTS (SELECT 1 FROM OrderItem oi WHERE oi.order_id = o.order_id)

  UNION ALL
  SELECT 'O3 live orders have every unit allocated exactly once', COUNT(*)
    FROM OrderItem oi
    JOIN CustomerOrder o ON o.order_id = oi.order_id AND o.status <> 'CANCELLED'
    LEFT JOIN (SELECT order_item_id, SUM(allocated_qty) AS qty FROM OrderAllocation
                WHERE status <> 'RELEASED' GROUP BY order_item_id) a ON a.order_item_id = oi.order_item_id
   WHERE COALESCE(a.qty, 0) <> oi.quantity

  UNION ALL
  SELECT 'O4 allocation, fulfillment and shipment belong to one order', COUNT(*)
    FROM OrderAllocation oa
    JOIN OrderItem oi  ON oi.order_item_id = oa.order_item_id
    JOIN Fulfillment f ON f.fulfillment_id = oa.fulfillment_id
    LEFT JOIN Shipment s ON s.shipment_id = oa.shipment_id
   WHERE f.order_id <> oi.order_id OR (s.shipment_id IS NOT NULL AND s.fulfillment_id <> oa.fulfillment_id)

  UNION ALL
  SELECT 'O5 status matches parcels (delivered = all parcels in, nothing reserved)', COUNT(*)
    FROM CustomerOrder o
    JOIN Fulfillment f ON f.order_id = o.order_id
   WHERE (o.status = 'DELIVERED' AND (EXISTS (SELECT 1 FROM Shipment s WHERE s.fulfillment_id = f.fulfillment_id AND s.status <> 'DELIVERED')
                                   OR NOT EXISTS (SELECT 1 FROM Shipment s WHERE s.fulfillment_id = f.fulfillment_id)))
      OR (o.status IN ('PLACED', 'PROCESSING') AND EXISTS (SELECT 1 FROM OrderAllocation a WHERE a.fulfillment_id = f.fulfillment_id AND a.status <> 'RESERVED'))
      OR (o.status IN ('SHIPPED', 'DELIVERED') AND EXISTS (SELECT 1 FROM OrderAllocation a WHERE a.fulfillment_id = f.fulfillment_id AND a.status = 'RESERVED'))
      OR (o.status = 'CANCELLED' AND EXISTS (SELECT 1 FROM OrderAllocation a WHERE a.fulfillment_id = f.fulfillment_id AND a.status <> 'RELEASED'))

  UNION ALL
  SELECT 'O6 cancelled orders <=> one cancellation record', COUNT(*)
    FROM CustomerOrder o
    LEFT JOIN OrderCancellation c ON c.order_id = o.order_id
   WHERE (o.status = 'CANCELLED') <> (c.cancellation_id IS NOT NULL)

  UNION ALL
  SELECT 'O7 at most one ACTIVE cart per customer', COUNT(*)
    FROM (SELECT customer_id FROM Cart WHERE status = 'ACTIVE' GROUP BY customer_id HAVING COUNT(*) > 1) x

  -- MONEY -------------------------------------------------------------------
  UNION ALL
  SELECT 'M1 each order captured exactly its total', COUNT(*)
    FROM CustomerOrder o
    LEFT JOIN (SELECT p.order_id, SUM(t.amount) AS captured
                 FROM Payment p JOIN `Transaction` t ON t.payment_id = p.payment_id
                WHERE t.transactionType = 'CAPTURE' AND t.status = 'SUCCESS' GROUP BY p.order_id) c
      ON c.order_id = o.order_id
   WHERE COALESCE(c.captured, 0) <> o.totalAmount

  UNION ALL
  SELECT 'M2 refunds never exceed the payment', COUNT(*)
    FROM Payment p WHERE fn_payment_refunded_total(p.payment_id) > p.amount

  UNION ALL
  SELECT 'M3 payment status agrees with its refunds', COUNT(*)
    FROM Payment p
   WHERE (p.status = 'CAPTURED'           AND fn_payment_refunded_total(p.payment_id) <> 0)
      OR (p.status = 'REFUNDED'           AND fn_payment_refunded_total(p.payment_id) <> p.amount)
      OR (p.status = 'PARTIALLY_REFUNDED' AND NOT (fn_payment_refunded_total(p.payment_id) > 0
                                                   AND fn_payment_refunded_total(p.payment_id) < p.amount))

  UNION ALL
  SELECT 'M4 cancelled orders are refunded in full', COUNT(*)
    FROM CustomerOrder o JOIN Payment p ON p.order_id = o.order_id
   WHERE o.status = 'CANCELLED' AND fn_payment_refunded_total(p.payment_id) <> p.amount

  UNION ALL
  SELECT 'M5 each refund row is documented by a REFUND of the same order and amount', COUNT(*)
    FROM Refund r
    JOIN ReturnItem ri    ON ri.return_item_id = r.return_item_id
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
    LEFT JOIN `Transaction` t ON t.transaction_id = r.transaction_id
    LEFT JOIN Payment p ON p.payment_id = t.payment_id
   WHERE r.status = 'COMPLETED'
     AND (t.transaction_id IS NULL OR t.transactionType <> 'REFUND' OR p.order_id <> rr.order_id OR t.amount <> r.amount)

  -- AFTER-SALES ---------------------------------------------------------------
  UNION ALL
  SELECT 'A1 returned units never exceed units bought', COUNT(*)
    FROM OrderItem oi
    JOIN (SELECT ri.order_item_id, SUM(ri.quantity) AS qty
            FROM ReturnItem ri JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
           WHERE rr.status <> 'REJECTED' GROUP BY ri.order_item_id) r ON r.order_item_id = oi.order_item_id
   WHERE r.qty > oi.quantity

  UNION ALL
  SELECT 'A2 refunds never exceed returned units x price paid', COUNT(*)
    FROM ReturnItem ri
    JOIN OrderItem oi ON oi.order_item_id = ri.order_item_id
    JOIN (SELECT return_item_id, SUM(amount) AS refunded FROM Refund WHERE status <> 'FAILED' GROUP BY return_item_id) r
      ON r.return_item_id = ri.return_item_id
   WHERE r.refunded > ri.quantity * oi.unitPrice

  UNION ALL
  SELECT 'A3 return lines belong to the order being returned', COUNT(*)
    FROM ReturnItem ri
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
    JOIN OrderItem oi     ON oi.order_item_id = ri.order_item_id
   WHERE oi.order_id <> rr.order_id

  UNION ALL
  SELECT 'A4 refunded returns have a completed refund for every line', COUNT(*)
    FROM ReturnItem ri
    JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id
   WHERE rr.status = 'REFUNDED'
     AND NOT EXISTS (SELECT 1 FROM Refund r WHERE r.return_item_id = ri.return_item_id AND r.status = 'COMPLETED')

  UNION ALL
  SELECT 'A5 warranty claims cover the variant bought, inside the guarantee', COUNT(*)
    FROM WarrantyClaim wc
    JOIN Warranty w   ON w.warranty_id = wc.warranty_id
    JOIN OrderItem oi ON oi.order_item_id = wc.order_item_id
   WHERE w.variant_id <> oi.variant_id
      OR fn_warranty_expires_on(wc.order_item_id, wc.warranty_id) IS NULL
      OR DATE(wc.submittedAt) > fn_warranty_expires_on(wc.order_item_id, wc.warranty_id)

  -- PROCUREMENT ---------------------------------------------------------------
  UNION ALL
  SELECT 'P1 received purchase orders added exactly their units to stock', COUNT(*)
    FROM PurchaseOrder po
    JOIN (SELECT purchase_order_id, SUM(quantity) AS units FROM PurchaseOrderItem GROUP BY purchase_order_id) i
      ON i.purchase_order_id = po.purchase_order_id
    LEFT JOIN (SELECT reference, SUM(quantity_change) AS moved FROM StockMovement
                WHERE reason = 'PURCHASE_RECEIPT' GROUP BY reference) m
      ON m.reference = CONCAT('PO-', po.purchase_order_id)
   WHERE (po.status = 'RECEIVED' AND COALESCE(m.moved, 0) <> i.units)
      OR (po.status <> 'RECEIVED' AND m.moved IS NOT NULL)

) AS checks;
