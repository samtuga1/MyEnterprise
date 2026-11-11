MyEnterprise - Fashion Commerce Database System
COMP 5314-P01 Advanced Database Management Systems, Fall 2026 - Group Project

AUTHORS
  Group members: <fill in the names of all group members before submitting>

PROJECT OVERVIEW
  MyEnterprise is an online shop for clothing, shoes, bags and accessories.
  The database tracks customers, a catalogue of products sold in sizes and
  colours, shopping bags, orders, stock in three warehouses, purchasing from
  suppliers, simulated payments and refunds, parcels, cancellations, returns
  and quality-guarantee claims.

  Database (MariaDB 10.4 / MySQL, imported through phpMyAdmin):
    - 31 tables (the 30 of the diagram plus ProductImage, which stores the
      product pictures as binary data) with primary keys, 45 foreign keys,
      25 unique constraints and 64 CHECK constraints on 28 tables
    - 9 triggers (stock ledger, return rules, refund limits and more)
    - 6 stored procedures, 4 of them with cursors (checkout, receiving a
      purchase order, cancelling an order, shipping per warehouse)
    - 5 stored functions and 3 views
    - 7 business queries, each joining 4 to 8 tables
    - 23 integrity checks, and a demonstration script for every routine
    - about 9,000 rows of generated sample data covering ten months of trading

  Web interface: a PHP API (plain PHP 8, PDO prepared statements) that runs
  every business operation through the stored procedures, and a React
  storefront and administration area. The admin "Reports" page runs the seven
  queries and shows their SQL and results; the "Database" page shows the live
  schema, triggers, routines and integrity checks.

  Payments, refunds and shipping are simulated. All people and data are fictional.

HOW TO RUN (XAMPP)
  1. Copy the MyEnterprise folder into xampp/htdocs.
  2. Start Apache and MySQL in the XAMPP control panel.
  3. In phpMyAdmin choose Import and import database/myenterprise_full.sql.
  4. Open http://localhost/MyEnterprise/   (administration: /MyEnterprise/admin)
  Sample sign-in for the shop and the admin: demo@gmail.com / password1234
  To rebuild the sample data: import database/reset/RESET_myenterprise_DESTRUCTIVE.sql
  (it deletes and recreates only the myenterprise database).
  Database settings: copy backend/config/config.example.php to config.php if
  your MySQL user has a password.

FILE STRUCTURE
  database/
    00_create_database.sql      creates the database
    01_schema.sql               31 tables, keys, CHECK constraints, indexes
    02_functions.sql            6 functions
    03_procedures.sql           6 procedures (cursors in 4)
    04_triggers.sql             9 triggers
    05_views.sql                3 views
    06_seed_data.sql            sample data
    06_seed_images.sql          product photographs (BLOBs), imported after 06_seed_data
    07_business_queries.sql     the 7 business queries
    08_verify_invariants.sql    integrity checks (all must be 0)
    09_demonstrations.sql       runs every trigger/procedure/cursor (changes data)
    myenterprise_full.sql       files 00-06 in one import file
    queries/                    one file per business query
    reset/                      destructive rebuild script
  backend/                      PHP API source (config/, src/, routes.php)
  public/                       web root (index.php, api/, built app/, images)
  frontend/                     React source code
  tools/                        sample-data generator, SQL builder, diagrams,
                                photo tool (tools/photos/)
  tests/                        automated tests
  docs/                         DATABASE.md (database guide), ER_DIAGRAM.md,
                                API.md, VERIFICATION.md, original assignment
                                and diagram PDFs
  README.md                     full setup and development instructions

PHOTOGRAPHS
  The product photographs and the home page photograph come from Pixabay
  (pixabay.com) under the Pixabay Content License, which allows use without
  attribution. Each photographer and source page is still recorded, in
  tools/photos/credits.json and in the ProductImage.credit column. The brands
  and products of the shop are fictional.
