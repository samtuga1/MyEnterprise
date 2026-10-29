# Proposed build sequence and acceptance criteria

**Current phase (2026-10-26): frontend first, by explicit user request.** The mock customer/admin prototype is implemented under public/. Database, SQL programming, and PHP integration below remain future work. Follow README.md and FRONTEND_VERIFICATION.md for the runnable frontend; do not treat the originally proposed ordering below as authorization to start backend work.

## 1. Review and contracts
Read source PDFs; review schema and workflows; document corrections and metric definitions. Create a data dictionary and routine contracts with parameters, outputs, errors, status changes, stock effects, and transaction ownership. Divide responsibilities across the group.

## 2. Database foundation
Create schema, constraints, indexes, and seed data. Include several warehouses/suppliers, variants from multiple categories, customers with repeat purchases, low-stock cases, incomplete fulfillment, cancellation, returns/refunds, and warranty scenarios. Use enough varied records that all seven reports produce meaningful outputs. Avoid a huge arbitrary data target.
Acceptance: clean import on the documented database version; PK/FK and CHECK failures demonstrated; consistent balances and no orphan rows. Seed opening stock must follow the same audit policy as later movements.

## 3. Database programming
Implement the three triggers and three procedures containing the three cursors, after revisiting candidate designs. Include NOT FOUND handlers and safe cursor cleanup/transaction error handling where applicable. Define who owns the transaction; avoid nested START TRANSACTION calls.
Acceptance: each routine and trigger is exercised by executable demo scripts. Test multi-item checkout, insufficient stock, cross-order returns, excessive returns/refunds, repeat receipt/cancellation, and rollback after mid-operation failures. Test concurrent stock/refund updates if supported; otherwise state the limitation.

## 4. PHP backend and frontend in parallel
Backend: connection/configuration, repositories/services, validated inputs, authentication if selected, ownership/role checks, routine calls, and report endpoints/pages.
Frontend: simple responsive product listing/details/cart, order history, admin management, and reports with filters, labels, empty states, and useful errors. Use sample data only during scaffolding; final workflows must use the real database.
Acceptance: PHP syntax checks and real browser walkthroughs; no SQL errors or credentials exposed in pages. Record checks that could not run.

## 5. Business reports
Implement all seven questions as saved, readable SQL with sample parameter values and descriptions. Connect each to an admin report page. Control join multiplication and date/status semantics.
Acceptance: each query joins at least two tables, produces verifiable expected results from seed data, and can run in phpMyAdmin as well as through PHP.

## 6. Final demonstration and submission preparation
Walk through a coherent story: browse -> cart -> checkout -> inventory reservation -> fulfill/ship -> return/refund, plus purchase receipt, cancellation, warranty and reports. Keep simulated payment behavior explicit. Ensure implemented stock rules are demonstrated correctly.
Prepare readme.txt, installation instructions, demo accounts, demo steps, routine/trigger/cursor explanations, real screenshots, paper outline, and a 20-minute presentation outline. Actual report/presentation artifacts are a later deliverable, not supplied by this handoff.

## Suggested implementation layout
```text
MyEnterprise/
  AGENTS.md
  PROJECT_BRIEF.md
  README.md
  readme.txt
  docs/                  # sources, data dictionary, decisions, evidence
  database/
    01_schema.sql
    02_routines.sql
    03_triggers.sql
    04_seed.sql
    05_business_queries.sql
    demos/
    checks/
  config/
    database.example.php
  src/                   # connection, services, validation, shared helpers
  public/                # PHP pages, assets, customer/admin/report entry points
```
This is a proposed structure. Document the exact Apache URL/document-root setup so localhost paths work with public/ and configuration files are not served. Reorder SQL imports if actual dependencies require it; test the documented order.

## Group collaboration
Share code and versioned SQL through one Git repository when available. Each member uses a local database. Commit migrations/schema changes and notify teammates; do not email divergent database copies as the source of truth. Agree on routine signatures and page inputs/outputs early so frontend/backend work can proceed while database programming is completed.
