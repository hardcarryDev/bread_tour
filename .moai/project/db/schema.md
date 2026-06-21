---
engine: PostgreSQL (Supabase)
orm: "@supabase/supabase-js (PostgREST)"
last_synced_at: 2026-06-21
---

# Database Schema

Source of truth: `supabase/migrations/` SQL files.

---

## Tables

| Table | Description |
|-------|-------------|
| `profiles` | 1:1 mirror of `auth.users`; holds `display_name` for client-readable member names |
| `tours` | A stamp-rally tour; owned by one user |
| `tour_members` | Tour membership rows; authority for "who may see/edit a tour" |
| `tour_invites` | Link-based invitations; token is the URL-safe secret |
| `spots` | A bakery/restaurant location in a tour with coordinates and arrival radius |
| `spot_menus` | Member-entered recommended menu items (text + JSONB images array) per spot |
| `spot_kinds` | Per-tour custom spot category labels (extends default bakery/restaurant) |
| `stamps` | Digital stamps earned by physically visiting a spot |
| `manual_checkin_requests` | Pending peer-confirmation requests before a stamp is issued |
| `spot_settlements` | Per-spot bill split (amount, payer, participants, settled tracking) |

---

## Column Details

### profiles
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | References `auth.users(id)` ON DELETE CASCADE |
| `display_name` | text | Nullable; set at sign-up or via profile page |
| `created_at` | timestamptz | Server default `now()` |
| `updated_at` | timestamptz | Auto-maintained by `set_updated_at` trigger |

### tours
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `owner_id` | uuid FK | References `auth.users(id)` |
| `name` | text | 1–200 chars |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### tour_members
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tour_id` | uuid FK | References `tours(id)` CASCADE |
| `user_id` | uuid FK | References `auth.users(id)` CASCADE |
| `role` | enum `tour_member_role` | `'owner'` or `'member'` |
| `joined_at` | timestamptz | |
| UNIQUE | | `(tour_id, user_id)` |

### tour_invites
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tour_id` | uuid FK | |
| `invited_email` | text | Optional |
| `token` | text UNIQUE | 18-byte random hex |
| `status` | enum `tour_invite_status` | `pending` / `accepted` / `rejected` |
| `invited_by` | uuid FK | |
| `created_at` / `updated_at` | timestamptz | |

### spots
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tour_id` | uuid FK | References `tours(id)` CASCADE |
| `name` | text | 1–200 chars |
| `kind` | text | Free-text since migration 9 (was enum) |
| `lat` | double precision | −90..90 |
| `lng` | double precision | −180..180 |
| `radius_m` | integer | 1..5000; default 50 |
| `order_index` | integer | Visit order; maintained by `reorder_spots()` RPC |
| `created_at` / `updated_at` | timestamptz | |

### spot_menus
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `spot_id` | uuid FK | References `spots(id)` CASCADE |
| `author_id` | uuid FK | References `auth.users(id)` AND `profiles(id)` |
| `menu_text` | text | Optional (photo-only menus allowed) |
| `images` | jsonb | Array of `{ path, url }` objects; default `[]` |
| `created_at` / `updated_at` | timestamptz | |

### spot_kinds
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tour_id` | uuid FK | References `tours(id)` CASCADE |
| `label` | text | Display label for the kind |
| `created_at` | timestamptz | |

### stamps
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `spot_id` | uuid FK | References `spots(id)` CASCADE |
| `tour_id` | uuid FK | Denormalized; synced by `sync_stamp_tour_id` trigger |
| `user_id` | uuid FK | |
| `method` | enum `stamp_method` | `'auto'` (GPS) or `'manual'` (peer-confirmed) |
| `arrived_at` | timestamptz | Server `now()` |
| `cancelled_at` | timestamptz | Nullable; soft-cancel marker |
| `created_at` / `updated_at` | timestamptz | |
| PARTIAL UNIQUE | | `(spot_id, user_id) WHERE cancelled_at IS NULL` |

### manual_checkin_requests
Pending peer-confirmation requests. A `confirm_manual_checkin()` RPC converts an accepted request into a `stamps` row atomically.

### spot_settlements
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `spot_id` | uuid FK UNIQUE | References `spots(id)` CASCADE; one settlement per spot |
| `tour_id` | uuid FK | Denormalized; synced by `sync_settlement_tour_id` trigger |
| `amount` | integer | KRW whole won; ≥ 0 |
| `payer_ids` | uuid[] | Members who paid (split equally) |
| `participant_ids` | uuid[] | Members who share the cost (split equally) |
| `settled_ids` | uuid[] | Participants who have sent their share back |
| `created_by` | uuid FK | |
| `created_at` / `updated_at` | timestamptz | |

---

## Relationships

| From | To | Cardinality | FK Column | Notes |
|------|----|-------------|-----------|-------|
| `tours` | `tour_members` | 1:N | `tour_members.tour_id` | Cascade delete |
| `tours` | `tour_invites` | 1:N | `tour_invites.tour_id` | Cascade delete |
| `tours` | `spots` | 1:N | `spots.tour_id` | Cascade delete |
| `spots` | `spot_menus` | 1:N | `spot_menus.spot_id` | Cascade delete |
| `spots` | `stamps` | 1:N | `stamps.spot_id` | Cascade delete |
| `spots` | `spot_settlements` | 1:1 | `spot_settlements.spot_id` UNIQUE | One settlement per spot |
| `tours` | `spot_kinds` | 1:N | `spot_kinds.tour_id` | |
| `auth.users` | `profiles` | 1:1 | `profiles.id` | Mirror table |

---

## Key Indexes

| Table | Columns | Type |
|-------|---------|------|
| `tours` | `owner_id` | BTREE |
| `tour_members` | `tour_id`, `user_id` | BTREE |
| `spots` | `(tour_id, order_index)` | BTREE — ordered list queries |
| `stamps` | `tour_id`, `spot_id`, `user_id` | BTREE |
| `stamps` | `(spot_id, user_id) WHERE cancelled_at IS NULL` | PARTIAL UNIQUE |
| `spot_settlements` | `tour_id`, `spot_id` | BTREE |

---

## Enums

| Name | Values |
|------|--------|
| `tour_member_role` | `owner`, `member` |
| `tour_invite_status` | `pending`, `accepted`, `rejected` |
| `stamp_method` | `auto`, `manual` |

Note: `spot_kind` enum was dropped in migration 9; `spots.kind` is now free-text.

---

## Key Server-side Functions and Triggers

| Name | Type | Purpose |
|------|------|---------|
| `is_tour_member(uuid)` | SECURITY DEFINER fn | Used by RLS policies to check membership |
| `is_tour_owner(uuid)` | SECURITY DEFINER fn | Used by RLS policies to check ownership |
| `set_updated_at()` | Trigger fn | Keeps `updated_at = now()` on every UPDATE |
| `add_owner_membership()` | Trigger fn | Auto-inserts creator as owner member on tour INSERT |
| `handle_new_user()` | Trigger fn | Auto-creates `profiles` row on `auth.users` INSERT |
| `reorder_spots(uuid, uuid[])` | SECURITY DEFINER RPC | Atomically renumbers spots in a tour |
| `sync_stamp_tour_id()` | Trigger fn | Keeps `stamps.tour_id` consistent with spot's tour |
| `sync_settlement_tour_id()` | Trigger fn | Keeps `spot_settlements.tour_id` consistent with spot's tour |
| `confirm_manual_checkin(uuid)` | RPC | Atomically converts a manual_checkin_request into a stamp |
