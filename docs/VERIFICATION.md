# Verification record

What was actually run on 2026-11-07, 2026-11-09 and 2026-11-10, and the results. Only checks listed here were performed. This file replaces FRONTEND_VERIFICATION.md, which recorded checks of the earlier mock prototype.

## 2026-11-10: logo

- `php tools/brand/make-icons.php` wrote the mark (128 px), favicon (64 px), home-screen icon (180 px) and `share.jpg` (1200 × 630). Each was checked by eye at 16–180 px and on the dark footer colour.
- `npm run build` succeeded, and `npm test` passed 11 of 11.
- Through XAMPP Apache:
  - `favicon.png`, `apple-touch-icon.png` and `share.jpg` return 200 with image types;
  - the shop and admin pages link the new icons.
- Chrome screenshots:
  - shop header and footer at 1440, and the header at 390;
  - admin sign-in and admin sidebar at 1440;
  - the mark loaded everywhere, with no console errors.
- At 320 px wide: no horizontal overflow on home or women (`scrollWidth` 320), and no broken images.
- `tools/shoot.mjs` now force-stops Chrome if it ignores the normal stop signal. Chrome 157 did, which left the tool running after it had finished.

## 2026-11-10: real photographs from Pixabay

Same environment as below. The seed changed (photographs, and 17 products' colours renamed to match them), so the database checks were repeated on the regenerated files. Current seed counts are the ones in docs/DATABASE.md.

| Check | Result |
| --- | --- |
| Pixabay API | The key works (`X-RateLimit-Limit: 100`). About 125 searches and 80 single-image lookups, throttled to under 100 a minute. No AI-generated or low-quality images were used |
| Photographs | 77 JPEGs: one for each of the 70 product colours, plus 7 second views. 7.3 MB in all, the largest 158 KB, each 576–1024 pixels wide in the 4:5 frame. Each was checked by eye on contact sheets. Photos with visible real brand marks (MEINDL, Brooks) were rejected |
| Generated SQL | `06_seed_images.sql` is 10.1 MB; `myenterprise_full.sql` and the reset script are 10.8 MB. Every statement is under 1 MB (`npm test`) |
| Reset script import (`mysql` client, `max_allowed_packet` = 1 MB) | About 1.1 s, no errors. 77 pictures, all `image/jpeg`, all with a Pixabay credit. Every one of the 70 colours has its own picture (SQL check) |
| `08_verify_invariants.sql` | 23 of 23 OK on the fresh seed, after `09_demonstrations.sql`, and after the API tests (run inside the suite) |
| `09_demonstrations.sql` (`--force`) | 17 errors, all intended (unchanged list). Section 10b now prints the JPEG signature `FFD8FFE0` and the photographer credit |
| `npm test` | 11 of 11 passed |
| `tests/api.test.mjs` (13 tests) | **13 of 13** through `php -S`, on the seed before the last colour-order change (the cotton tee's black colour moved first). **13 of 13** through XAMPP Apache in `/MyEnterprise`, both before and after that change. The picture test now expects JPEG seed pictures. It also checks that an upload sent with `main` becomes the colour's main picture, and that one sent without it is added after the existing photograph |
| Business queries Q1–Q7 on the final seed (`mysql` client, default parameters) | Rows returned: Q1 8, Q2 15, Q3 11, Q4 6, Q5 24, Q6 21, Q7 13 |

Chrome through Apache:

- home, women, men, two product pages, sign-in and register at 1440 × 900;
- home, women and a product page at 390 × 844;
- the admin product page's Pictures panel, signed in as the demo admin.

The hero is the new photograph. Product cards, galleries and the sign-in and register artwork all show photographs.

A browser check counted the pictures after scrolling each page:

| Page | Pictures from `/api/images/` | Broken | Fallback |
| --- | --- | --- | --- |
| Home | 3, plus the hero file | 0 | 0 |
| Women | 12 | 0 | 0 |
| Men | 12 | 0 | 0 |
| Product page | 7 | 0 | 0 |
| Sign-in | 1 | 0 | 0 |
| Register | 1 | 0 | 0 |

`tools/shoot.mjs` reported no console errors or failed requests. Its wait for Chrome to start was raised from 10 to 30 seconds, because a first headless start on this machine took longer than 10.

Not verified in this round:

- the phpMyAdmin web import of the 10.8 MB file;
- the look on a high-density screen at large sizes (Pixabay's free API gives at most 1280 pixels).

## 2026-11-09: product pictures stored in the database

This round ran on the same environment as below. The checks from 2026-11-07 further down were all repeated where the change could affect them. Current object counts are the ones in this section.

| Check | Result |
| --- | --- |
| Feature test on MariaDB 10.4.28, before writing the schema | Accepted:<br>• a STORED generated `SHA2(data, 256)` with a UNIQUE key;<br>• CHECKs on `OCTET_LENGTH(data)` and `mime_type`;<br>• `FROM_BASE64` with line breaks.<br>The generated hash matched `shasum -a 256`. A duplicate file was refused (1062); a GIF type and an empty file were refused (4025) |
| Reset script import (`mysql` client) | About 1 s, no errors. 72 pictures, 313 KB of image data, the largest 8 KB. `06_seed_images.sql` is 0.45 MB; `myenterprise_full.sql` is 1.1 MB |
| Objects (information_schema) | 31 tables, 45 foreign keys, 25 UNIQUE, 64 CHECK constraints on 28 tables, 6 functions, 94 indexes |
| `fn_product_image` | The right picture for each colour; NULL for a colour the product does not have; the first colour's picture for the product as a whole |
| `08_verify_invariants.sql` | 23 of 23 OK on the fresh seed, after `09_demonstrations.sql`, and after the API tests (run inside the suite) |
| `09_demonstrations.sql` (`--force`) | 17 errors, all intended: the 15 listed below plus a duplicate picture (`uq_image_sha`) and a GIF (`chk_image_mime`). The new section 10b printed the picture rows, the F6 keys and the first bytes of a stored SVG |
| `npm test` | 11 of 11 passed. New checks: the ProductImage design, at least 72 seed pictures, and every statement in both seed files under 1 MB |
| `tests/api.test.mjs` (13 tests) | **13 of 13 passed** through `php -S`, and **13 of 13** through XAMPP Apache in `/MyEnterprise`, each on a freshly reset database |

The new API test, "pictures: stored as binary in ProductImage, served by hash, uploads shrunk and de-duplicated", covers:

- the served bytes hash to their own address, with an immutable cache and 304 on `If-None-Match`;
- an unknown key gives 404, and the slug + colour address works;
- a shopper cannot upload (401);
- a 1600 × 2000 PNG upload is stored as JPEG within 1200 × 1500 and 512 KB, becomes the colour's main picture and appears in the shop;
- uploading the same file again gives 409, a PHP text file named as a picture gives 422, and an unknown colour gives 422;
- make-main and delete reorder correctly.

Manual upload checks with `curl` (admin session, CSRF token):

- a 3000 × 4000 JPEG was stored as 1125 × 1500, 120 KB;
- a 5 MB pure-noise JPEG (the worst case for compression) was stored at 481 KB after automatic quality step-down;
- a transparent PNG was flattened onto the shop's background;
- a request without the CSRF token got 403;
- the served SVG was byte-for-byte identical to its source file (`cmp`).

Apache probes:

- a picture response has `Content-Type`, `Content-Length`, the immutable `Cache-Control`, `ETag`, `nosniff` and a `sandbox` Content-Security-Policy, and no session cookie;
- `/tools/art/…` and `/database/06_seed_images.sql` give 403;
- `/media/fallback.svg` and the hero give 200.

Chrome through Apache: on home, men, a product page, register, admin products and admin inventory, no picture was broken and none fell back. Every product picture came from `/api/images/` (12, 12, 10, 1, 34 and 40 pictures). No console errors.

Screenshots at 1440 and 390:

- the admin Pictures panel (upload, main badge, make main, delete);
- the product page with two pictures for a colour;
- the shop listing and the sign-in artwork.

Two layout bugs were found in the new panel and fixed: the badge showed both a dot and an icon, and on phones the "Add picture" tile had no width.

Not verified in this round:

- real photographs (waiting for a Pixabay API key; every seed picture was still a drawing). Done on 2026-11-10, above;
- the phpMyAdmin web import of the larger file;
- WebP uploads on a server whose GD supports WebP;
- the EXIF rotation path with a real phone photo.

## Environment

| Part | Version |
| --- | --- |
| Machine | macOS (Darwin 25.5) |
| Database | MariaDB 10.4.28, using the binaries that ship with XAMPP 8.2.4, as a separate instance on port 3307. The XAMPP MySQL data directory and its other databases were not touched |
| PHP | 8.2.4 (XAMPP) |
| Apache | 2.4.56 (XAMPP's `httpd` with mod_rewrite and mod_php, started with its own config on port 8081, serving the project as `/MyEnterprise`) |
| Node.js | 22.22.2 (build and tests only) |
| Browser | Google Chrome, headless, through `tools/shoot.mjs` |

## Database

| Check | Result |
| --- | --- |
| Import of `00`–`06` and of `reset/RESET_myenterprise_DESTRUCTIVE.sql` with the `mysql` client | Loads without errors in about 0.3 s. Triggers stay active during the seed load, so every seeded return line, refund, allocation, claim and stock movement was re-validated by the database |
| Objects created (information_schema) | 30 tables, 43 foreign keys, 24 UNIQUE constraints, 59 CHECK constraints on 27 tables, 5 functions, 6 procedures (4 with cursors), 9 triggers, 3 views |
| `08_verify_invariants.sql` | 23 of 23 OK in each case:<br>• on the fresh seed;<br>• after `09_demonstrations.sql`;<br>• after each run of the API test suite;<br>• after the admin flows driven through the interface |
| `09_demonstrations.sql` (`mysql --force`) | 15 errors, all of them the intended rejections:<br>• receiving a purchase order twice;<br>• checking out the same bag twice;<br>• cancelling a shipped order;<br>• returning more than bought;<br>• refunding before approval;<br>• refunding more than the returned value;<br>• a duplicate open claim, and a claim on the wrong variant;<br>• editing or deleting the stock ledger (2);<br>• removing reserved stock;<br>• four CHECK violations.<br>Every procedure, cursor, function and trigger in the file ran |
| Rollback test | A checkout whose second bag line was oversold left no order, payment or reservation, and the bag stayed active |
| Business queries Q1–Q7 on the seed (2026-01-01 to 2026-12-31) | Rows returned: Q1 8, Q2 15, Q3 16, Q4 6, Q5 19, Q6 22, Q7 15 |

Problems found and fixed during these checks:

- **Collation mix:** XAMPP's default is `utf8mb4_general_ci`, and comparing table columns with session variables failed. Fixed by switching the database to the same collation.
- **MariaDB error 1442:** delivering parcels with an UPDATE that joins Fulfillment failed, because trigger T6 writes Fulfillment. Parcels are now delivered with a single-table UPDATE, and this is documented.
- **`sp_complete_return`:** it could "complete" a return with no lines. Invariant M3 caught it; the procedure now refuses it.

## API (`tests/api.test.mjs`, 12 end-to-end tests)

Each run started from a freshly reset database:

- **12 of 12 passed** through XAMPP Apache in the `/MyEnterprise` subfolder;
- **12 of 12 passed** through `php -S` with `public/router.php`.

The suite covers:

- **Catalogue:** filters and sorting.
- **Security:** CSRF enforcement, and customers being refused at admin endpoints.
- **Shopping:** guest-bag merge at sign-in, checkout (`sp_checkout_cart`), and the double-checkout refusal.
- **Customer actions:** cancellation (`sp_cancel_order`), and the T2 return limit.
- **Admin access:** admin sign-in, and the catalog role refused at purchasing.
- **Fulfilment:** start → ship (`sp_ship_order`) → deliver (T6).
- **Returns:** refunding a return (`sp_complete_return`, T3), and the double-refund refusal.
- **Purchasing:** receiving a purchase order once (`sp_receive_purchase_order`, T1), and the minimum order.
- **Stock:** adjustments respecting reservations.
- **Reporting:** all seven reports, the database explorer, and the invariants after every test.

One bug was found only under Apache. The CSRF error used the unofficial status 419, which Apache rewrites as 500, so the interface's automatic retry would not have worked on XAMPP. It now returns 403 with error code `csrf`.

`npm test` (fast checks of the SQL files, query files, packet size and frontend helpers): **10 of 10 passed.**

## Web server and security probes (Apache)

| Request | Result |
| --- | --- |
| `/MyEnterprise/`, `/shop/women`, `/admin`, `/admin/orders` | 200, the app shell with `<base href="/MyEnterprise/app/">` and base `/MyEnterprise` detected |
| `/api/session`, `/api/products?…`, `/media/products/fallback.svg` | 200, with the right content types |
| `/backend/config/config.example.php`, `/backend/routes.php`, `/database/01_schema.sql`, `/tools/build-sql.mjs`, `/uploads/x.php` | 403 |
| Page headers | Content-Security-Policy with a per-request script nonce, X-Frame-Options DENY, nosniff, Referrer-Policy |
| `npm audit` | 0 vulnerabilities (React Router upgraded to 7.18.4 and Vite to 6.4.5 to clear advisories) |

## Interface checks in Chrome

Pages were captured at 1440×900 and 390×844, and the storefront also at 320 wide.

- **Storefront:** home (every scroll position), shop with filters, product page, bag drawer after add-to-bag, checkout, the thank-you page after placing an order through the form, account, order detail, sign-in.
- **Admin (driven through the interface by the admin build):**
  - start, ship and deliver an order;
  - receive a purchase order;
  - approve and refund a return;
  - approve a claim;
  - create a purchase order from the suggested reorders;
  - edit a variant;
  - upload a photograph (the test file was removed afterwards);
  - run report Q1;
  - run the integrity checks;
  - sign in with the catalog role;
  - phone views of the dashboard, menu, orders and a report.
- **Overflow:** none at 390 or 320 on the home, shop, product, checkout, account and sign-in pages (`scrollWidth` equals the viewport). Three overflow bugs were found and fixed: product details at 390, the home hero at 320, and the header at 320.
- **Errors:** no console errors or failed requests on the pages captured through Apache.

## taste-skill finish gate

The gate ran against the built home page through Apache: `gate.mjs`, kind *product*, three rounds.

- **Round 1:** 65 FAIL.
- **Round 2:** 21 FAIL.
- **Round 3:** **GATE: OPEN 4.** The rounds were used up.

The final state had one waiver applied: `card-layout` on the new-in product grid, with the reason "the shop's one product grid: identical product cards are the catalogue convention". The waiver for `#root` was not needed in the end.

The four findings open at the last gate run:

1. The closing section's content ran 46px past one screen at 1440×900.
2. The header overflowed at 320px wide.
3. The hero overflowed at 320px wide.
4. At 390px, about 100px of the coats section showed below the pinned-chapters section (the moment's static phone form).

After the gate, 1–3 were fixed and re-measured with `tools/shoot.mjs`: the closing is exactly 900px at 1440×900, and there is no horizontal overflow at 320 on any storefront page checked. Item 4 is still open. The gate itself was not re-run, because its three rounds were spent.

## Not verified

- **phpMyAdmin:** the import through the phpMyAdmin web interface was not run. The SQL was imported with the `mysql` client. Every statement is under 1 MB (XAMPP's `max_allowed_packet`), and the routines use `DELIMITER`, which phpMyAdmin's importer supports.
- **Other platforms:** XAMPP on Windows, MySQL 8, and browsers other than Chrome.
- **Accessibility:** no screen-reader pass. Labels, focus order and dialog focus trapping are implemented but were not tested with assistive technology.
- **Load:** behaviour under many concurrent shoppers. Row locking is designed for it, but there was no load test.

## Circular logo asset — 2026-11-10

Generated and visually inspected `public/media/myenterprise-icon-v1.png`: circular violet/ivory ME monogram with no wordmark. PNG alpha metadata checked with `sips`. `npm test`: 11/11 passed. This is a standalone artwork addition; no pages, backend or SQL changed, so no browser or database checks were run. Generation prompt recorded in `docs/LOGO_GENERATION.md`.
