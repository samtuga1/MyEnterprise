# Frontend-phase decisions and open questions

Reviewed on 2026-10-26: PROJECT_BRIEF.md, all existing Markdown summaries, ProjectAssignment.pdf (all three pages), MyEnterprise_Final_ER_and_Table_Diagrams 2.pdf (both pages; logical diagram visually inspected), and FlowChart.jpeg. The source PDFs remain authoritative. No tables or columns were added, renamed, or changed.

## Current scope

Only a local frontend is implemented. Plain HTML/CSS/JavaScript with hash routes supplies individual customer/admin screens without a framework or rewrite rules. Native dialogs, labeled forms, visible focus rings, semantic tables, live feedback, and responsive CSS support the prototype. Local SVG product illustrations intentionally avoid external image dependencies. Appearance, specifications, prices, warranties, and supplier terms are illustrative, not current vendor representations.

Mock objects are frontend view models, not a replacement relational schema. Some related entities are nested for presentation convenience. The mapping in FRONTEND_BACKEND_CONTRACT.md covers all 30 original names. No schema correction is authorized or implemented by this task.

## Explicit demo policies

- One browser snapshot is stored under a versioned application-specific key. Mutations operate on a cloned snapshot, validate, then write once; a thrown error leaves the prior state unchanged. This simulates rollback, not database transactions or cross-tab locking. A storage event refreshes another open tab, but concurrent writers may still overwrite each other. Demonstrate in one tab.
- Monetary amounts are USD integer cents. Historical item prices/names/configurations are captured at checkout. Shipping is free; tax and discounts are not modeled. No payment data or password is collected. Financial activity is fictional.
- Guest browsing/cart is allowed. Checkout requires a simulated customer profile; admin uses an explicit role switch. Role/ownership checks help demonstrate intended flows but are not real authentication or authorization.
- Checkout checks stock across warehouses and reserves all items before saving a paid order. Allocation consumes warehouse balances in deterministic order. The seed deliberately includes one paid/unallocated order to demonstrate admin allocation. Reservations reduce availability without reducing on-hand stock. Shipping reduces both exactly once. Cancellation before shipment releases reservations and simulates a full refund.
- Admin receives one-line purchase orders in full, once. No supplier emails are sent. Full receipts follow the brief's initial-scope recommendation; multi-line and partial receipt UX is deferred.
- An order can have allocations in multiple warehouses but one demo shipment/tracking number. This represents a simplified whole-order shipment. The final backend must support the diagram's many shipments if required.
- Delivered items can be returned up to purchased quantity less non-rejected prior requests. A return is refunded only after approval and receipt. Refund value uses the historical item price. Defective returned stock is not automatically sellable; no quarantine table or inspection workflow is added. Simulated cancellation refunds are distinct from return refunds in the view model.
- Warranty eligibility uses order placedAt and variant warranty duration. A delivered item with an active return or open claim cannot open another warranty claim. Claim resolution changes status only. No replacement order, repair job, or warranty payout is implied.
- Reports are JavaScript projections of mock records, never SQL execution or evidence of working procedures/triggers. Date ranges include both endpoints. Report notes distinguish gross sales, completed customer orders, received returns, and completed refunds.

## Conflicts / unresolved backend decisions

1. Assignment deadlines conflict: the steps/ZIP section says November 17, 2026; the results section says November 19. Confirm with Canvas/instructor and plan for the earlier date.
2. Existing assignment/checklist/handoff text said originals were absent. Both PDFs are now present and reviewed under their actual filenames; the checklist and handoff have been updated.
3. FlowChart.jpeg places payment before checking stock, permits backorders, splits shipments, and discusses real card methods. The frontend task explicitly requires simulated payment and no backend. This prototype validates stock before committing any order/payment state and declines unavailable orders. Backorders, partial shipments, and actual payment processing are not implemented. Final workflow policy requires group agreement; this is not a schema decision.
4. The flowchart shows return eligibility by time/condition, but the diagram has neither delivery timestamps nor a return window/policy. The demo allows returns after delivery without a date window. Do not invent a production 30-day promise. Final policy/start date, item inspection, and restocking need agreement.
5. OrderCancellation.cancelledBy points to the Admin side of the supplied logical diagram, while customer-initiated cancellation is requested by the UI. Actor semantics and backend representation remain unresolved. The mock checks ownership but does not alter that FK.
6. Refund in the diagram links a ReturnItem, while cancellation needs a refund without a return. The mock has an explicitly labeled cancellation refund view model; backend representation is unresolved, and no table is changed.
7. Authentication credentials, shipping addresses, product imagery, payment idempotency, shipment dates/carriers, and audit links are missing or underspecified in the diagram. They are documented as required endpoint information, not silently added to the database.
8. Warranty policy cardinality, expiry boundary/month-end behavior, partial returns alongside warranty claims, and final refund status rules need group agreement. Current client date drives claim eligibility, so seeded eligibility changes over time.
9. Warehouse capacity has no unit in the source; the frontend does not claim capacity enforcement. Inventory snapshots reflect an opening fixture state; historical seed shipments are not replayed into stock movements.
10. The original plan prioritized database work first. The user's current instruction explicitly makes frontend prototyping the first implementation phase. Database and backend work remain deferred until separately requested.

## Fashion domain correction — 2026-10-28

The user explicitly replaced the earlier electronics theme with fashion: clothes, shoes, and accessories. This direction takes precedence over the theme in the original materials; PDFs, table names, columns, and relationships remain unchanged. The local catalog now uses fictional fashion labels, 16 products, 22 size/color variants, fabric/care specifications, clothing/footwear suppliers, fit-related returns, and a coat seam defect claim. CompatibilityRule is presented only as a styling suggestion, not a fit guarantee. The existing warranty workflow remains as clearly simulated manufacturing-defect quality coverage; normal wear and sizing preferences are excluded. Final sizing charts, size/width standards, exchanges, return windows, and quality coverage policies require agreement before backend work.

Older browser snapshots are preserved. A persistent notice instructs the user to use the existing confirmed Reset demo action to load the new fashion fixtures. No saved records are silently migrated, repriced, or erased. The catalogDomain marker is frontend-only metadata within the existing application storage key.

## Product presentation and dedicated admin entry — 2026-10-28

The user explicitly requested normal product UI without simulated/environment labels, and administration accessible only by manually entering `{base}/admin`. This supersedes earlier instructions to display simulation banners in product screens. The underlying frontend-only scope is unchanged. Customer header/footer/account screens have no admin link; admin uses its own header/sidebar and a compact dashboard, with no hero, customer category navigation, or entry gate. A physical `admin/index.html` works with Python/Apache without routing middleware; internal routes still use hashes. Legacy root admin hashes redirect.

Admin access uses an explicit local repository context rather than overwriting the customer session. It is not authentication or authorization; PHP integration must enforce those on the server. Customer sign-in remains an email-only local profile selection; no passwords, magic links, verification email, or identity checks are implemented. Checkout no longer offers payment-outcome testing controls; it calls the existing approved mock-payment branch internally. Paid/refund/shipment records remain simulations. No real credentials or card details are collected. Shipping fields begin empty. The confirmed reset utility moved to `/tools/reset.html`, outside product navigation. All limitations and running instructions remain documented in README.

The user subsequently selected violet as the primary theme. Brand tokens, logo, navigation, controls, focus rings, surface tints, and dashboard charts use violet with neutral text/surfaces; garment illustration colors remain faithful to their product descriptions.

## Password and admin login flows — 2026-10-29

The user now requires passwords for customer sign-in/registration and a dedicated admin login. This supersedes earlier passwordless/direct-admin-access presentation decisions; no backend or schema changes are authorized. Normal product wording and the violet theme remain.

The mock API exposes asynchronous `login(email, password)`, `register({name,email,password,confirmPassword})`, and `loginAdmin(email,password)`, plus separate customer/admin logout. Registration checks 8–128 characters and exact confirmation. Each new customer has a frontend-only credential object with PBKDF2/SHA-256 hash, 16-byte random salt, and 100,000 iterations. No plaintext password or confirmation is persisted. Public fixture accounts use documented test passwords. `authVersion:1` and `adminSession` are local view-model metadata, not proposed database columns. Existing passwordless snapshots gain the documented customer sample verifier and lose their old sessions; orders, carts, customers, and catalog edits remain. Admin actions require an authenticated admin session and admin context; a customer session is independent.

The admin route guard preserves an internal requested destination through login, and admin sign-out returns to login without changing the customer session/cart. Customer checkout still resumes after sign-in or registration. These client-side guards/verifiers are bypassable and do not establish real authentication or authorization. PHP must replace them with server-side password hashing, session issuance/expiry/revocation, CSRF protections, authorization and abuse controls. Do not send these local verifiers as proof of identity. Authentication endpoint errors should map to inline form feedback. Password recovery and identity verification remain deferred.

## Shared sample login — 2026-10-29

At the user’s request, both the primary customer and admin use `demo@gmail.com` / `password1234`. These are public frontend fixtures. Customer and admin sessions remain separate. `demoLoginVersion:1` is frontend-only migration metadata: older saved snapshots rename the original Alex sample account while preserving its ID, orders, cart, and other records. If the requested email already exists, that account receives the requested sample verifier instead, avoiding duplicate emails. Other registered credentials remain unchanged. The migration is saved with the next successful mutation; no reset is required. Secondary sample customers retain their documented passwords. No database design changes were made.

## Admin sign-in on entry — 2026-10-29

The user reported that opening `/admin/` skipped login because the previous implementation restored `adminSession` from localStorage. Admin authentication is now held only in memory for the current page. A new page load, reload, or newly opened tab always starts signed out, including when older storage contains an admin session. Hash navigation within the workspace retains login. The repository `refresh()` reloads shared records without importing another page’s admin authentication or discarding this page’s login. Persisted snapshots keep `adminSession:null`; customer sessions, carts, and business records keep their existing persistence. This supersedes earlier references to persisted admin sessions. The separate login and route guard remain frontend-only behavior; backend session policy is deferred.
