# Logical schema reference

Domain note (2026-10-28): the user corrected the storefront to fashion. This document remains a reference to the original 30-table design; no table/column edits are made. Frontend size/fit and outfit-suggestion mappings are documented in FRONTEND_BACKEND_CONTRACT.md.

Transcribed from the diagram already reviewed in this conversation. This is a starting reference, not executable DDL. Reconcile with the original diagram PDF before finalizing. PK = primary key; FK = foreign key; UQ = unique; FK? = nullable FK. Repeated PK entries within a table form a composite key. All INTs are shown without inferred auto-increment/nullability rules.

```text
Customer
 customer_id INT PK; email VARCHAR(100) UQ; firstName VARCHAR(50); lastName VARCHAR(50); phone VARCHAR(20)
Admin
 admin_id INT PK; email VARCHAR(100) UQ; role VARCHAR(30)
Product
 product_id INT PK; admin_id INT FK; name VARCHAR(100); brand VARCHAR(80); description TEXT; isActive BOOLEAN
Category
 category_id INT PK; category_name VARCHAR(80) UQ
ProductCategory
 product_id INT PK,FK; category_id INT PK,FK
ProductVariant
 variant_id INT PK; product_id INT FK; sku VARCHAR(80) UQ; configuration VARCHAR(150); color VARCHAR(50); price DECIMAL(10,2)
ProductSpecification
 specification_id INT PK; variant_id INT FK; spec_name VARCHAR(80); spec_value VARCHAR(150); unit VARCHAR(30)
CompatibilityRule
 rule_id INT PK; source_variant_id INT FK; target_variant_id INT FK; compatibility_type VARCHAR(30)
Cart
 cart_id INT PK; customer_id INT FK; status VARCHAR(20)
CartItem
 cart_item_id INT PK; cart_id INT FK; variant_id INT FK; quantity INT; unit_price DECIMAL(10,2)
Order
 order_id INT PK; customer_id INT FK; orderNumber VARCHAR(50) UQ; status VARCHAR(30); totalAmount DECIMAL(10,2); placedAt DATETIME
OrderItem
 order_item_id INT PK; order_id INT FK; variant_id INT FK; quantity INT; unitPrice DECIMAL(10,2)
Warehouse
 warehouse_id INT PK; name VARCHAR(80); location VARCHAR(200); capacity INT
Inventory
 warehouse_id INT PK,FK; variant_id INT PK,FK; quantity_on_hand INT; quantity_reserved INT
StockMovement
 movement_id INT PK; warehouse_id INT FK; variant_id INT FK; quantity_change INT; reason VARCHAR(80); movedAt DATETIME
Supplier
 supplier_id INT PK; name VARCHAR(100); contact VARCHAR(100)
SupplierProduct
 supplier_id INT PK,FK; variant_id INT PK,FK; unit_cost DECIMAL(10,2); lead_time_days INT; minimum_order_qty INT
PurchaseOrder
 purchase_order_id INT PK; supplier_id INT FK; warehouse_id INT FK; status VARCHAR(30); orderedAt DATETIME
PurchaseOrderItem
 po_item_id INT PK; purchase_order_id INT FK; variant_id INT FK; quantity INT; unit_cost DECIMAL(10,2)
Payment
 payment_id INT PK; order_id INT FK; amount DECIMAL(10,2); status VARCHAR(30)
Transaction
 transaction_id INT PK; payment_id INT FK; transactionType VARCHAR(30); amount DECIMAL(10,2); status VARCHAR(30)
Fulfillment
 fulfillment_id INT PK; order_id INT FK; admin_id INT FK; status VARCHAR(30)
OrderAllocation
 allocation_id INT PK; order_item_id INT FK; warehouse_id INT FK; fulfillment_id INT FK; shipment_id INT FK?; allocated_qty INT
Shipment
 shipment_id INT PK; fulfillment_id INT FK; trackingNumber VARCHAR(100); status VARCHAR(30)
OrderCancellation
 cancellation_id INT PK; order_id INT FK; cancelledBy INT FK; reason VARCHAR(255); cancelledAt DATETIME
ReturnRequest
 return_request_id INT PK; order_id INT FK; customer_id INT FK; status VARCHAR(30)
ReturnItem
 return_item_id INT PK; return_request_id INT FK; order_item_id INT FK; quantity INT
Refund
 refund_id INT PK; return_item_id INT FK; transaction_id INT FK?,UQ; amount DECIMAL(10,2); status VARCHAR(30)
Warranty
 warranty_id INT PK; variant_id INT FK; duration_months INT; coverage TEXT
WarrantyClaim
 claim_id INT PK; warranty_id INT FK; order_item_id INT FK; reason VARCHAR(255); status VARCHAR(30)
```

## Review these gaps before implementation
- Order and Transaction may need quoting; consistent plural names such as orders/transactions are an option if documented with a mapping.
- Define the FK target and actor semantics for OrderCancellation.cancelledBy from the original diagram. One ordinary FK cannot reference either Customer or Admin depending on the row.
- Define statuses, nullability, defaults, indexes, ON DELETE/UPDATE behavior, and unique rules for duplicate cart items/allocations/supplier products.
- Define whether each variant has one warranty policy or several, and establish warranty eligibility/start date.
- Define whether refunds are one per return item or multiple; a nullable unique transaction_id alone does not settle that rule.
- Determine whether StockMovement needs links to purchase receipts, shipments, and returns to support reliable audit/idempotency.
- Warehouse capacity has no specified unit; define it or avoid claiming capacity enforcement.
- Decide whether single purchase-order full receipts are sufficient; partial receipt support needs explicit tracking.
- Required authentication/shipping address/product image fields are absent; add only what the chosen application scope requires and document it.
- Verify that CHECK constraints are actually enforced by the installed engine/version.
