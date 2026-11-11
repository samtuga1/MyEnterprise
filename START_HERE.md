# Start here

MyEnterprise is a fashion shop (clothing, shoes, bags, accessories) built for the COMP 5314 database project. The database, the PHP API and the React interface are all implemented.

1. **Run it:** follow "Run it on XAMPP" in `README.md`. Import `database/myenterprise_full.sql` in phpMyAdmin, then open http://localhost/MyEnterprise/ (the admin is at `/admin`).
2. **Understand the database:** read `docs/DATABASE.md`. It covers the tables and every change from the diagram, constraints, functions, procedures with cursors, triggers, the seven business queries, the integrity checks, and a suggested demonstration order. The diagram is in `docs/ER_DIAGRAM.md`.
3. **Sign in:** use `demo@gmail.com` / `password1234`, for the shop and for the admin. Other staff accounts are listed in README.md.
4. **Screenshots for the paper:** run `database/09_demonstrations.sql` block by block in phpMyAdmin, then `database/08_verify_invariants.sql`. The admin's Reports and Database pages show the queries, triggers and routines live.
5. **Start over:** import `database/reset/RESET_myenterprise_DESTRUCTIVE.sql`. It rebuilds only the `myenterprise` database.
6. **What was checked:** `docs/VERIFICATION.md` lists every check that actually ran and its result.

Original sources: `docs/ProjectAssignment.pdf`, `docs/MyEnterprise_Final_ER_and_Table_Diagrams 2.pdf`, `docs/FlowChart.jpeg`.
