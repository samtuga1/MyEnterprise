#!/usr/bin/env node
// Generates database/06_seed_images.sql: the product pictures, stored in the
// ProductImage table as binary data (MEDIUMBLOB).
//
// One picture per product colour, taken from (first match wins):
//   tools/photos/products/{slug}/{colour-slug}.jpg   a photograph (credit in tools/photos/credits.json);
//                                                    {colour-slug}-2.jpg, -3.jpg … add more views
//   tools/art/products/{slug}/{colour-slug}.svg      the drawing made by npm run art
//
// The bytes are written as FROM_BASE64('…'), wrapped at 76 characters: about a
// third smaller than a hex literal, and it imports in phpMyAdmin. Each picture
// is its own INSERT, so no statement comes near XAMPP's 1 MB max_allowed_packet.
// The database works out byte_size and sha256 itself (generated columns).
//
// Deterministic: the same files always produce the same SQL.
// Usage: node tools/seed/generate-images.mjs   (part of npm run seed)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'database', '06_seed_images.sql');
const PHOTOS = join(ROOT, 'tools', 'photos', 'products');
const ART = join(ROOT, 'tools', 'art', 'products');
const CREDITS_FILE = join(ROOT, 'tools', 'photos', 'credits.json');
const MAX_BYTES = 512 * 1024; // chk_image_bytes in 01_schema.sql

// Same slug rule as generate-seed.mjs and the artwork generator.
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
const credits = existsSync(CREDITS_FILE) ? JSON.parse(readFileSync(CREDITS_FILE, 'utf8')) : {};

/** Width and height read from the file itself (JPEG frame header, PNG IHDR, SVG viewBox). */
function dimensions(bytes, mime) {
  if (mime === 'image/png') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime === 'image/svg+xml') {
    const m = bytes.toString('utf8', 0, 600).match(/viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*"/);
    if (!m) throw new Error('SVG without a viewBox');
    return [Math.round(+m[1]), Math.round(+m[2])];
  }
  for (let i = 2; i < bytes.length - 9;) {
    if (bytes[i] !== 0xff) throw new Error('not a JPEG marker');
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    }
    i += 2 + length;
  }
  throw new Error('JPEG without a frame header');
}

/** The pictures for one colour: photographs if there are any, otherwise the drawing. */
function sourcesFor(slug, color) {
  const key = `${slug}/${slugify(color)}`;
  const photos = [];
  for (let n = 1; n <= 6; n++) {
    const file = join(PHOTOS, slug, `${slugify(color)}${n === 1 ? '' : `-${n}`}.jpg`);
    if (!existsSync(file)) break;
    photos.push({ file, mime: 'image/jpeg', credit: credits[n === 1 ? key : `${key}-${n}`] || null });
  }
  if (photos.length) return photos;
  const svg = join(ART, slug, `${slugify(color)}.svg`);
  if (!existsSync(svg)) throw new Error(`no picture for ${key}: run npm run art`);
  return [{ file: svg, mime: 'image/svg+xml', credit: 'Illustration made for MyEnterprise (tools/art/generate-art.mjs)' }];
}

const out = [
  '-- =============================================================================',
  '-- MyEnterprise — File 06 (part 2): product pictures (generated — do not edit by hand)',
  '-- -----------------------------------------------------------------------------',
  '-- Produced by tools/seed/generate-images.mjs. Regenerate with: npm run seed',
  '-- Import after 06_seed_data.sql (it needs the Product rows).',
  '--',
  '-- Each picture is stored in ProductImage.data as binary (MEDIUMBLOB). The',
  '-- bytes are written in base64 text and decoded by FROM_BASE64() on import;',
  '-- the database then computes byte_size and sha256 from them.',
  '-- =============================================================================',
  '',
  'USE myenterprise;',
  'SET NAMES utf8mb4;',
  'START TRANSACTION;',
  '',
];

let id = 0, photos = 0, drawings = 0, total = 0, largest = 0;
C.PRODUCTS.forEach((p, pi) => {
  const productId = pi + 1; // same numbering as generate-seed.mjs
  const createdAt = `${p.launched || '2026-01-02'} 09:00:00`;
  for (const color of p.colors) {
    sourcesFor(p.slug, color).forEach((src, sortOrder) => {
      const bytes = readFileSync(src.file);
      if (bytes.length > MAX_BYTES) throw new Error(`${src.file} is ${bytes.length} bytes; the limit is ${MAX_BYTES}`);
      const [width, height] = dimensions(bytes, src.mime);
      const alt = `${p.name} in ${color.toLowerCase()}${sortOrder ? `, view ${sortOrder + 1}` : ''}`;
      const b64 = bytes.toString('base64').replace(/.{76}/g, '$&\n');
      const sql = 'INSERT INTO ProductImage (image_id, product_id, color, sortOrder, mime_type, width, height, alt_text, credit, createdAt, data) VALUES\n'
        + `  (${[++id, productId, q(color), sortOrder, q(src.mime), width, height, q(alt), q(src.credit), q(createdAt)].join(', ')},\n`
        + `   FROM_BASE64('${b64}'));`;
      if (Buffer.byteLength(sql) >= 1_000_000) throw new Error(`statement for ${src.file} is over 1 MB`);
      out.push(`-- ${p.slug} · ${color}${sortOrder ? ` · view ${sortOrder + 1}` : ''}`, sql, '');
      src.mime === 'image/jpeg' ? photos++ : drawings++;
      total += bytes.length;
      largest = Math.max(largest, bytes.length);
    });
  }
});

out.push('COMMIT;', '');
writeFileSync(OUT, out.join('\n'));
console.log(`wrote ${OUT}`);
console.log(`pictures ${id} (photographs ${photos}, drawings ${drawings}), ${(total / 1024).toFixed(0)} KB of image data, largest ${(largest / 1024).toFixed(0)} KB`);
