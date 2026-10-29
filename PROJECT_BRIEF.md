# MyEnterprise project brief

## Purpose and current state
Build a fashion e-commerce database application supporting customers, product variants, orders, inventory across warehouses, procurement, payments, fulfillment, returns, refunds, and warranties. The group has conceptual and logical diagrams with 30 entities/tables. The local HTML/CSS/JavaScript frontend prototype is implemented with realistic mock records. Database, SQL routines, and PHP backend/connection work are explicitly deferred. See README.md for running the frontend and docs/FRONTEND_VERIFICATION.md for actual checks.

This is primarily a database course project. The current authorized phase prioritizes a complete, interactive frontend shopping journey and admin workspace. The final project must still satisfy relational correctness, required SQL programming, useful reports, and PHP integration. Frontend simulations do not meet those later implementation requirements.

The user clarified on 2026-10-28 that the store is fashion only: clothing, shoes, and accessories. Earlier electronics references in the source materials are historical. This changes frontend fixtures and vocabulary, not the original 30-table database design. Variants use size/fit and color; specifications describe fabrics and care; compatibility is presented as outfit suggestions.

Current presentation: violet and neutral styling, ordinary store wording, and dedicated administration at `/admin/` with its own login, without a storefront link or marketing hero. Customer sign-in/registration also use password fields with local prototype verification. Simulation details stay in project documentation; all data/services remain local mocks in this phase.

## Confirmed group decisions
- Four members, three shared roles.
- Database development: two members. Together own schema, constraints, sample data, seven business queries, triggers, procedures/functions, and cursors. One can focus on schema/data/queries and the other on database programming; review together.
- PHP backend: one member. Owns connection, form handling, application logic, and calling database operations.
- Frontend and integration: one member. Owns storefront/admin pages, forms, report displays, and integration with PHP.
- All members contribute to testing, documentation, and presentation. Member names have not been assigned here.
- Agree on table/column names and routine contracts early. Backend and frontend can proceed in parallel with local seed data; final integration depends on real database operations.
- SQL may be authored as scripts and imported/executed through phpMyAdmin. The assignment does not explicitly require clicking through forms to create each table. This is an interpretation of its wording.

## Environment
Use Apache/PHP and MySQL/MariaDB, normally through XAMPP. PHP connects directly to the database; phpMyAdmin is its management interface. Each member can import the same scripts into a local database. No shared online database is required. Verify the actual installed PHP/database versions rather than assuming the engine is MySQL because XAMPP labels a service that way.

Use a configurable database host, port, name, username, and password. Local localhost/root/empty-password settings are examples only, not mandatory credentials. Provide a least-privilege runtime user and separate setup instructions where feasible.

## Proposed interface scope (design recommendations, not all explicit assignment requirements)
Customer: browse/filter products, view variants/specifications, cart, simulated checkout/payment, order history/details, eligible cancellation, returns and warranty requests.
Admin: product/category/variant management, warehouse inventory, purchase orders and receipts, order fulfillment/shipment updates, return/refund review, warranty claim review, and business reports.
Decide and document authentication scope. Existing Customer/Admin tables do not contain password hashes. If real login is added, add appropriate credential storage and authorization without storing plaintext passwords. Do not assume a login screen alone provides security.

## Proposed seven business questions
Each query must join at least two tables and have meaningful aggregation, conditions, or other justified complexity. Define statuses, date boundaries, and financial measures precisely.
1. Which products and categories generated the most gross order revenue during a selected period? Avoid duplicate counting for products in several categories; distinguish revenue attributed to a category from a total across categories.
2. Which customers have the highest completed-order spending and repeat purchases during a selected period?
3. Which variants have low available stock in each warehouse, and which suppliers can replenish them at what cost and lead time? Use a supplied threshold unless a reorder field is intentionally added.
4. Which suppliers account for the most procurement spending, and how do their prices/lead times compare? Do not claim observed delivery performance without receipt dates.
5. Which orders remain incompletely allocated or shipped, and what quantities are outstanding?
6. Which products have the highest return quantities/rates and associated completed refund amounts? Define the denominator and date policy; aggregate separately to avoid join multiplication.
7. Which purchased products have open warranty claims, and are those claims eligible under their warranty duration? Define warranty start date explicitly; the diagram only supplies order placedAt.

These are proposals. Final queries should reflect actual seed scenarios and business definitions. Gross order sales and completed payments minus completed refunds are different metrics.

## Proposed required database programming
Triggers:
1. After inserting a valid StockMovement, update the matching inventory balance atomically. Missing inventory rows must have a defined policy; never silently lose a movement. Negative stock must be rejected.
2. Before inserting a ReturnItem, validate the original order item, ownership/order consistency, and aggregate previously committed return quantities.
3. Before inserting a Refund, validate refundable value, linked return and transaction, and prior refunds. Define how status transitions affect the checks.

Procedures and cursors:
1. CheckoutCart: cursor over cart items; validate products/prices, create order/items and appropriate stock reservations/payment simulation, and close the cart within a transaction.
2. ReceivePurchaseOrder: cursor over purchase order items; create StockMovement records and mark the order received atomically. Initial scope may be full receipt only. Prevent duplicate receipts.
3. CancelOrder: cursor over allocations; release reservations, record cancellation, and update status atomically. Define eligible statuses and paid-order refund policy.

These are candidate designs, not implemented guarantees. Review trigger restrictions, locking, transaction ownership and error handlers for the actual database version. The three cursors can be inside the three procedures; document and demonstrate all three. If the instructor expects additional routines, flag that interpretation without claiming it is required by the text.

## Critical invariants
- Quantities and money use appropriate types and constraints; no floating point for stored money.
- Available stock = quantity_on_hand - quantity_reserved; 0 <= reserved <= on hand.
- Define when inventory is reserved, physically deducted, released, and returned. No double deduction by PHP plus trigger.
- Prevent overselling with transactionally safe checks/locks; avoid overlapping routines locking stock in inconsistent orders.
- Returned quantities cannot exceed eligible purchased quantities; cumulative refunds cannot exceed the refundable paid amount. Reject cross-order return/claim/transaction references.
- Shipment, allocation, fulfillment, and order items must refer to the same order. Enforce cross-table consistency beyond individual FKs.
- Receive/checkout/cancel/refund operations must not execute twice accidentally. Preserve payment, transaction, refund, and inventory audit records.
- Keep historical unit prices on OrderItem. Document treatment of taxes/shipping/discounts, which are not modeled in the original diagram.
