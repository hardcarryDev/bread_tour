# Migrations

Source of truth: `supabase/migrations/` directory. All migrations listed below have been applied to the remote Supabase project.

---

## Applied Migrations

| Filename | Applied | Summary |
|----------|---------|---------|
| `20260619000100_core_schema.sql` | 2026-06-19 | profiles, tours, tour_members, tour_invites; `is_tour_member`/`is_tour_owner` SECURITY DEFINER helpers; `set_updated_at` trigger; owner auto-bootstrap trigger; profile auto-provision trigger |
| `20260619000200_spots_menus_stamps.sql` | 2026-06-19 | spots, spot_menus, stamps; `reorder_spots` RPC; `sync_stamp_tour_id` trigger; partial unique index on active stamps |
| `20260619000300_rls_policies.sql` | 2026-06-19 | Enable RLS on all 7 tables; per-operation SELECT/INSERT/UPDATE/DELETE policies |
| `20260619000400_realtime.sql` | 2026-06-19 | Supabase Realtime publication for live collaboration tables |
| `20260619000500_manual_checkin_requests.sql` | 2026-06-19 | `manual_checkin_requests` table + `confirm_manual_checkin` RPC |
| `20260620000100_accept_invite_rpc.sql` | 2026-06-20 | `accept_invite` RPC for idiomatic invite acceptance |
| `20260620000200_spot_menus_author_check.sql` | 2026-06-20 | Author attribution constraint on spot_menus |
| `20260620000300_fix_tours_select_owner.sql` | 2026-06-20 | Fix tours SELECT RLS to allow owner_id bootstrap flow |
| `20260620000400_accept_invite_idempotent.sql` | 2026-06-20 | Make accept_invite idempotent (re-accept returns silently) |
| `20260620000500_spot_kind_freetext.sql` | 2026-06-20 | Change `spots.kind` from enum to free-text |
| `20260620000600_menu_images.sql` | 2026-06-20 | Add `spot_menus.images jsonb` column for photo attachments |
| `20260620000601_spot_kinds.sql` | 2026-06-20 | `spot_kinds` table for per-tour custom spot category labels (**renamed** from `000600` to resolve timestamp collision with `menu_images`) |
| `20260620000700_menu_text_optional.sql` | 2026-06-20 | Allow photo-only menus by making `menu_text` optional |
| `20260620000701_spot_menus_profiles_fk.sql` | 2026-06-20 | Add FK from `spot_menus.author_id` to `profiles(id)` (**renamed** from `000700` to resolve timestamp collision with `menu_text_optional`) |
| `20260621000100_spot_settlements.sql` | 2026-06-21 | `spot_settlements` table (amount, payer_ids, participant_ids); RLS (any tour member); `sync_settlement_tour_id` trigger |
| `20260621000200_settlement_settled_ids.sql` | 2026-06-21 | Add `settled_ids uuid[]` column to `spot_settlements` for per-participant payment tracking |

---

## Migration Rename Note

Two pairs of migrations originally shared timestamps and were renamed to add a `1` suffix to break the tie:

- `20260620000600_spot_kinds.sql` → `20260620000601_spot_kinds.sql`
- `20260620000700_spot_menus_profiles_fk.sql` → `20260620000701_spot_menus_profiles_fk.sql`

This was required because `supabase db push` blocked on duplicate timestamps. Both renames were applied before the 2026-06-21 deployment.

---

## Pending Migrations

None — all migrations have been applied.

---

## Rollback Notes

| Migration | Risk | Notes |
|-----------|------|-------|
| `20260621000100_spot_settlements.sql` | Medium | DROP TABLE spot_settlements; requires data loss if rows exist |
| `20260621000200_settlement_settled_ids.sql` | Low | ALTER TABLE DROP COLUMN settled_ids; non-destructive if column is empty |
| `20260620000600_menu_images.sql` | Low | ALTER TABLE DROP COLUMN images; non-destructive if no images uploaded |
| `20260620000500_spot_kind_freetext.sql` | High | Reverting free-text to enum requires migrating all existing kind values |
