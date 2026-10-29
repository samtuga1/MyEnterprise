# Project instructions

## Current phase: frontend prototyping

- The domain is fashion only: clothing, shoes, bags, and accessories. Use size/fit and color variants, fabric/care specifications, and outfit suggestions. Preserve the original schema; the user corrected the earlier electronics theme on 2026-10-28.

- Implement and refine only the local HTML/CSS/JavaScript prototype unless the user explicitly starts backend/database work. Do not add SQL, database connections, or alter the 30-table design in this phase.
- Run with `python3 -m http.server 8080 --bind 127.0.0.1 --directory public` (or `npm start`). XAMPP needs Apache only; see README.md.
- Keep fictional fixtures in `public/assets/js/seed.js`, data access/mutations in `api.js`, mock report projections in `reports.js`, and page rendering separate. Future PHP integration replaces the data boundary; never connect the browser to a database.
- Product UI uses normal customer/admin wording with no demo/environment banners or test-outcome controls, per the user’s 2026-10-28 direction. Document simulated authentication, payments/refunds, fulfillment, and procurement in README and the backend contract. Keep all behavior local; use fictional test passwords only, never collect card details, and do not add real services. Password fields and local verification are authorized as of 2026-10-29; persist only salted verifiers, never plaintext.
- Serve administration at `{base}/admin/` through its own static entry. Customer navigation/footer/account pages must not link to it. Administration requires its own email/password login before showing a compact metrics dashboard and separate navigation; no hero or demo role-switch button.
- Keep the customer session/cart intact when entering admin. Admin requires both its own in-memory page session and the admin repository context for mock mutations. This remains a frontend development convenience, never backend authorization.
- Persist only under `myenterprise.frontend.v1`; development reset lives at `{base}/tools/reset.html`, outside product navigation, and resets only this application key with a confirmation dialog. Never clear all browser storage or any existing database.
- Document frontend-only fields and unresolved schema/workflow gaps in docs/FRONTEND_BACKEND_CONTRACT.md and docs/DECISIONS.md.
- Use violet as the primary brand/theme color, with neutral surfaces, readable text, and clear focus states. Product artwork retains its actual garment colors.
- Use bundled images with reliable fallbacks, responsive layouts, accessible labels/focus/dialogs, and escaped output for all editable content.
- Keep the asset revision query in index.html and all local ES-module imports consistent; bump it when shipping a new prototype version. Reload an already-open browser page before resetting to new fixtures.
- Run `npm test` for mock logic changes. Check affected customer/admin flows in the browser and record actual verification in docs/FRONTEND_VERIFICATION.md. Mock checks do not prove backend security, transactions, SQL execution, or course requirement completion.

## Full-project requirements (database/backend work deferred)

- Build a school database project named MyEnterprise, focused on fashion commerce (clothing, shoes, and accessories).
- Read PROJECT_BRIEF.md and the documents in docs/ before making schema or workflow decisions. Original assignment and diagram PDFs take precedence over these summaries. Record unresolved conflicts.
- Stack: plain PHP, MySQL/MariaDB, HTML, CSS, and minimal JavaScript. Local XAMPP is the intended setup; online hosting is unnecessary for the demonstration.
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
