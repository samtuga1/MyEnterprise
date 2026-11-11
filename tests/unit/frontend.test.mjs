// Frontend helpers that money, dates, statuses and redirects depend on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, priceRange, statusLabel, statusTone, plural } from '../../frontend/src/shared/format.js';
import { asset, productPicture, safeNext } from '../../frontend/src/shared/api.js';

test('money formats the API strings without floating-point surprises', () => {
  assert.equal(money('58.00'), '$58.00');
  assert.equal(money('1234.5'), '$1,234.50');
  assert.equal(priceRange('58.00', '58.00'), '$58');
  assert.equal(priceRange('58.00', '62.00'), '$58 – $62');
});

test('database status codes become words people use', () => {
  assert.equal(statusLabel('PROCESSING'), 'Being packed');
  assert.equal(statusLabel('PARTIALLY_REFUNDED'), 'Partly refunded');
  assert.equal(statusTone('DELIVERED'), 'ok');
  assert.equal(statusLabel('SOMETHING_NEW'), 'Something new');
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(3, 'item'), '3 items');
});

test('redirect after sign-in stays inside the site', () => {
  assert.equal(safeNext('/checkout'), '/checkout');
  assert.equal(safeNext('//evil.example/x'), '/');
  assert.equal(safeNext('/\\evil.example'), '/');
  assert.equal(safeNext('https://evil.example'), '/');
  assert.equal(safeNext(null, '/account'), '/account');
});

test('image paths from the database resolve, with a fallback', () => {
  assert.equal(asset('api/images/abc'), '/api/images/abc');
  assert.equal(asset('media/hero/outfit.jpg'), '/media/hero/outfit.jpg');
  assert.equal(asset(null), '/media/fallback.svg');
  assert.equal(asset('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
  assert.equal(productPicture('oxford-cotton-shirt', 'Light blue'), 'api/images/products/oxford-cotton-shirt?color=Light%20blue');
});
