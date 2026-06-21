# Row-Level Security Policies

All tables use Supabase PostgreSQL RLS with `FORCE` (table owner also subject to RLS via PostgREST). Policies are default-deny: a row is only accessible when a matching policy clause returns true. The anon key is public; data security depends entirely on these policies.

Membership checks use two SECURITY DEFINER helper functions to avoid RLS recursion on `tour_members`:
- `is_tour_member(tour_id uuid) → boolean` — current user is any member
- `is_tour_owner(tour_id uuid) → boolean` — current user has `role = 'owner'`

---

## Supabase RLS Policies

### profiles

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `profiles_select` | SELECT | `id = auth.uid()` OR user shares a tour with the profile owner |
| `profiles_insert` | INSERT | `id = auth.uid()` |
| `profiles_update` | UPDATE | `id = auth.uid()` |
| DELETE | — | No policy; deletion only via `auth.users` cascade |

### tours

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `tours_select` | SELECT | `is_tour_member(id)` |
| `tours_insert` | INSERT | `owner_id = auth.uid()` |
| `tours_update` | UPDATE | `is_tour_owner(id)` |
| `tours_delete` | DELETE | `is_tour_owner(id)` |

### tour_members

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `tour_members_select` | SELECT | `is_tour_member(tour_id)` |
| `tour_members_insert` | INSERT | `is_tour_owner(tour_id)` OR (`user_id = auth.uid()` AND `role = 'member'`) — invite acceptance |
| `tour_members_update` | UPDATE | `is_tour_owner(tour_id)` |
| `tour_members_delete` | DELETE | `is_tour_owner(tour_id)` OR `user_id = auth.uid()` (leave) |

### tour_invites

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `tour_invites_select` | SELECT | `is_tour_member(tour_id)` OR `invited_email = auth.jwt()->>'email'` |
| `tour_invites_insert` | INSERT | `is_tour_member(tour_id)` AND `invited_by = auth.uid()` |
| `tour_invites_update` | UPDATE | `is_tour_owner(tour_id)` OR `invited_email = auth.jwt()->>'email'` |
| `tour_invites_delete` | DELETE | `is_tour_owner(tour_id)` |

### spots

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `spots_select` | SELECT | `is_tour_member(tour_id)` |
| `spots_insert` | INSERT | `is_tour_member(tour_id)` |
| `spots_update` | UPDATE | `is_tour_member(tour_id)` |
| `spots_delete` | DELETE | `is_tour_owner(tour_id)` — owner only |

### spot_menus

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `spot_menus_select` | SELECT | Member of the spot's tour |
| `spot_menus_insert` | INSERT | `author_id = auth.uid()` AND member of the spot's tour |
| `spot_menus_update` | UPDATE | `author_id = auth.uid()` (author edits own menu) |
| `spot_menus_delete` | DELETE | `author_id = auth.uid()` OR tour owner |

### stamps

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `stamps_select` | SELECT | `is_tour_member(tour_id)` |
| `stamps_insert` | INSERT | `user_id = auth.uid()` AND `is_tour_member(tour_id)` |
| `stamps_update` | UPDATE | `user_id = auth.uid()` OR `is_tour_owner(tour_id)` |
| `stamps_delete` | DELETE | `user_id = auth.uid()` OR `is_tour_owner(tour_id)` |

### spot_settlements

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `spot_settlements_select` | SELECT | `is_tour_member(tour_id)` |
| `spot_settlements_insert` | INSERT | `created_by = auth.uid()` AND member of the spot's tour |
| `spot_settlements_update` | UPDATE | Member of the spot's tour (any member may update) |
| `spot_settlements_delete` | DELETE | `is_tour_member(tour_id)` |

---

## Access Control Matrix

| Table | anonymous | authenticated (non-member) | tour member | tour owner |
|-------|-----------|---------------------------|-------------|------------|
| `profiles` | NONE | Own row only | Shared-tour profiles | Same as member |
| `tours` | NONE | NONE | SELECT | SELECT + UPDATE + DELETE |
| `tour_members` | NONE | NONE | SELECT | SELECT + INSERT + UPDATE + DELETE |
| `tour_invites` | NONE | SELECT (own email) | SELECT + INSERT | + UPDATE + DELETE |
| `spots` | NONE | NONE | SELECT + INSERT + UPDATE | + DELETE |
| `spot_menus` | NONE | NONE | SELECT + INSERT (own) + UPDATE (own) + DELETE (own) | + DELETE (any) |
| `stamps` | NONE | NONE | SELECT + INSERT (own) + UPDATE (own) + DELETE (own) | + UPDATE/DELETE (any) |
| `spot_settlements` | NONE | NONE | SELECT + INSERT + UPDATE + DELETE | Same as member |
