# Architecture decisions

- The storefront currently uses the externally configured database in the generated client; keep database hotfixes idempotent in `supabase/` because applying them to a different managed instance would not affect production.
- Keep promotional pricing in the pure promotionPricing module and reuse its sale-price resolver in catalog and cart calculations so pricing cannot diverge between views.
- Persist carts per account and company with useCartPersistence, waiting for restoration before autosave and excluding image data on every write to prevent empty-state overwrites and browser quota failures.
- Keep purchase-history edits in per-client product overrides through session-validated RPCs shared by administrator and client views; never mutate submitted order snapshots for history-list changes.
- Product edits and price imports must await confirmed database writes before updating the shared cache or closing forms; parse price CSVs with Papa Parse to preserve quoted fields and decimal cents.