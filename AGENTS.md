# Project instructions

## Current phase: full stack (database, PHP API, React interface) — started 2026-11-07

The user started database and backend work on 2026-11-07, asked for React, and asked to use the taste-skill (installed as `design-taste-frontend`). The earlier frontend-only prototype was replaced; it remains in git history.

- The domain is fashion only: clothing, shoes, bags, and accessories. Use size and colour variants (`ProductVariant.configuration` holds the size), fabric/care/measurement specifications, and "Style it with" pairings (`CompatibilityRule`). The user corrected the earlier electronics theme on 2026-10-28.
- The database is the priority (the professor focuses on database design). Keep the 30 tables of the diagram plus the added `ProductImage` (31); `Order` is `CustomerOrder` (reserved word). Every added column is marked `-- [added]` in `database/01_schema.sql` and justified in `docs/DATABASE.md` §2. Business operations that change several tables are stored procedures; PHP calls them and does not wrap them in its own transaction.
- Layout: `database/` (numbered SQL, `queries/`, verification, demonstrations, reset), `backend/` (PHP API, not web-served), `frontend/` (React source: `src/store`, `src/admin`, `src/shared`), `public/` (web root: `index.php` shell, `api/`, built `app/`, `media/` for site artwork only), `tools/`, `tests/`, `docs/`.
- Never edit `database/06_seed_data.sql`, `06_seed_images.sql`, `myenterprise_full.sql`, `07_business_queries.sql` or the reset script by hand: change `tools/seed/*` or the numbered sources, then run `npm run seed` / `npm run build:sql`. After SQL changes, reload a test database and run `database/08_verify_invariants.sql` (all 23 must be OK).
- The PHP reports page runs `database/queries/q*.sql` directly (marker `-- @query`, parameters as `SET @name = default;`). Keep one source of truth for each query.
- Product UI uses normal customer/admin wording with no demo/environment banners, sample credentials or test-outcome controls (user direction 2026-10-28). Payments, refunds and shipping are simulated: never collect card details or add real services. Passwords are stored only as `password_hash` bcrypt hashes. Sample accounts use fictional data; `demo@gmail.com` / `password1234` for the shop and the admin (user direction 2026-10-29).
- Administration lives at `{base}/admin` as its own build (`frontend/admin.html`) with its own sign-in; the storefront must never link to it. Customer and admin sessions are separate keys in the PHP session, so signing in to admin never touches the shopper's bag. Server-side role checks in `backend/routes.php` are the real authorization.
- The logo is the user's violet "ME" circle (`public/media/myenterprise-icon-v1.png`); `php tools/brand/make-icons.php` makes the header mark, favicon, touch icon and share image from it (2026-11-10).
- Use violet (`--accent: #5b2b86`) as the brand accent on the dealt warm-neutral ground with Instrument Serif / Instrument Sans; colour otherwise comes from the products. The taste-skill forbids violet; the user's instruction wins. Follow the skill's motion rules: hero entrance, one dealt moment (pinned chapters), hover/press layer, no scroll reveals; Framer Motion for app transitions (drawer, modal, toasts, layout changes), always respecting reduced motion.
- Build the interface with `npm run build` (output committed in `public/app/` so XAMPP users need no Node).
- Product pictures are stored in the database (`ProductImage.data`, MEDIUMBLOB, user request 2026-11-09), never as files in `public/`. Pages get them from `api/images/{sha256}` (`fn_product_image` picks one). Seed pictures are the Pixabay photographs in `tools/photos/products/` (chosen in `tools/photos/picks.json`, prepared by `node tools/photos/pixabay.mjs pick`, credits in `tools/photos/credits.json`; no photos with real brand logos) or else the drawings of `npm run art` in `tools/art/products/`; `npm run seed` writes `06_seed_images.sql`. The Pixabay key lives only in the git-ignored `tools/photos/.env`. Catalogue colours follow the photographs (2026-11-10). Uploads are re-encoded to JPEG under 512 KB (XAMPP `max_allowed_packet` is 1 MB). Photo source: Pixabay API (Pexels keys are paused; Unsplash requires hotlinking). Never work around a site's bot checks.
- Run `npm test` (fast checks) for any change, and `npm run test:api` against a disposable database copy for backend/SQL changes. Check affected pages in a browser (`tools/shoot.mjs`) and record what actually ran in `docs/VERIFICATION.md`. Never reset the user's own XAMPP databases; the destructive reset script only touches `myenterprise` and must stay clearly labelled.

## Full-project requirements

- Build a school database project named MyEnterprise, focused on fashion commerce (clothing, shoes, and accessories).
- Read PROJECT_BRIEF.md and the documents in docs/ before making schema or workflow decisions. Original assignment and diagram PDFs take precedence over these summaries. Record unresolved conflicts.
- Stack: plain PHP, MySQL/MariaDB, and a React interface (user request 2026-11-07) built to static files that PHP serves. Local XAMPP is the intended setup; online hosting is unnecessary for the demonstration.
- Preserve the 30-table design as the starting point. Justify any schema additions or corrections in docs/DECISIONS.md and keep a mapping to original table names.
- Separate SQL schema, seed data, routines, triggers, business queries, verification scripts, PHP backend, and frontend assets.
- Keep SQL importable through phpMyAdmin. Document import order, supported database version, and delimiter handling.
- Use InnoDB and transactions for multi-step business operations. Use prepared statements, server-side validation, authorization checks, escaped output, CSRF protection for browser mutations, and secure password hashing if authentication is implemented.
- Never commit real credentials. Supply a configuration example and ignore local secrets. Demo accounts must be clearly labeled.
- Do not use real payment processing; use documented simulated transactions and refunds.
- A SQL reporting query does not need a trigger or cursor. Triggers respond to data changes. Keep business behavior and reporting requirements distinct.
- Use three explicit cursors inside stored procedures if appropriate; document each cursor and demonstrate it independently. Do not create unnecessary loops elsewhere merely to use cursors.
- Verify financial and stock invariants, duplicate operations, and failure rollback. Do not claim tests or imports passed unless they actually ran.
- Do not reset existing databases or overwrite uncommitted group work without explicit authorization. Destructive demo reset scripts must be separate and clearly labeled.
- Explain implemented database logic in plain language so all group members can present it.
