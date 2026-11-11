// Static checks of the SQL deliverables. No database needed (npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DB = join(import.meta.dirname, '..', '..', 'database');
const read = (f) => readFileSync(join(DB, f), 'utf8');

test('schema has the 30 tables of the design plus ProductImage, all InnoDB', () => {
  const schema = read('01_schema.sql');
  const tables = [...schema.matchAll(/CREATE TABLE `?(\w+)`?/g)].map((m) => m[1]);
  assert.equal(tables.length, 31);
  assert.ok(tables.includes('ProductImage'), 'missing ProductImage');
  for (const t of ['Customer', 'Admin', 'Product', 'Category', 'ProductCategory', 'ProductVariant', 'ProductSpecification', 'CompatibilityRule',
    'Cart', 'CartItem', 'CustomerOrder', 'OrderItem', 'Warehouse', 'Inventory', 'StockMovement', 'Supplier', 'SupplierProduct',
    'PurchaseOrder', 'PurchaseOrderItem', 'Payment', 'Transaction', 'Fulfillment', 'OrderAllocation', 'Shipment', 'OrderCancellation',
    'ReturnRequest', 'ReturnItem', 'Refund', 'Warranty', 'WarrantyClaim']) assert.ok(tables.includes(t), `missing ${t}`);
  assert.equal((schema.match(/ENGINE=InnoDB/g) || []).length, 31);
});

test('product pictures are stored once, as binary, with generated size and hash', () => {
  const block = read('01_schema.sql').split('CREATE TABLE ProductImage')[1].split(') ENGINE')[0];
  assert.match(block, /data\s+MEDIUMBLOB\s+NOT NULL/);
  assert.match(block, /sha256\s+CHAR\(64\)\s+AS \(SHA2\(data, 256\)\) STORED/);
  assert.match(block, /UNIQUE \(sha256\)/);
  assert.match(block, /CHECK \(OCTET_LENGTH\(data\) BETWEEN 1 AND 524288\)/);
  const images = read('06_seed_images.sql');
  const inserts = images.match(/INSERT INTO ProductImage/g) || [];
  assert.ok(inserts.length >= 72, `${inserts.length} seed pictures`);
  assert.ok(!/image_url/.test(read('01_schema.sql')), 'image paths are no longer stored');
});

test('CHECK constraints on at least three tables (the assignment asks for 3)', () => {
  const blocks = read('01_schema.sql').split('CREATE TABLE').slice(1);
  const withCheck = blocks.filter((b) => /CHECK \(/.test(b.split(') ENGINE')[0]));
  assert.ok(withCheck.length >= 3, `${withCheck.length} tables with CHECK`);
});

test('at least three triggers, three procedures or functions, and three cursors', () => {
  assert.ok((read('04_triggers.sql').match(/CREATE TRIGGER/g) || []).length >= 3);
  const routines = (read('03_procedures.sql').match(/CREATE PROCEDURE/g) || []).length + (read('02_functions.sql').match(/CREATE FUNCTION/g) || []).length;
  assert.ok(routines >= 3);
  assert.ok((read('03_procedures.sql').match(/CURSOR FOR/g) || []).length >= 3);
});

test('each business query file is runnable in phpMyAdmin and by the PHP report runner', () => {
  const files = readdirSync(join(DB, 'queries')).filter((f) => /^q\d_.*\.sql$/.test(f));
  assert.equal(files.length, 7);
  for (const f of files) {
    const text = read(join('queries', f));
    assert.ok(text.includes('-- @query\n'), `${f}: -- @query marker`);
    assert.match(text, /Business question/, `${f}: question`);
    assert.match(text, /-- Tables \(\d\):/, `${f}: tables line`);
    const sql = text.split('-- @query\n')[1];
    assert.ok((sql.match(/\bJOIN\b/g) || []).length >= 2, `${f}: joins at least two tables`);
    for (const [, name] of sql.matchAll(/@([a-z_]+)/g)) assert.match(text.split('-- @query')[0], new RegExp(`SET @${name}\\s*=`), `${f}: default for @${name}`);
  }
});

test('combined files are up to date with the numbered sources', () => {
  const full = read('myenterprise_full.sql');
  for (const f of ['01_schema.sql', '02_functions.sql', '03_procedures.sql', '04_triggers.sql', '05_views.sql']) {
    assert.ok(full.includes(read(f).trimEnd()), `myenterprise_full.sql is stale for ${f}: run npm run build:sql`);
  }
  assert.ok(read('reset/RESET_myenterprise_DESTRUCTIVE.sql').includes('DROP DATABASE IF EXISTS myenterprise;'));
  assert.ok(!full.includes('DROP DATABASE'), 'the normal import never drops the database');
});

test('no statement exceeds XAMPP max_allowed_packet (1 MB)', () => {
  for (const f of ['06_seed_data.sql', '06_seed_images.sql']) {
    for (const stmt of read(f).split(/;\n/)) assert.ok(Buffer.byteLength(stmt) < 1_000_000, `${f}: a statement is over 1 MB`);
  }
});
