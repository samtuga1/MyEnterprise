-- =============================================================================
-- MyEnterprise — fashion commerce database
-- File 01: schema — 31 tables, keys, CHECK constraints and indexes
-- -----------------------------------------------------------------------------
-- Source of truth: "MyEnterprise | Logical Table Diagram — 30 Tables".
-- Table and column names follow the diagram exactly, with these documented
-- changes (see docs/DECISIONS.md, "Schema changes"):
--   * `Order` is created as CustomerOrder, because ORDER is a reserved SQL word.
--   * Columns marked  -- [added]  are not in the diagram. Each one is needed by
--     a workflow the diagram describes (login, shipping address, delivery dates,
--     audit times, idempotency). No original column was removed or renamed.
--   * One table is added: ProductImage (pictures stored as binary data), so a
--     product photograph is uploaded straight into the database.
--   * Fulfillment.admin_id and OrderCancellation.cancelledBy are nullable:
--     a fulfillment exists before an admin picks it up, and customers may
--     cancel their own orders.
--
-- Conventions
--   * InnoDB everywhere (transactions + foreign keys), utf8mb4.
--   * Money is DECIMAL(10,2); never FLOAT.
--   * Status columns hold UPPER_CASE codes guarded by CHECK constraints.
--   * Financial and stock history is never cascaded away: ON DELETE RESTRICT.
--     Catalog detail rows (specs, category links) cascade with their parent.
-- =============================================================================

USE myenterprise;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- CORE
-- -----------------------------------------------------------------------------

CREATE TABLE Customer (
  customer_id    INT          NOT NULL AUTO_INCREMENT,
  email          VARCHAR(100) NOT NULL,
  firstName      VARCHAR(50)  NOT NULL,
  lastName       VARCHAR(50)  NOT NULL,
  phone          VARCHAR(20)  NULL,
  password_hash  VARCHAR(255) NOT NULL,                              -- [added] bcrypt/argon2 hash, never plaintext
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- [added]
  CONSTRAINT pk_customer PRIMARY KEY (customer_id),
  CONSTRAINT uq_customer_email UNIQUE (email),
  CONSTRAINT chk_customer_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_customer_names CHECK (CHAR_LENGTH(TRIM(firstName)) > 0 AND CHAR_LENGTH(TRIM(lastName)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Registered shoppers';

CREATE TABLE Admin (
  admin_id       INT          NOT NULL AUTO_INCREMENT,
  email          VARCHAR(100) NOT NULL,
  role           VARCHAR(30)  NOT NULL,
  fullName       VARCHAR(100) NOT NULL,                              -- [added] shown in audit trails
  password_hash  VARCHAR(255) NOT NULL,                              -- [added]
  isActive       BOOLEAN      NOT NULL DEFAULT TRUE,                 -- [added] disable without deleting history
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- [added]
  CONSTRAINT pk_admin PRIMARY KEY (admin_id),
  CONSTRAINT uq_admin_email UNIQUE (email),
  CONSTRAINT chk_admin_role CHECK (role IN ('ADMINISTRATOR', 'OPERATIONS', 'CATALOG', 'SUPPORT')),
  CONSTRAINT chk_admin_email CHECK (email LIKE '%_@_%._%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Store staff; role drives what the admin API allows';

-- -----------------------------------------------------------------------------
-- CATALOG
-- -----------------------------------------------------------------------------

CREATE TABLE Category (
  category_id     INT          NOT NULL AUTO_INCREMENT,
  category_name   VARCHAR(80)  NOT NULL,
  slug            VARCHAR(80)  NOT NULL,                             -- [added] URL key
  category_group  VARCHAR(20)  NOT NULL DEFAULT 'TYPE',              -- [added] DEPARTMENT / TYPE / COLLECTION
  sortOrder       SMALLINT     NOT NULL DEFAULT 0,                   -- [added] navigation order
  CONSTRAINT pk_category PRIMARY KEY (category_id),
  CONSTRAINT uq_category_name UNIQUE (category_name),
  CONSTRAINT uq_category_slug UNIQUE (slug),
  CONSTRAINT chk_category_group CHECK (category_group IN ('DEPARTMENT', 'TYPE', 'COLLECTION')),
  CONSTRAINT chk_category_slug CHECK (slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Departments (Women, Men), garment types and editorial collections';

CREATE TABLE Product (
  product_id   INT           NOT NULL AUTO_INCREMENT,
  admin_id     INT           NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  brand        VARCHAR(80)   NOT NULL,
  description  TEXT          NOT NULL,
  isActive     BOOLEAN       NOT NULL DEFAULT TRUE,
  slug         VARCHAR(120)  NOT NULL,                               -- [added] URL key
  createdAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- [added] "New in" ordering
  CONSTRAINT pk_product PRIMARY KEY (product_id),
  CONSTRAINT uq_product_slug UNIQUE (slug),
  CONSTRAINT fk_product_admin FOREIGN KEY (admin_id) REFERENCES Admin (admin_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_product_name CHECK (CHAR_LENGTH(TRIM(name)) >= 2),
  INDEX idx_product_active (isActive, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='A garment or accessory; sizes and colours live in ProductVariant';

CREATE TABLE ProductCategory (
  product_id   INT NOT NULL,
  category_id  INT NOT NULL,
  CONSTRAINT pk_product_category PRIMARY KEY (product_id, category_id),
  CONSTRAINT fk_pc_product  FOREIGN KEY (product_id)  REFERENCES Product (product_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_pc_category FOREIGN KEY (category_id) REFERENCES Category (category_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  INDEX idx_pc_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Many-to-many: a coat is in Women + Outerwear + New in';

CREATE TABLE ProductVariant (
  variant_id     INT            NOT NULL AUTO_INCREMENT,
  product_id     INT            NOT NULL,
  sku            VARCHAR(80)    NOT NULL,
  configuration  VARCHAR(150)   NOT NULL,                            -- the size label: "M", "EU 40", "W30 L32", "One size"
  color          VARCHAR(50)    NOT NULL,
  price          DECIMAL(10,2)  NOT NULL,
  color_hex      CHAR(7)        NULL,                                -- [added] swatch colour
  sortOrder      SMALLINT       NOT NULL DEFAULT 0,                  -- [added] size order (XS before S before M)
  isActive       BOOLEAN        NOT NULL DEFAULT TRUE,               -- [added] retire one size without losing history
  CONSTRAINT pk_product_variant PRIMARY KEY (variant_id),
  CONSTRAINT uq_variant_sku UNIQUE (sku),
  CONSTRAINT uq_variant_option UNIQUE (product_id, configuration, color),
  CONSTRAINT fk_variant_product FOREIGN KEY (product_id) REFERENCES Product (product_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_variant_price CHECK (price > 0 AND price < 100000),
  CONSTRAINT chk_variant_hex CHECK (color_hex IS NULL OR color_hex REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='The thing actually sold and stocked: one size in one colour';

CREATE TABLE ProductSpecification (
  specification_id  INT           NOT NULL AUTO_INCREMENT,
  variant_id        INT           NOT NULL,
  spec_name         VARCHAR(80)   NOT NULL,
  spec_value        VARCHAR(150)  NOT NULL,
  unit              VARCHAR(30)   NULL,
  CONSTRAINT pk_product_specification PRIMARY KEY (specification_id),
  CONSTRAINT uq_spec_name UNIQUE (variant_id, spec_name),
  CONSTRAINT fk_spec_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Fabric, care and size-specific measurements (chest width differs per size)';

CREATE TABLE CompatibilityRule (
  rule_id             INT          NOT NULL AUTO_INCREMENT,
  source_variant_id   INT          NOT NULL,
  target_variant_id   INT          NOT NULL,
  compatibility_type  VARCHAR(30)  NOT NULL,
  CONSTRAINT pk_compatibility_rule PRIMARY KEY (rule_id),
  CONSTRAINT uq_compatibility_pair UNIQUE (source_variant_id, target_variant_id),
  CONSTRAINT fk_rule_source FOREIGN KEY (source_variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_rule_target FOREIGN KEY (target_variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_rule_not_self CHECK (source_variant_id <> target_variant_id),
  CONSTRAINT chk_rule_type CHECK (compatibility_type IN ('PAIRS_WITH', 'LAYERS_WITH', 'COMPLETES_LOOK'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='"Style it with": colour-specific outfit pairings';

-- [added] table 31 — not in the diagram (docs/DECISIONS.md, 2026-11-09).
-- Product pictures are stored in the database itself, as binary data (BLOB),
-- so one SQL import or one backup carries the whole shop, pictures included.
--   * A picture belongs to a product and, usually, to one of its colours.
--     A colour comes in 4–6 sizes; keeping the picture per colour, not per
--     ProductVariant row, stores each picture once. A NULL colour means the
--     picture shows every colour (for example a close-up of the fabric).
--   * byte_size and sha256 are generated by the database from the data, so
--     they can never disagree with it. The UNIQUE sha256 refuses the same file
--     twice and is the picture's web address (/api/images/{sha256}): that
--     address never changes meaning, so browsers may cache it for good.
--   * chk_image_bytes keeps every picture under 512 KB, below XAMPP's 1 MB
--     max_allowed_packet. The PHP API resizes and re-encodes uploads first.
CREATE TABLE ProductImage (
  image_id     INT           NOT NULL AUTO_INCREMENT,
  product_id   INT           NOT NULL,
  color        VARCHAR(50)   NULL,                                   -- a ProductVariant.color of the product; NULL = every colour
  sortOrder    SMALLINT      NOT NULL DEFAULT 0,                     -- 0 = the main picture of that colour
  mime_type    VARCHAR(20)   NOT NULL,
  width        SMALLINT      NOT NULL,                               -- pixels (for SVG, the drawing's own size)
  height       SMALLINT      NOT NULL,
  alt_text     VARCHAR(160)  NOT NULL,                               -- read out by screen readers
  credit       VARCHAR(255)  NULL,                                   -- where the picture comes from (photographer, licence)
  data         MEDIUMBLOB    NOT NULL,                               -- the file itself
  byte_size    INT           AS (OCTET_LENGTH(data)) STORED,
  sha256       CHAR(64)      AS (SHA2(data, 256)) STORED,
  uploadedBy   INT           NULL,                                   -- NULL for the sample pictures loaded with the seed
  createdAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_product_image PRIMARY KEY (image_id),
  CONSTRAINT uq_image_sha UNIQUE (sha256),
  CONSTRAINT fk_image_product FOREIGN KEY (product_id) REFERENCES Product (product_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_image_admin FOREIGN KEY (uploadedBy) REFERENCES Admin (admin_id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_image_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/svg+xml')),
  CONSTRAINT chk_image_bytes CHECK (OCTET_LENGTH(data) BETWEEN 1 AND 524288),
  CONSTRAINT chk_image_size CHECK (width BETWEEN 1 AND 4000 AND height BETWEEN 1 AND 4000),
  CONSTRAINT chk_image_order CHECK (sortOrder >= 0),
  CONSTRAINT chk_image_alt CHECK (CHAR_LENGTH(TRIM(alt_text)) >= 3),
  INDEX idx_image_lookup (product_id, color, sortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Product pictures stored as binary data, one per colour or for every colour';

-- -----------------------------------------------------------------------------
-- ORDERS
-- -----------------------------------------------------------------------------

CREATE TABLE Cart (
  cart_id             INT          NOT NULL AUTO_INCREMENT,
  customer_id         INT          NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  createdAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,                              -- [added]
  updatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- [added]
  -- [added] generated helper: equals customer_id only while the cart is ACTIVE,
  -- so the UNIQUE index below allows any number of old carts but one active cart.
  active_customer_id  INT AS (CASE WHEN status = 'ACTIVE' THEN customer_id END) STORED,
  CONSTRAINT pk_cart PRIMARY KEY (cart_id),
  CONSTRAINT uq_cart_one_active UNIQUE (active_customer_id),
  CONSTRAINT fk_cart_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_cart_status CHECK (status IN ('ACTIVE', 'CHECKED_OUT', 'ABANDONED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='A shopping bag; at most one ACTIVE per customer';

CREATE TABLE CartItem (
  cart_item_id  INT            NOT NULL AUTO_INCREMENT,
  cart_id       INT            NOT NULL,
  variant_id    INT            NOT NULL,
  quantity      INT            NOT NULL,
  unit_price    DECIMAL(10,2)  NOT NULL,
  addedAt       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- [added]
  CONSTRAINT pk_cart_item PRIMARY KEY (cart_item_id),
  CONSTRAINT uq_cart_variant UNIQUE (cart_id, variant_id),
  CONSTRAINT fk_cartitem_cart FOREIGN KEY (cart_id) REFERENCES Cart (cart_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cartitem_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_cartitem_quantity CHECK (quantity BETWEEN 1 AND 10),
  CONSTRAINT chk_cartitem_price CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- `Order` in the diagram. Renamed because ORDER is reserved in SQL.
CREATE TABLE CustomerOrder (
  order_id        INT            NOT NULL AUTO_INCREMENT,
  customer_id     INT            NOT NULL,
  orderNumber     VARCHAR(50)    NOT NULL,
  status          VARCHAR(30)    NOT NULL DEFAULT 'PLACED',
  totalAmount     DECIMAL(10,2)  NOT NULL,
  placedAt        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deliveryMethod  VARCHAR(20)    NOT NULL DEFAULT 'STANDARD',        -- [added] flowchart: "choose delivery option"
  shippingFee     DECIMAL(10,2)  NOT NULL DEFAULT 0.00,              -- [added] part of totalAmount
  shipRecipient   VARCHAR(100)   NOT NULL,                           -- [added] immutable shipping snapshot …
  shipLine1       VARCHAR(150)   NOT NULL,                           -- [added]
  shipCity        VARCHAR(80)    NOT NULL,                           -- [added]
  shipRegion      VARCHAR(80)    NOT NULL,                           -- [added]
  shipPostalCode  VARCHAR(20)    NOT NULL,                           -- [added]
  shipCountry     CHAR(2)        NOT NULL DEFAULT 'US',              -- [added] ISO 3166-1 alpha-2
  CONSTRAINT pk_customer_order PRIMARY KEY (order_id),
  CONSTRAINT uq_order_number UNIQUE (orderNumber),
  -- Lets ReturnRequest prove (order, customer) belong together with a composite FK.
  CONSTRAINT uq_order_customer UNIQUE (order_id, customer_id),
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_order_status CHECK (status IN ('PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  CONSTRAINT chk_order_total CHECK (totalAmount >= 0),
  CONSTRAINT chk_order_fee CHECK (shippingFee >= 0 AND shippingFee <= totalAmount),
  CONSTRAINT chk_order_delivery CHECK (deliveryMethod IN ('STANDARD', 'EXPRESS')),
  CONSTRAINT chk_order_country CHECK (shipCountry REGEXP '^[A-Z]{2}$'),
  INDEX idx_order_placed (placedAt),
  INDEX idx_order_status (status, placedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Diagram table "Order"';

CREATE TABLE OrderItem (
  order_item_id  INT            NOT NULL AUTO_INCREMENT,
  order_id       INT            NOT NULL,
  variant_id     INT            NOT NULL,
  quantity       INT            NOT NULL,
  unitPrice      DECIMAL(10,2)  NOT NULL,                            -- historical price, never recalculated
  CONSTRAINT pk_order_item PRIMARY KEY (order_item_id),
  CONSTRAINT uq_order_variant UNIQUE (order_id, variant_id),
  CONSTRAINT fk_orderitem_order FOREIGN KEY (order_id) REFERENCES CustomerOrder (order_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_orderitem_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_orderitem_quantity CHECK (quantity BETWEEN 1 AND 10),
  CONSTRAINT chk_orderitem_price CHECK (unitPrice >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- INVENTORY
-- -----------------------------------------------------------------------------

CREATE TABLE Warehouse (
  warehouse_id  INT           NOT NULL AUTO_INCREMENT,
  name          VARCHAR(80)   NOT NULL,
  location      VARCHAR(200)  NOT NULL,
  capacity      INT           NOT NULL,                              -- unit: garments/pairs on hand
  CONSTRAINT pk_warehouse PRIMARY KEY (warehouse_id),
  CONSTRAINT uq_warehouse_name UNIQUE (name),
  CONSTRAINT chk_warehouse_capacity CHECK (capacity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE Inventory (
  warehouse_id       INT       NOT NULL,
  variant_id         INT       NOT NULL,
  quantity_on_hand   INT       NOT NULL DEFAULT 0,
  quantity_reserved  INT       NOT NULL DEFAULT 0,
  reorder_level      INT       NOT NULL DEFAULT 4,                   -- [added] low-stock threshold
  updatedAt          DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- [added]
  CONSTRAINT pk_inventory PRIMARY KEY (warehouse_id, variant_id),
  CONSTRAINT fk_inventory_warehouse FOREIGN KEY (warehouse_id) REFERENCES Warehouse (warehouse_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_inventory_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  -- The core stock invariant: 0 <= reserved <= on hand.
  CONSTRAINT chk_inventory_balance CHECK (quantity_on_hand >= 0 AND quantity_reserved >= 0
                                          AND quantity_reserved <= quantity_on_hand),
  CONSTRAINT chk_inventory_reorder CHECK (reorder_level >= 0),
  INDEX idx_inventory_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Balance per warehouse; on hand changes only through StockMovement (trigger)';

CREATE TABLE StockMovement (
  movement_id      INT          NOT NULL AUTO_INCREMENT,
  warehouse_id     INT          NOT NULL,
  variant_id       INT          NOT NULL,
  quantity_change  INT          NOT NULL,
  reason           VARCHAR(80)  NOT NULL,
  movedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reference        VARCHAR(50)  NULL,                                -- [added] source document, e.g. PO-1004, ME-10057
  CONSTRAINT pk_stock_movement PRIMARY KEY (movement_id),
  CONSTRAINT fk_movement_warehouse FOREIGN KEY (warehouse_id) REFERENCES Warehouse (warehouse_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_movement_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_movement_nonzero CHECK (quantity_change <> 0),
  CONSTRAINT chk_movement_reason CHECK (reason IN ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'SALE_SHIPMENT',
                                                   'RETURN_RESTOCK', 'ADJUSTMENT', 'DAMAGE_WRITE_OFF')),
  -- Direction must match the reason (receipts add, shipments remove).
  CONSTRAINT chk_movement_direction CHECK (
       (reason IN ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'RETURN_RESTOCK') AND quantity_change > 0)
    OR (reason IN ('SALE_SHIPMENT', 'DAMAGE_WRITE_OFF') AND quantity_change < 0)
    OR  reason = 'ADJUSTMENT'),
  INDEX idx_movement_time (movedAt),
  INDEX idx_movement_item (variant_id, warehouse_id, movedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Append-only stock ledger';

-- -----------------------------------------------------------------------------
-- PROCUREMENT
-- -----------------------------------------------------------------------------

CREATE TABLE Supplier (
  supplier_id  INT           NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100)  NOT NULL,
  contact      VARCHAR(100)  NOT NULL,
  CONSTRAINT pk_supplier PRIMARY KEY (supplier_id),
  CONSTRAINT uq_supplier_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE SupplierProduct (
  supplier_id        INT            NOT NULL,
  variant_id         INT            NOT NULL,
  unit_cost          DECIMAL(10,2)  NOT NULL,
  lead_time_days     INT            NOT NULL,
  minimum_order_qty  INT            NOT NULL DEFAULT 1,
  CONSTRAINT pk_supplier_product PRIMARY KEY (supplier_id, variant_id),
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier (supplier_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_sp_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_sp_cost CHECK (unit_cost > 0),
  CONSTRAINT chk_sp_lead CHECK (lead_time_days BETWEEN 1 AND 180),
  CONSTRAINT chk_sp_moq CHECK (minimum_order_qty BETWEEN 1 AND 1000),
  INDEX idx_sp_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Supplier price list: which supplier can replenish which variant';

CREATE TABLE PurchaseOrder (
  purchase_order_id  INT          NOT NULL AUTO_INCREMENT,
  supplier_id        INT          NOT NULL,
  warehouse_id       INT          NOT NULL,
  status             VARCHAR(30)  NOT NULL DEFAULT 'ORDERED',
  orderedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  receivedAt         DATETIME     NULL,                              -- [added] idempotent receipt + real lead time
  CONSTRAINT pk_purchase_order PRIMARY KEY (purchase_order_id),
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier (supplier_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_po_warehouse FOREIGN KEY (warehouse_id) REFERENCES Warehouse (warehouse_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_po_status CHECK (status IN ('ORDERED', 'RECEIVED', 'CANCELLED')),
  CONSTRAINT chk_po_received CHECK ((status = 'RECEIVED') = (receivedAt IS NOT NULL)),
  CONSTRAINT chk_po_dates CHECK (receivedAt IS NULL OR receivedAt >= orderedAt),
  INDEX idx_po_status (status, orderedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE PurchaseOrderItem (
  po_item_id         INT            NOT NULL AUTO_INCREMENT,
  purchase_order_id  INT            NOT NULL,
  variant_id         INT            NOT NULL,
  quantity           INT            NOT NULL,
  unit_cost          DECIMAL(10,2)  NOT NULL,
  CONSTRAINT pk_purchase_order_item PRIMARY KEY (po_item_id),
  CONSTRAINT uq_po_variant UNIQUE (purchase_order_id, variant_id),
  CONSTRAINT fk_poi_po FOREIGN KEY (purchase_order_id) REFERENCES PurchaseOrder (purchase_order_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_poi_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_poi_quantity CHECK (quantity BETWEEN 1 AND 5000),
  CONSTRAINT chk_poi_cost CHECK (unit_cost > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- FINANCE  (simulated: no card data is ever stored)
-- -----------------------------------------------------------------------------

CREATE TABLE Payment (
  payment_id  INT            NOT NULL AUTO_INCREMENT,
  order_id    INT            NOT NULL,
  amount      DECIMAL(10,2)  NOT NULL,
  status      VARCHAR(30)    NOT NULL,
  method      VARCHAR(30)    NOT NULL DEFAULT 'CARD',                -- [added] simulated method label only
  createdAt   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- [added]
  CONSTRAINT pk_payment PRIMARY KEY (payment_id),
  CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES CustomerOrder (order_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_payment_amount CHECK (amount > 0),
  CONSTRAINT chk_payment_status CHECK (status IN ('PENDING', 'CAPTURED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  CONSTRAINT chk_payment_method CHECK (method IN ('CARD', 'PAYPAL', 'APPLE_PAY'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `Transaction` (
  transaction_id   INT            NOT NULL AUTO_INCREMENT,
  payment_id       INT            NOT NULL,
  transactionType  VARCHAR(30)    NOT NULL,
  amount           DECIMAL(10,2)  NOT NULL,
  status           VARCHAR(30)    NOT NULL,
  reference        VARCHAR(40)    NOT NULL,                          -- [added] simulated gateway id; UNIQUE = idempotency
  createdAt        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP, -- [added]
  CONSTRAINT pk_transaction PRIMARY KEY (transaction_id),
  CONSTRAINT uq_transaction_reference UNIQUE (reference),
  CONSTRAINT fk_transaction_payment FOREIGN KEY (payment_id) REFERENCES Payment (payment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_transaction_type CHECK (transactionType IN ('CAPTURE', 'REFUND')),
  CONSTRAINT chk_transaction_amount CHECK (amount > 0),
  CONSTRAINT chk_transaction_status CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Money movements against a payment: one capture, zero or more refunds';

-- -----------------------------------------------------------------------------
-- FULFILLMENT
-- -----------------------------------------------------------------------------

CREATE TABLE Fulfillment (
  fulfillment_id  INT          NOT NULL AUTO_INCREMENT,
  order_id        INT          NOT NULL,
  admin_id        INT          NULL,                                 -- nullable: assigned when staff start packing
  status          VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- [added]
  CONSTRAINT pk_fulfillment PRIMARY KEY (fulfillment_id),
  CONSTRAINT uq_fulfillment_order UNIQUE (order_id),                 -- one fulfillment per order; shipments may split it
  CONSTRAINT fk_fulfillment_order FOREIGN KEY (order_id) REFERENCES CustomerOrder (order_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_fulfillment_admin FOREIGN KEY (admin_id) REFERENCES Admin (admin_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_fulfillment_status CHECK (status IN ('PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_fulfillment_admin CHECK (status IN ('PENDING', 'CANCELLED') OR admin_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE Shipment (
  shipment_id     INT           NOT NULL AUTO_INCREMENT,
  fulfillment_id  INT           NOT NULL,
  trackingNumber  VARCHAR(100)  NOT NULL,
  status          VARCHAR(30)   NOT NULL DEFAULT 'IN_TRANSIT',
  carrier         VARCHAR(40)   NOT NULL DEFAULT 'UPS',             -- [added]
  shippedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP, -- [added]
  deliveredAt     DATETIME      NULL,                               -- [added] starts the return window
  CONSTRAINT pk_shipment PRIMARY KEY (shipment_id),
  CONSTRAINT uq_shipment_tracking UNIQUE (trackingNumber),
  CONSTRAINT fk_shipment_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES Fulfillment (fulfillment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_shipment_status CHECK (status IN ('IN_TRANSIT', 'DELIVERED')),
  CONSTRAINT chk_shipment_delivered CHECK ((status = 'DELIVERED') = (deliveredAt IS NOT NULL)),
  CONSTRAINT chk_shipment_dates CHECK (deliveredAt IS NULL OR deliveredAt >= shippedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='One parcel; an order shipped from two warehouses has two shipments';

CREATE TABLE OrderAllocation (
  allocation_id   INT          NOT NULL AUTO_INCREMENT,
  order_item_id   INT          NOT NULL,
  warehouse_id    INT          NOT NULL,
  fulfillment_id  INT          NOT NULL,
  shipment_id     INT          NULL,
  allocated_qty   INT          NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'RESERVED',          -- [added] RESERVED → SHIPPED, or RELEASED
  CONSTRAINT pk_order_allocation PRIMARY KEY (allocation_id),
  CONSTRAINT uq_allocation_item_wh UNIQUE (order_item_id, warehouse_id),
  CONSTRAINT fk_alloc_item FOREIGN KEY (order_item_id) REFERENCES OrderItem (order_item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_alloc_warehouse FOREIGN KEY (warehouse_id) REFERENCES Warehouse (warehouse_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_alloc_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES Fulfillment (fulfillment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_alloc_shipment FOREIGN KEY (shipment_id) REFERENCES Shipment (shipment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_alloc_qty CHECK (allocated_qty > 0),
  CONSTRAINT chk_alloc_status CHECK (status IN ('RESERVED', 'SHIPPED', 'RELEASED')),
  CONSTRAINT chk_alloc_shipment CHECK ((status = 'SHIPPED') = (shipment_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Which warehouse supplies how many units of an order line';

CREATE TABLE OrderCancellation (
  cancellation_id  INT           NOT NULL AUTO_INCREMENT,
  order_id         INT           NOT NULL,
  cancelledBy      INT           NULL,                              -- Admin who cancelled; NULL when the customer did
  reason           VARCHAR(255)  NOT NULL,
  cancelledAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  initiatedBy      VARCHAR(10)   NOT NULL,                          -- [added] CUSTOMER or ADMIN
  CONSTRAINT pk_order_cancellation PRIMARY KEY (cancellation_id),
  CONSTRAINT uq_cancellation_order UNIQUE (order_id),               -- diagram: an order MAY HAVE 0..1 cancellation
  CONSTRAINT fk_cancel_order FOREIGN KEY (order_id) REFERENCES CustomerOrder (order_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_cancel_admin FOREIGN KEY (cancelledBy) REFERENCES Admin (admin_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_cancel_actor CHECK ((initiatedBy = 'ADMIN' AND cancelledBy IS NOT NULL)
                                  OR (initiatedBy = 'CUSTOMER' AND cancelledBy IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- AFTER-SALES
-- -----------------------------------------------------------------------------

CREATE TABLE ReturnRequest (
  return_request_id  INT           NOT NULL AUTO_INCREMENT,
  order_id           INT           NOT NULL,
  customer_id        INT           NOT NULL,
  status             VARCHAR(30)   NOT NULL DEFAULT 'REQUESTED',
  reason             VARCHAR(255)  NOT NULL,                        -- [added] "too small", "colour not as pictured"
  requestedAt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- [added]
  resolvedAt         DATETIME      NULL,                            -- [added]
  CONSTRAINT pk_return_request PRIMARY KEY (return_request_id),
  -- Composite FK: the customer on the return must be the customer on the order.
  CONSTRAINT fk_return_order_customer FOREIGN KEY (order_id, customer_id)
    REFERENCES CustomerOrder (order_id, customer_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_return_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_return_status CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED')),
  CONSTRAINT chk_return_resolved CHECK (resolvedAt IS NULL OR resolvedAt >= requestedAt),
  INDEX idx_return_status (status, requestedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE ReturnItem (
  return_item_id     INT NOT NULL AUTO_INCREMENT,
  return_request_id  INT NOT NULL,
  order_item_id      INT NOT NULL,
  quantity           INT NOT NULL,
  CONSTRAINT pk_return_item PRIMARY KEY (return_item_id),
  CONSTRAINT uq_return_line UNIQUE (return_request_id, order_item_id),
  CONSTRAINT fk_returnitem_request FOREIGN KEY (return_request_id) REFERENCES ReturnRequest (return_request_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_returnitem_orderitem FOREIGN KEY (order_item_id) REFERENCES OrderItem (order_item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_returnitem_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE Refund (
  refund_id       INT            NOT NULL AUTO_INCREMENT,
  return_item_id  INT            NOT NULL,
  transaction_id  INT            NULL,
  amount          DECIMAL(10,2)  NOT NULL,
  status          VARCHAR(30)    NOT NULL DEFAULT 'PENDING',
  createdAt       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- [added]
  CONSTRAINT pk_refund PRIMARY KEY (refund_id),
  CONSTRAINT uq_refund_transaction UNIQUE (transaction_id),          -- a transaction documents at most one refund
  CONSTRAINT fk_refund_returnitem FOREIGN KEY (return_item_id) REFERENCES ReturnItem (return_item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_refund_transaction FOREIGN KEY (transaction_id) REFERENCES `Transaction` (transaction_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_refund_amount CHECK (amount > 0),
  CONSTRAINT chk_refund_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  CONSTRAINT chk_refund_completed CHECK (status <> 'COMPLETED' OR transaction_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE Warranty (
  warranty_id      INT   NOT NULL AUTO_INCREMENT,
  variant_id       INT   NOT NULL,
  duration_months  INT   NOT NULL,
  coverage         TEXT  NOT NULL,
  CONSTRAINT pk_warranty PRIMARY KEY (warranty_id),
  CONSTRAINT fk_warranty_variant FOREIGN KEY (variant_id) REFERENCES ProductVariant (variant_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_warranty_duration CHECK (duration_months BETWEEN 1 AND 60),
  INDEX idx_warranty_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Quality guarantee: seams, stitching, soles, zips';

CREATE TABLE WarrantyClaim (
  claim_id       INT           NOT NULL AUTO_INCREMENT,
  warranty_id    INT           NOT NULL,
  order_item_id  INT           NOT NULL,
  reason         VARCHAR(255)  NOT NULL,
  status         VARCHAR(30)   NOT NULL DEFAULT 'SUBMITTED',
  submittedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- [added] eligibility is judged at this moment
  resolution     VARCHAR(255)  NULL,                                -- [added] "Replacement sent", "Repaired"
  resolvedAt     DATETIME      NULL,                                -- [added]
  CONSTRAINT pk_warranty_claim PRIMARY KEY (claim_id),
  CONSTRAINT fk_claim_warranty FOREIGN KEY (warranty_id) REFERENCES Warranty (warranty_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_claim_orderitem FOREIGN KEY (order_item_id) REFERENCES OrderItem (order_item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_claim_status CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'RESOLVED')),
  CONSTRAINT chk_claim_resolution CHECK (status NOT IN ('REJECTED', 'RESOLVED')
                                         OR (resolution IS NOT NULL AND resolvedAt IS NOT NULL)),
  INDEX idx_claim_status (status, submittedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
