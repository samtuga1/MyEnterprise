# MyEnterprise — frontend prototype

A local fashion-commerce school project built with HTML, CSS, and vanilla JavaScript. The complete customer journey and admin workspace share realistic, persistent mock records. **This phase contains no PHP backend, database connection, SQL, or real authentication/payment processing.** The original 30-table design is unchanged.

## Run locally

From the project directory, with Python 3 installed:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory public
```

Open **http://127.0.0.1:8080/**. Alternatively, `npm start` runs that same command. No `npm install`, build step, CDN, API key, or database is needed. Stop the server with Ctrl+C. If 8080 is occupied, choose another port; browser demo state is separate for each origin/port.

For XAMPP on macOS, copy this project to `/Applications/XAMPP/xamppfiles/htdocs/MyEnterprise`, start **Apache only**, and open **http://localhost/MyEnterprise/public/**. On Windows, the usual directory is `C:\xampp\htdocs\MyEnterprise`. MySQL is unnecessary. Keep all browser assets within `public/`; later configure Apache's document root to `public/` when adding private PHP configuration. Do not open `index.html` via `file://`: ES modules require an HTTP origin.

Use a current browser supporting ES modules, `structuredClone`, `<dialog>`, and localStorage. Node.js 18+ is needed only for the automated tests, not to serve the application with Python or XAMPP.

## Explore

- **Customer:** home → collection → product / variant → cart → checkout → confirmation → order history / detail → cancellation, return, or warranty request.
- **Admin:** manually open `/admin/` (for example `http://127.0.0.1:8080/admin/`) for overview, products, categories, variants/specifications, inventory, suppliers/offers, purchase orders, allocations/fulfillment/shipments, returns/refunds, warranties, and seven business reports.
- Customer routes use URL fragments such as `#/catalog` and `#/product/1`. Administration has a dedicated static directory at `/admin/`; internal pages use `/admin/#/admin/products`, etc. `/admin` redirects to `/admin/` automatically in Python/Apache. Under XAMPP, use `/MyEnterprise/public/admin/`. Older `#/admin/...` bookmarks redirect there. Apache rewrites are unnecessary. No customer-facing page links to administration.
- Search matches product names, brands, descriptions, SKUs, and sizes/fits. Combine category, brand, maximum price, stock, and sort options; click **Apply filters**. Catalog pages contain eight products.
- Cart quantities change after **Update**. Prices use integer cents. Delivery is free and demo tax is zero.
- Guests who select **Continue to checkout** see an account-required dialog over the cart. **Create account** and **Sign in** open their respective screens and return to checkout after authentication; dismissing the dialog preserves the cart. Authentication remains simulated.
- **Place order** validates shipping details, creates a local order, and reserves stock. The visible approved/declined payment test controls have been removed. The existing mock adapter still records an approved payment outcome internally; no payment gateway runs or money moves. Decline/rollback behavior remains covered by the isolated logic tests.
- For development maintenance, open `/tools/reset.html` and choose **Restore fashion samples**. This control is outside storefront/admin navigation. Confirmation replaces only `myenterprise.frontend.v1` in this browser's localStorage. Other site storage and all files/databases remain untouched.

The collection contains 16 fictional fashion products across tops, shoes, bottoms, outerwear, bags/accessories, and dresses. All product artwork is bundled locally. Sizes, material/care details, prices, and quality warranties are illustrative.

If this browser has an earlier demo saved, it is preserved and a notice appears. **Reload the page first** (Cmd+Shift+R on macOS or Ctrl+Shift+R on Windows), then open `/tools/reset.html` and confirm **Restore fashion samples** to load the fashion fixtures. An already-open old page can still run the previous seed code; resetting data alone does not reload JavaScript. Reset removes this app’s saved demo orders and edits; it never happens automatically.

## Frontend-only behavior and simulated identities

The visible pages use ordinary store wording at the user’s request. Demo banners, environment notices, admin shortcuts, role switches, and payment-outcome controls are removed from product UI. This is a presentation change, not a backend implementation. All orders, accounts, refunds, shipments, purchases, and reports still use fictional local records. Do not deploy this as a working shop or enter real personal/payment information or reuse a real account password. Authentication and payment integration remain future backend work.


Sign-in requires email and password. Fictional sample accounts for local testing:

| Profile | Email | Sample password | Seed scenarios |
| --- | --- | --- | --- |
| Alex Morgan | `demo@gmail.com` | `password1234` | Delivered sneakers with an open return; processing tote order |
| Jordan Lee | `jordan@example.com` | `StyleDemo!26` | Two delivered purchases; open coat quality warranty claim |
| Sam Rivera | `sam@example.com` | `StyleDemo!26` | Paid, unallocated dress order |

**Admin login:** `demo@gmail.com` / `password1234`. These credentials are public fictional fixtures, not production secrets.

The primary customer and admin both use `demo@gmail.com` / `password1234`. Refresh to apply the account update; no reset is required. Other existing profiles created before passwords were added use `StyleDemo!26`; their carts, orders, and edits are preserved. The upgrade invalidates earlier passwordless sessions, so sign in again once. New profiles use the password chosen during registration.

Registration creates another fictional profile. Customer registration requires an 8–128 character password and matching confirmation. Sign-in checks the saved local verifier. Administration at `/admin/` requires its own email/password login and supports sign-out without changing the customer session or cart. These role and ownership checks are UI simulations, not a security boundary: anyone can modify browser data. Never use real personal information. Switching customer identities preserves the browser's shared cart; **Sign out** clears it. This is a single-browser teaching fixture, not multiple independent customer accounts.

## Admin actions

1. Products: add/edit a product, assign a category, or archive it using the Active checkbox. Add variants, edit prices/sizes/colors/quality warranty policies, and add/edit/remove individual specifications. New variants start with zero stock.
2. Inventory: filter by warehouse/low stock, adjust on-hand balances with a reason, and inspect recent movements. On-hand cannot fall below reserved stock.
3. Suppliers: add/edit contacts, then create or update an offer (unit cost, lead time, minimum quantity). Purchase orders require a matching offer. Receive each order in full once to increase warehouse stock.
4. Orders: **Allocate & prepare** creates missing warehouse allocations and moves Paid → Processing. **Create shipment** records tracking and deducts allocated stock. **Mark delivered** enables customer after-sales requests. New checkout orders are already reserved; preparation does not reserve twice.
5. Returns: Requested → Approved → Received → Refunded, or reject before approval. Refunds are simulated and never exceed the paid order value. Received returns are not automatically put back into sellable stock.
6. Warranties: Submitted → Under review → Resolved, or Rejected. Resolution records a demo status, not a real repair, replacement shipment, or warranty refund.
7. Reports: choose one of seven questions and dates, then **Run report**. Reports recalculate from the same mock records. Low stock is a current snapshot, with a configurable threshold. Each report explains its date and financial definition.

## Project structure

```text
public/
  index.html                    # Customer entry point
  admin/index.html              # Dedicated admin entry (no storefront header/hero)
  tools/reset.html              # Confirmed development reset, outside product navigation
  assets/css/styles.css         # Responsive violet-and-neutral theme
  assets/images/*.svg           # Bundled product illustrations and fallback
  assets/js/seed.js              # Fictional fixture records
  assets/js/api.js               # Mock repository, validation, mutations, persistence
  assets/js/auth.js              # Local Web Crypto password-verifier helper
  assets/js/reports.js           # Seven mock report projections / metric definitions
  assets/js/ui.js                # Escaping, formatting, accessible form/table helpers
  assets/js/customer.js          # Customer page rendering
  assets/js/admin.js             # Admin page rendering
  assets/js/app.js               # Navigation, event handling, dialogs, shared layout
 tests/mock-api.test.js          # Node built-in tests; no dependencies
 docs/FRONTEND_BACKEND_CONTRACT.md
 docs/DECISIONS.md
 docs/FRONTEND_VERIFICATION.md
```

Rendering modules do not access localStorage. `api.js` is the replaceable data-access boundary. Future PHP integration must introduce awaited requests/loading states and perform all validation, ownership checks, authorization, stock locking, financial checks, and idempotency on the server. Browser checks alone are not sufficient. See the backend contract for original table mappings and missing fields.

## Verification

```sh
npm test
# or, without npm:
node --test tests/*.test.js
```

The tests use isolated in-memory storage, never the user's browser state. They cover successful/failed checkout, second-item rollback, quantities, simulated ownership, duplicate operations, fulfillment, receipts, refunds, warranty transitions, catalog edits, report calculations, storage failure, and escaping. See `docs/FRONTEND_VERIFICATION.md` for actual browser checks and limitations. No database import, SQL execution, or backend security tests have run in this frontend phase.

The SQL course requirements remain future work; this frontend does not satisfy the assignment's database implementation requirements on its own.

## Password-flow implementation limits

Only use fictional test passwords. Customer and admin sign-ins are asynchronous local flows, with masked fields, show/hide controls, required validation, and duplicate-submit prevention. Password verification uses Web Crypto PBKDF2/SHA-256 (100,000 iterations); newly registered profiles get a random 16-byte salt. Salt/hash/iterations are stored under the existing app storage key, never the password or confirmation. Public sample verifiers are bundled in seed.js. This avoids plaintext persistence but is **not secure backend authentication**: browser records, sessions, and code can be edited. There is no server session, identity verification, password recovery, production rate limiting, or email service. Run on localhost or HTTPS for Web Crypto.

Admin sign-in lasts only for the open page and is never restored from localStorage. Reopening or refreshing `/admin/` requires signing in again; internal workspace navigation stays signed in. Legacy saved admin sessions are ignored, and data updates from another tab do not grant admin access. Admin pages redirect signed-out visitors to `/admin/#/admin/login`, retaining the requested page for return after login. A customer session does not authenticate as admin, and admin logout leaves the customer session/cart intact. Future PHP must replace all local verifiers with server-side password hashing and secure session/authorization controls.
