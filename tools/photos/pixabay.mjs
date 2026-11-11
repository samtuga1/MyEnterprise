#!/usr/bin/env node
// Finds and prepares the product photographs, using the Pixabay API
// (https://pixabay.com/api/docs/). Two steps:
//
//   node tools/photos/pixabay.mjs search [--only slug,slug] [--cache dir]
//       Searches Pixabay for every product colour, keeps the answers and small
//       previews in the cache and writes one contact sheet per product
//       ({cache}/sheets/{slug}.html) to choose from by eye.
//
//   node tools/photos/pixabay.mjs explore "black ankle boots" [--orientation all|vertical|horizontal] [--cache dir]
//       One extra search with your own words, for a colour the first search
//       did not find; writes {cache}/sheets/explore-{words}.html.
//
//   node tools/photos/pixabay.mjs pick [--only slug,slug] [--cache dir]
//       Downloads each photo chosen in tools/photos/picks.json, crops it to the
//       shop's 4:5 frame (tools/photos/crop.php) and writes
//       tools/photos/products/{slug}/{colour}.jpg and tools/photos/credits.json.
//       Then run npm run seed to put them in the database.
//
// picks.json: { "slug/colour-slug": { "id": 123, "focus": [x, y], "zoom": 1 } }
//   focus is the point (0–1 of the width and height) the crop centres on, default
//   [0.5, 0.5]; zoom > 1 crops tighter, < 1 steps back (a whole shoe on white).
//   A key ending in -2, -3 … adds another view of the same piece.
//   A key starting with media/ is site artwork, written to public/media/…jpg
//   with its own "ratio", "maxWidth" and "targetKB" (the home page hero).
//
// The key comes from PIXABAY_KEY or tools/photos/.env (git-ignored; see .env.example).
// Pixabay's rules followed here: pictures are downloaded to our own storage (the
// database), never hot-linked; API answers are cached for 24 hours; requests stay
// under 100 a minute; AI-generated and low-quality images are skipped.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as C from '../seed/catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const command = args[0];
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i > 0 && args[i + 1] ? args[i + 1] : fallback; };
const CACHE = opt('cache', join(HERE, '.cache'));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const PHP = process.env.PHP || (existsSync('/Applications/XAMPP/xamppfiles/bin/php') ? '/Applications/XAMPP/xamppfiles/bin/php' : 'php');
const UA = 'MyEnterprise-seed-tool/1.0';
const DAY = 24 * 3600 * 1000;

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function apiKey() {
  if (process.env.PIXABAY_KEY) return process.env.PIXABAY_KEY.trim();
  const env = join(HERE, '.env');
  const m = existsSync(env) && readFileSync(env, 'utf8').match(/^PIXABAY_KEY=(.+)$/m);
  if (!m) throw new Error('No Pixabay key: put PIXABAY_KEY=… in tools/photos/.env (see .env.example)');
  return m[1].trim();
}

// What to search for. A product term per product, and a colour word per colour
// (Pixabay searches the tags people gave their photos, so plain colour words work best).
const TERMS = {
  'relaxed-linen-shirt': 'linen shirt woman', 'ribbed-cotton-tank': 'tank top woman', 'everyday-cotton-tee': 't-shirt',
  'silk-blend-shell-blouse': 'blouse woman', 'soft-knit-cardigan': 'cardigan', 'merino-crew-sweater': 'sweater man',
  'chunky-rib-turtleneck': 'turtleneck sweater', 'gathered-midi-dress': 'midi dress', 'wrap-midi-dress': 'wrap dress',
  'sleeveless-poplin-dress': 'summer dress', 'satin-slip-skirt': 'satin skirt', 'pleated-wide-leg-trousers': 'wide leg trousers',
  'straight-leg-jeans': 'jeans woman', 'linen-drawstring-trousers': 'linen pants', 'slim-stretch-chinos': 'chinos',
  'selvedge-straight-jeans': 'raw denim jeans', 'everyday-trench-coat': 'trench coat', 'cropped-wool-blazer': 'blazer woman',
  'quilted-weekend-jacket': 'quilted jacket', 'wool-overcoat': 'coat man', 'hooded-rain-jacket': 'rain jacket',
  'oxford-cotton-shirt': 'shirt man', 'heavyweight-pocket-tee': 't-shirt man', 'everyday-court-sneakers': 'sneakers',
  'weekend-walking-sneakers': 'running shoes', 'suede-penny-loafers': 'loafers', 'leather-chelsea-boots': 'chelsea boots',
  'leather-derby-shoes': 'leather shoes men', 'canvas-carryall-tote': 'tote bag', 'everyday-crossbody-bag': 'leather handbag',
  'weekender-duffle-bag': 'travel bag', 'ribbed-knit-scarf': 'knitted scarf', 'leather-belt': 'leather belt', 'ribbed-wool-beanie': 'beanie',
};
const COLOUR_WORDS = {
  'Sage': 'green', 'White': 'white', 'Ivory': 'white', 'Black': 'black', 'Navy': 'navy', 'Indigo': 'blue', 'Washed black': 'black',
  'Terracotta': 'orange', 'Forest': 'green', 'Olive': 'olive', 'Sand': 'beige', 'Oat': 'beige', 'Charcoal': 'gray', 'Camel': 'camel',
  'Cocoa': 'brown', 'Cognac': 'brown', 'Chalk': 'white', 'Slate blue': 'blue', 'Champagne': 'beige', 'Khaki': 'beige',
  'Light blue': 'light blue', 'Grey melange': 'gray', 'Raw indigo': 'dark blue', 'Tan': 'brown', 'Brown': 'brown',
  'Natural': 'beige', 'Rust': 'rust', 'Stone': 'gray', 'Burgundy': 'burgundy', 'Cream': 'cream',
};

let last = 0;
async function api(params) {
  const wait = last + 700 - Date.now(); // ≈ 85 requests a minute at most
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey())}&image_type=photo&safesearch=true&${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429) { await sleep(60_000); return api(params); }
  if (!res.ok) throw new Error(`Pixabay ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** A search, answered from the cache when it is less than a day old. */
async function search(name, params) {
  const file = join(CACHE, 'search', `${name}.json`);
  const cached = readJson(file, null);
  if (cached && Date.now() - cached.at < DAY) return cached.hits;
  const { hits } = await api(params);
  const usable = hits.filter((h) => !h.isAiGenerated && !h.isLowQuality);
  writeJson(file, { at: Date.now(), params, hits: usable });
  return usable;
}

async function download(url, file) {
  if (existsSync(file)) return;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const products = () => C.PRODUCTS.filter((p) => !ONLY || ONLY.includes(p.slug));

async function runSearch() {
  for (const p of products()) {
    const term = TERMS[p.slug];
    if (!term) throw new Error(`no search term for ${p.slug}`);
    const shoes = ['shoes', 'bags', 'accessories'].includes(p.type);
    const rows = [];
    for (const color of p.colors) {
      const hits = await search(`${p.slug}/${slugify(color)}`, { q: `${COLOUR_WORDS[color]} ${term}`, per_page: 12, orientation: shoes ? 'all' : 'vertical' });
      rows.push({ title: `${color} — “${COLOUR_WORDS[color]} ${term}”`, hits });
    }
    const seen = new Set(rows.flatMap((r) => r.hits.map((h) => h.id)));
    const general = (await search(`${p.slug}/_any`, { q: term, per_page: 20, orientation: shoes ? 'all' : 'vertical', order: 'popular' }))
      .filter((h) => !seen.has(h.id));
    rows.push({ title: `Any colour — “${term}”`, hits: general });

    const all = rows.flatMap((r) => r.hits);
    for (let i = 0; i < all.length; i += 4) {
      await Promise.all(all.slice(i, i + 4).map((h) => download(h.webformatURL.replace('_640.', '_340.'), join(CACHE, 'thumbs', `${h.id}.jpg`))));
    }
    writeFileSync(join(mkdirp(join(CACHE, 'sheets')), `${p.slug}.html`), sheet(p, rows));
    console.log(`${p.slug}: ${rows.map((r) => r.hits.length).join(' + ')} candidates`);
  }
  console.log(`contact sheets in ${join(CACHE, 'sheets')}`);
}

function mkdirp(d) { mkdirSync(d, { recursive: true }); return d; }

function sheet(p, rows) {
  const tile = (h) => `<figure><div><img src="../thumbs/${h.id}.jpg"></div><figcaption><b>${h.id}</b> ${h.imageWidth}×${h.imageHeight}<br>${esc((h.description || h.tags).slice(0, 70))}</figcaption></figure>`;
  return `<!doctype html><meta charset="utf-8"><title>${esc(p.name)}</title>
<style>body{font:12px/1.3 system-ui;margin:16px;background:#fff;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}
section{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}figure{margin:0}figure div{aspect-ratio:4/5;background:#e5e2dc;display:flex;align-items:center;justify-content:center;overflow:hidden}
img{max-width:100%;max-height:100%}figcaption{font-size:10.5px;color:#444;height:3.9em;overflow:hidden}b{color:#000;font-size:12px}</style>
<h1>${esc(p.name)} <small>(${esc(p.slug)}, ${esc(p.type)}, ${esc(p.dept.join('/'))})</small></h1>
${rows.map((r) => `<h2>${esc(r.title)}</h2><section>${r.hits.map(tile).join('') || '<p>No results</p>'}</section>`).join('\n')}`;
}

async function runExplore(words) {
  if (!words) throw new Error('usage: explore "search words"');
  const name = `explore-${slugify(words)}`;
  const hits = await search(`_explore/${slugify(words)}-${opt('orientation', 'all')}`, { q: words, per_page: 32, orientation: opt('orientation', 'all') });
  for (let i = 0; i < hits.length; i += 4) {
    await Promise.all(hits.slice(i, i + 4).map((h) => download(h.webformatURL.replace('_640.', '_340.'), join(CACHE, 'thumbs', `${h.id}.jpg`))));
  }
  writeFileSync(join(mkdirp(join(CACHE, 'sheets')), `${name}.html`), sheet({ name: `“${words}”`, slug: name, type: 'explore', dept: [] }, [{ title: `${hits.length} results`, hits }]));
  console.log(`${name}: ${hits.length} candidates`);
}

async function runPick() {
  const picks = readJson(join(HERE, 'picks.json'), {});
  const creditsFile = join(HERE, 'credits.json');
  const credits = readJson(creditsFile, {});
  const valid = new Set(C.PRODUCTS.flatMap((p) => p.colors.map((c) => `${p.slug}/${slugify(c)}`)));
  for (const [key, pick] of Object.entries(picks)) {
    const site = key.startsWith('media/');
    const base = key.replace(/-\d+$/, '');
    if (!site && !valid.has(base) && !valid.has(key)) throw new Error(`picks.json: ${key} is not a product colour`);
    const [slug, file] = key.split('/');
    if (ONLY && !ONLY.includes(slug)) continue;
    const out = site ? join(ROOT, 'public', `${key}.jpg`) : join(HERE, 'products', slug, `${file}.jpg`);
    const large = join(CACHE, 'large', `${pick.id}.jpg`);
    if (!existsSync(large)) {
      const hit = (await api({ id: pick.id })).hits[0];
      if (!hit) throw new Error(`Pixabay has no image ${pick.id}`);
      if (hit.isAiGenerated) throw new Error(`image ${pick.id} is AI-generated`);
      await download(hit.largeImageURL, large);
      writeJson(join(CACHE, 'large', `${pick.id}.json`), hit);
    }
    const hit = readJson(join(CACHE, 'large', `${pick.id}.json`));
    const [fx, fy] = pick.focus || [0.5, 0.5];
    mkdirSync(dirname(out), { recursive: true });
    const report = execFileSync(PHP, [join(HERE, 'crop.php'), large, out, String(fx), String(fy), String(pick.zoom || 1),
      pick.ratio || '4:5', String(pick.maxWidth || 1024), String(pick.targetKB || 160)], { encoding: 'utf8' }).trim();
    credits[key] = `Photo by ${hit.user} on Pixabay (${hit.pageURL})`;
    console.log(`${key}: ${pick.id} → ${report}`);
  }
  // Photos and credits that are no longer chosen are removed, so the seed only
  // ever contains what picks.json lists.
  for (const key of Object.keys(credits)) if (!picks[key]) delete credits[key];
  if (!ONLY && existsSync(join(HERE, 'products'))) {
    for (const slug of readdirSync(join(HERE, 'products'))) {
      for (const f of readdirSync(join(HERE, 'products', slug))) {
        if (f.endsWith('.jpg') && !picks[`${slug}/${f.slice(0, -4)}`]) {
          rmSync(join(HERE, 'products', slug, f));
          console.log(`removed ${slug}/${f} (no longer in picks.json)`);
        }
      }
    }
  }
  writeJson(creditsFile, Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b))));
  console.log('now run: npm run seed');
}

if (command === 'search') await runSearch();
else if (command === 'explore') await runExplore(args[1]);
else if (command === 'pick') await runPick();
else { console.error('usage: node tools/photos/pixabay.mjs search|explore|pick [--only slug,slug] [--cache dir]'); process.exit(1); }
