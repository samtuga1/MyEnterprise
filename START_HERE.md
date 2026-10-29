# Start here: MyEnterprise frontend phase

Current storefront domain: **fashion (clothes, shoes, and accessories)**, corrected by the user on 2026-10-28. Frontend prototyping remains the current phase; run instructions are in README.md. The database design is unchanged.

The interactive frontend prototype is implemented. The database and PHP backend are deferred.

1. Read `README.md` for local Python/XAMPP setup, demo identities, and walkthroughs.
2. Start the local server: `python3 -m http.server 8080 --bind 127.0.0.1 --directory public`.
3. Open `http://127.0.0.1:8080/`. Browse a product, choose a variant, update the cart, and place a simulated order.
4. Use `demo@gmail.com` / `password1234` for a customer test session. Manually open `http://127.0.0.1:8080/admin/` for administration and sign in with `demo@gmail.com` / `password1234`; no storefront button links there.
5. Run `npm test` to exercise the isolated mock-data checks. Read `docs/FRONTEND_VERIFICATION.md` for what actually ran.
6. Before later backend work, reconcile `docs/DECISIONS.md` and `docs/FRONTEND_BACKEND_CONTRACT.md` with the original PDFs.

The original sources are present:
- `docs/ProjectAssignment.pdf`
- `docs/MyEnterprise_Final_ER_and_Table_Diagrams 2.pdf`
- `docs/FlowChart.jpeg`

All payments, refunds, sessions, shipping, procurement, and reports are simulated. The development maintenance page at `/tools/reset.html` resets only this application's browser storage after confirmation. Product screens use ordinary store wording and a violet theme. There is no database to import or reset in this phase.

The 30-table design is unchanged. Final course submission still requires real SQL, database programming, PHP integration, verification, paper, and presentation. Do not use frontend screenshots as evidence that SQL routines executed.
