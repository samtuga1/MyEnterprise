# Frontend verification — 2026-10-26

## Automated checks actually run

`npm test` / Node's built-in test runner: **22 tests passed, 0 failed**. No external test dependencies.

Verified mock behavior:

- Fixture references, integer monetary values, and nonnegative stock/reservation invariants.
- Cart addition, quantity updates, removal, totals, and saved-state reload.
- Rejection of fractional/invalid/excessive quantities and zero-availability variants.
- Checkout session/address validation; approved and declined payment outcomes.
- Atomic mock checkout and rollback after a second item's stock failure; no duplicate empty-cart checkout.
- Cancellation ownership, status eligibility, reservation release, and one simulated refund.
- Allocation of an unallocated seeded order; one-time shipment deduction and delivery transitions.
- Supplier-offer/minimum checks and one-time full purchase receipt.
- Return ownership/delivery/cumulative quantities, partial returns, ordered review/receipt/refund transitions, and duplicate refund rejection.
- Warranty eligibility, duplicate requests, overlap with return requests, and review transitions.
- Simulated admin checks and stock adjustment reserved floor.
- Product/category/variant/specification edits, unique SKU/category checks, new-variant zero stock, archived-product checkout rejection.
- Supplier/offer editing and registration without password storage.
- Storage-write failure leaves in-memory state unchanged; corrupt-data warning and application-key-only reset.
- All seven report projections, date filtering, return/refund results, rendered customer/admin routes, and escaped editable content.

JavaScript syntax checks were run on all source modules. A local Python static server served the application successfully. These tests use an isolated in-memory storage adapter, not any database.

## Browser walkthrough actually performed

Used the Codex in-app browser against the local server at `127.0.0.1:8080`:

1. Opened home and navigated to ZenBook details. Selected the 32 GB / 1 TB variant; cart showed the $1,199.00 price.
2. Changed quantity to two with **Update**; cart and total showed $2,398.00.
3. Followed checkout's sign-in prompt; the Alex customer demo session preserved the cart.
4. Submitted a simulated declined payment; saw the inline error with the cart unchanged.
5. Submitted an approved payment; order ME-1047 was created with the $2,398.00 total and an empty cart.
6. Switched to admin; dashboard included the new order. Prepared, shipped with DEMO-1047 tracking, and marked it delivered. Allocation detail showed two units from Chicago Central.
7. Switched back to Alex and submitted a one-unit return. Order details displayed Return #702 and its reason.
8. Admin approved, confirmed receipt, and recorded a $1,199.00 simulated refund. The refund ledger showed Completed.
9. Selected business question 6. ZenBook results showed 3 purchased units (including the original seeded purchase), 1 returned unit, a 33.3% return rate, and $1,199.00 completed refunds.
10. Edited a product name in admin and reloaded; the edit persisted.
11. Searched for an unmatched product; saw the empty state. Cleared filters, opened catalog page 2, then filtered laptops and sorted price ascending: $749, $999, $1,099.
12. Used the reset dialog to restore the original sample data. Browser-test orders, edits, refund, cart, and demo session were removed by that explicit demo reset.

## Visual checks and fixes

- Reviewed home in the normal in-app browser at approximately 700–736 CSS pixels, including header, hero, categories, and product cards. Reviewed checkout confirmation and admin workflow screens.
- Inspected home at **1280 CSS pixels** and **390 CSS pixels** using a temporary same-origin iframe viewport harness. The desktop image is scaled down to fit the browser panel; this is a layout check, not a physical-device test.
- Fixed hero artwork overlapping its caption at tablet width, whitespace where mobile styling hides a line break, and explicit non-submit button types inside dialog forms.
- Added an explicit cart Update control for reliable multi-digit keyboard entry and confirmation of recalculated totals.
- Product illustrations, logo, and fallback are local SVG assets. No third-party image service or font service is required.

Screenshots in `docs/screenshots/` capture the real rendered frontend (not SQL execution). The temporary viewport harness is not part of the delivered application.

## Limits

No database was created, imported, connected, reset, or tested. No SQL routines/triggers/cursors or PHP code ran. Mock rollback/idempotency tests do not establish real database transaction safety, concurrency control, payment processing, or backend security. localStorage role checks are intentionally bypassable. No automated screen-reader audit, physical-device testing, or exhaustive browser matrix was performed. The seven reports are JavaScript projections, not database queries.

## Guest checkout dialog update — 2026-10-26

Changed guest checkout from a full-page account prompt to a native modal alert dialog over the cart. It explains that an account is required and offers Create account, Sign in, and Continue shopping. Authentication remains simulated. Direct guest checkout URLs also return to the cart with this dialog. Dialog actions wrap on narrow screens.

Browser checks performed after the change:
- Guest cart checkout opened the alert while the URL stayed `#/cart`.
- Continue shopping and Escape dismissed the alert without removing cart items.
- Create account opened `#/register?next=checkout` only after choosing that action.
- A direct `#/checkout` URL showed the same alert over the cart.
- Sign in opened the login screen; the Alex demo session then resumed checkout with the same one-item/$999 cart.
- A signed-in customer clicked cart checkout and reached shipping details directly.
- Ended the test session, clearing only the test cart; did not reset demo records or create an order.

`node --check` passed for the modified JavaScript modules; `npm test` passed all 22 existing tests. Screenshot: `docs/screenshots/guest-checkout-dialog.png`.

## Fashion storefront correction — 2026-10-28

The earlier electronics screenshots and checks above describe the previous catalog. Current domain is fashion only. The original database diagrams are unchanged.

- `npm test`: **24/24 passed**, including fashion specifications/outfit references, updated clothing prices/refunds/report totals, and preservation of older saved snapshots with a reset notice.
- All bundled SVG files parsed successfully as XML. New fashion illustrations use local paths and the shared fallback.
- Browser verification used a separate local origin, `http://127.0.0.1:8082`, because port 8080 was already occupied. The existing server and its saved data were left untouched.
- Inspected the homepage at 1280px and in a temporary 390px iframe viewport. Fashion navigation, linen-shirt hero, and responsive layout rendered. This is not a physical-device test. The temporary harness was removed.
- Opened Relaxed Linen Shirt, verified material/care details and outfit suggestions, chose L / Relaxed fit in Sage, and added it to the cart at $58. Updated quantity to two; total became $116.
- Guest checkout opened the account-required modal over the cart. Create account then opened registration. Registered a fictional profile and returned to checkout with the same items/total. Approved simulated payment created ME-1047 with two size-L shirts and a $116 total. No money was charged.
- Shoes category showed three products. Price ascending sorted them $89, $95, $110.
- Entered the simulated admin workspace; dashboard included the new $116 order. Product management showed clothing, footwear, and accessories. Edited the shirt variant from M / Relaxed fit to M / Easy fit, saved, and reloaded: the change persisted. Ended the demo session afterward. Test order/profile/edit remain only on the separate test origin.
- Browser console returned no warning/error entries for these flows.

Current screenshots: `screenshots/fashion-home.png`, `screenshots/fashion-checkout-dialog.png`, `screenshots/fashion-mobile.png`. Broader workflow coverage remains in the mock tests and prior browser checks; every administrative workflow was not repeated during this domain update. No backend/database/SQL checks ran.

## Refresh/reset follow-up — 2026-10-28

Inspected the user's reported `http://127.0.0.1:8080/#/` origin. The running server's working directory is this project. A newly opened browser tab loaded fashion page copy but retained an older electronics snapshot with the migration notice. This confirms old saved data remains; it does not prove exactly which JavaScript was loaded in the user's already-open tab when they reset.

Added the same `fashion-20261028-2` revision query to the stylesheet, application entry point, and local ES-module imports so refreshed pages request the current module graph. Updated README to require a page reload before resetting older fixtures. The reset confirmation now explicitly says it loads clothes, shoes, bags, and accessories. Browser verification at the versioned URL showed the new “Load the fashion demo?” dialog. Dismissed it without changing the existing snapshot. `npm test` passed 24/24, including older-snapshot preservation and reset to fashion. No server restart, database action, or clearing of browser storage was performed.

## Product UI, dedicated administration, and violet theme — 2026-10-28

- `npm test`: **26/26 passed** after the administration context and rendering changes. Added coverage that admin mutations preserve the customer session/cart and that customer forms/dashboard omit environment and role-entry controls. JavaScript syntax checks passed.
- Browser checks used a separate origin on port 8083, leaving the existing port 8080 service/data untouched. Home/header/footer and sign-in contained no admin shortcut or demo/environment banner. Guest checkout still opened the account-required dialog; sign-in resumed the same $58 cart.
- Opening `/admin` redirected to `/admin/` and displayed the dashboard directly with its own header/sidebar, metrics, chart, and recent orders. There was no entry gate, hero, storefront category navigation, or customer footer. Admin navigation stayed under `/admin/`.
- Added “Summer essentials” through Categories and reloaded; it persisted. Returned to the storefront and confirmed Alex's sign-in and one-item cart remained intact.
- Checkout blocked an empty address with native required-field validation. Entering fictional shipping details and choosing Place order created ME-1047 for one $58 shirt. The payment test controls and simulation text were absent; payment still used the existing local approved branch, not a payment service.
- The old `/#/admin/reports` bookmark redirected to `/admin/#/admin/reports` and rendered the report with updated order totals.
- Inspected desktop storefront/admin at 1280px and both layouts in a temporary 390px iframe harness. Fixed horizontal dashboard overflow by allowing sidebar/grid columns to shrink. The mobile navigation scrolls horizontally; stat cards fit in two columns. The harness was removed afterward. These checks are not physical-device tests.
- Inspected the final violet logo, buttons, navigation, hero surface, and dashboard chart/surfaces. Main theme contrast calculations: white on primary violet, ink on page background, and muted text on page background all exceed 4.5:1. This is not a full accessibility audit.
- Browser console reported no warning/error entries for the tested flows. Development reset remains at `/tools/reset.html` outside product navigation; no reset was performed during this check.

Current screenshots: `screenshots/storefront-violet.png`, `screenshots/admin-dashboard-violet.png`, and `screenshots/store-admin-mobile-violet.png`. Historical screenshots above retain the previous theme and UI. Local test category/order changes remain only on the test origin. Database design, SQL, and backend implementation remain untouched.

## Customer passwords and admin login — 2026-10-29

- `npm test`: **31/31 passed**. Coverage includes invalid customer/admin credentials, weak/mismatched registration passwords, verifier-only persistence, re-login after reload, admin guard checks, independent sign-out, and non-destructive migration of passwordless records. Syntax checks passed for the changed modules.
- Browser checks used isolated port 8084. The running project server and its existing records on port 8080 were left intact.
- A direct `/admin/#/admin/products` visit redirected to admin login without showing admin data/sidebar. Fixed a discovered base-URL issue by using the absolute admin URL in history.replaceState; the redirect then remained under `/admin/`. Incorrect admin credentials showed an inline error. Correct sample credentials opened the originally requested Products page.
- Admin login did not authorize customer checkout. With one $58 shirt in the cart, checkout still showed the account-required dialog. Create account opened a form with password/confirmation. Mismatched passwords showed an inline error; show/hide changed the field type. Matching fictional test passwords created Casey Test and resumed checkout with the original cart.
- Admin sign-out returned to its login screen and preserved Casey's customer session and cart. Customer sign-out then cleared the cart as documented. Customer sign-in rejected a wrong password. After reloading, the registered password successfully opened that customer's order history. No real credentials, payment, or email services were used.
- Inspected desktop registration/admin-login screens and 390px iframe layouts. Password inputs, labels, show/hide controls, and submit buttons fit their panels. The temporary viewport harness was removed. Browser console showed no warning/error entries in the checked flows.
- Both test sessions were signed out afterward. The fictional test profile remains only on the isolated test origin; no reset or database operation was performed. Main server remains running on port 8080.

Screenshots: `screenshots/customer-password-registration.png`, `screenshots/admin-password-login.png`, `screenshots/password-forms-mobile.png`. This verifies local frontend behavior, not production authentication, security, backend integration, or a complete accessibility audit.

## Shared sample credentials — 2026-10-29

- `npm test`: 33/33 passed. Added saved-account migration coverage for preserved IDs/orders/cart/catalog edits, unrelated registered passwords, and an already-existing `demo@gmail.com` account without duplicates.
- Browser verification on isolated local port 8085: customer sign-in with `demo@gmail.com` / `password1234` opened order history with ME-1042 and ME-1044. Entering `/admin/` still required an independent admin login; the same requested credentials opened the dashboard. No warning/error console messages were reported.
- Screenshot: `docs/screenshots/shared-login-dashboard.png`. Verification server stopped afterward; primary port 8080 server left running. Asset revision is `auth-20261029-2`; refresh existing tabs to load the update, with no reset needed.
- This verifies local frontend behavior only, not backend authentication or authorization.

## Admin login restored on entry — 2026-10-29

- `npm test`: 35/35 passed. Regression checks verify that legacy saved admin sessions are ignored, admin sessions are not persisted by record edits, new repository instances start signed out, and cross-tab record refresh retains only the current page’s admin login. Customer session/cart preservation is also covered.
- Browser checked on the running `http://127.0.0.1:8080`: `/admin/` displayed sign-in; `demo@gmail.com` / `password1234` opened the dashboard; Products navigation remained signed in; refreshing Products required sign-in with the intended Products return destination; reopening `/admin/` required sign-in again. No console warnings/errors were reported. No business records were changed during the browser check.
- Screenshot: `docs/screenshots/admin-entry-requires-login.png`. Asset revision `auth-20261029-3`; refresh previously open tabs to apply it. Port 8080 remains running. These are frontend checks, not backend security verification.
