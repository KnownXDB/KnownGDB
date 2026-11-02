# PlayStation Store live acceptance

Status: accepted against the authorized Supabase project on 2026-11-02.

## Scope

The live acceptance covered the existing canonical `CONTROL Resonant` catalog
item. No new canonical catalog item was created. The two PlayStation scopes were
stored independently:

| Scope | Official URL | Stored identity | Identity scope |
| --- | --- | --- | --- |
| Concept | `https://store.playstation.com/en-us/concept/10017682` | `playstation.concept` / `concept_id` = `10017682` | `catalog_item` |
| Product | `https://store.playstation.com/en-in/product/EP5291-PPSA34547_00-0210080241603648` | `playstation.product` / `product_id` = `EP5291-PPSA34547_00-0210080241603648` | `store_listing` |

Both observations were persisted through
`public.admin_save_playstation_observation` using the existing active Super
Admin session. The resulting listings reported `verified` evidence and
confidence `1.000`; both rows have RLS enabled, with no `anon` or
`authenticated` SELECT privilege and service-role access only. Each observation
created the expected `playstation_observation_verified` audit event.

The API fetcher was also run against both official URLs. It returned the title
`CONTROL Resonant`, preserved the Concept/Product distinction and emitted the
expected identity kind for each page.

## Remote migration ledger

The remote migration tool generated application-time versions rather than using
the source file prefixes. The correspondence is:

| Source file | Remote ledger version | Remote name |
| --- | --- | --- |
| `20261029010000_canonical_catalog_items.sql` | `20261102184903` | `canonical_catalog_items` |
| `20261029020000_store-listings-and-external-identities.sql` | `20261102184912` | `store_listings_and_external_identities` |
| `20261102183641_playstation-store-observation.sql` | `20261102184926` | `playstation_store_observation` |

This is an acceptance record, not a replacement for the repository migration
files. Future migration reconciliation must preserve this mapping and must not
assume that the local filename prefix is present in the hosted ledger.

## Advisory snapshot

Post-acceptance Supabase advisors reported the existing backend-only catalog
pattern: RLS-enabled tables without public policies, service-only catalog
access, the existing `catalog.bootstrap_admin()` security-definer warning, and
disabled leaked-password protection. Performance advisors also reported
unindexed foreign keys and unused indexes. These findings were not changed by
this connector acceptance and require a separate, explicitly scoped security
or performance task.
