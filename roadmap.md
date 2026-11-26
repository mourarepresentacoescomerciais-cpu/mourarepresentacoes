# Current tasks

- [x] Set fixed promotions to the entered final price and prevent cumulative client discounts across price displays and cart calculations.
- [x] Preserve automatically saved carts after signing out and signing back in; seven regression tests passed.
- [x] Apply the uploaded references: sober grey field separation, larger sticky step bar, and cart shortcut at the bottom right.
- [x] Add and run regression tests and verify available preview signals; build OK.
- [ ] Verify authenticated client purchase and visual changes end-to-end: blocked because the supplied test account is rejected by the configured external login service.
- [x] Add deletion and replacement controls in client/admin history views and regression tests preserving submitted orders.
- [ ] Enable and verify purchase-history persistence: blocked by unavailable write access to the configured external database; apply supabase/HOTFIX_PURCHASE_HISTORY.sql there (not the unrelated Cloud instance).
- [x] Diagnose current access: public site and admin sign-in succeeded on preview and custom domain; supplied video shows a historical timeout, not reproduced now.
- [x] Enforce fixed-price precedence over customer discounts and promotions; regression tests passed.
- [x] Product forms, fixed-price batch edits and CSV imports now wait for confirmed writes; no-change save of product 63670 returned 204 and read back correctly. Added quoted CSV/decimal-cents handling and failure regression tests (16 tests passed total).
- [ ] Resolve intermittent forbidden writes/image uploads: blocked on reproducing a currently failing authorized session or inspecting the external server's session/role logic; fresh admin save works.
- [ ] Diagnose specific Orders-tab failure: uploaded video did not establish failing action; current admin list shows 3 orders successfully. Need exact failing action/result.