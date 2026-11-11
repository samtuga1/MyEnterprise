-- =============================================================================
-- MyEnterprise — fashion commerce database
-- File 00: create the database (non-destructive)
-- -----------------------------------------------------------------------------
-- Creates the `myenterprise` database only if it does not already exist.
-- It never drops anything. To rebuild from scratch, use the clearly labelled
-- reset script in database/reset/ instead.
--
-- Supported engine: MariaDB 10.4 or newer (tested on 10.4.28, the version in
-- XAMPP 8.2). MySQL 8 is not tested; see docs/DATABASE.md, "Engine notes".
-- Import order (phpMyAdmin → Import, or the mysql CLI):
--   00_create_database.sql → 01_schema.sql → 02_functions.sql →
--   03_procedures.sql → 04_triggers.sql → 05_views.sql → 06_seed_data.sql
-- Or import the single combined file: database/myenterprise_full.sql
-- =============================================================================

CREATE DATABASE IF NOT EXISTS myenterprise
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE myenterprise;
