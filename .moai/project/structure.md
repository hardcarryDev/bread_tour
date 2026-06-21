# Project Structure

**Last updated:** 2026-06-21

---

## Top-level Layout

```
bread_tour/
├── src/                    # React application source
├── supabase/               # Supabase backend
│   ├── functions/          # Edge Functions (e.g. directions proxy)
│   └── migrations/         # Sequential SQL migration files
├── scripts/                # Build-time utilities (spa-404.mjs)
├── public/                 # Static assets served at root
├── .moai/                  # MoAI project metadata
└── package.json
```

---

## src/ Layout

### src/features/ — Feature Modules

Each feature folder follows the convention: `api.ts` (Supabase calls), `use*.ts` (React hooks), component `.tsx` files, and co-located `*.test.*` files.

| Folder | Responsibility |
|--------|---------------|
| `auth/` | Supabase Auth sign-up/login, AuthProvider, ProtectedRoute |
| `collab/` | Supabase Realtime subscriptions, presence, toast notifications, MemberRoster |
| `directions/` | Route computation (car/walk/transit), DirectionsPanel UI |
| `map/` | Kakao Maps integration, SpotForm, SpotList, SpotReorder, LocationPicker, MapView, spot kind management |
| `menu/` | Recommended menu CRUD API (`api.ts`: addSpotMenu, deleteSpotMenu, updateSpotMenuText) |
| `profile/` | Profile read/update, AppNav |
| `settlement/` | Per-spot bill split: compute.ts (net calculation), format.ts (KRW display), api.ts, useSettlements.ts, SettlementModal.tsx, SettlementSummary.tsx |
| `stamp/` | GPS stamp logic (geo.ts, useGeoStamp, api.ts), StampProgress, StampTracker, ManualCheckIn, usePendingCheckIns |
| `tour/` | Tour CRUD API |

### src/components/ — Shared UI Components

| File | Description |
|------|-------------|
| `ImageViewer.tsx` | Full-screen lightbox for menu photos (swipe, keyboard, zoom-to-fit) |
| `SectionTitle.tsx` | Section heading with leading icon (멤버/장소/스탬프) |

### src/pages/ — Route-level Pages

| File | Route |
|------|-------|
| `Login.tsx` | `/login` |
| `TourList.tsx` | `/` |
| `TourCreate.tsx` | `/tours/new` |
| `TourDetail.tsx` | `/tours/:id` — main map + all panels |
| `InviteAccept.tsx` | `/invite/:token` |
| `ProfileEdit.tsx` | `/profile` |

### src/hooks/

`useTours.ts` — fetch and subscribe to the user's tour list.

### src/lib/

| File | Purpose |
|------|---------|
| `supabase.ts` | Supabase client singleton |
| `kakao.ts` | Kakao Maps SDK loader |
| `errors.ts` | Shared error parsing utilities |

---

## supabase/migrations/ — Applied Migrations (in order)

Files are prefixed with a sortable timestamp. All have been applied to remote.

| File | Summary |
|------|---------|
| `20260619000100_core_schema.sql` | profiles, tours, tour_members, tour_invites; membership helpers |
| `20260619000200_spots_menus_stamps.sql` | spots, spot_menus, stamps; reorder_spots RPC |
| `20260619000300_rls_policies.sql` | RLS on all tables |
| `20260619000400_realtime.sql` | Realtime publication setup |
| `20260619000500_manual_checkin_requests.sql` | manual_checkin_requests table + confirm_manual_checkin RPC |
| `20260620000100_accept_invite_rpc.sql` | accept_invite RPC |
| `20260620000200_spot_menus_author_check.sql` | Author check constraint on spot_menus |
| `20260620000300_fix_tours_select_owner.sql` | Fix tours SELECT RLS for owner bootstrap |
| `20260620000400_accept_invite_idempotent.sql` | Idempotent invite acceptance |
| `20260620000500_spot_kind_freetext.sql` | spots.kind changed to free-text |
| `20260620000600_menu_images.sql` | spot_menus.images JSONB column |
| `20260620000601_spot_kinds.sql` | spot_kinds table (per-tour kind list) |
| `20260620000700_menu_text_optional.sql` | Allow photo-only menus (menu_text optional) |
| `20260620000701_spot_menus_profiles_fk.sql` | FK from spot_menus.author_id to profiles |
| `20260621000100_spot_settlements.sql` | spot_settlements table + RLS + tour_id sync trigger |
| `20260621000200_settlement_settled_ids.sql` | settled_ids uuid[] column on spot_settlements |

---

## Test Files

Tests live alongside their subject files (`*.test.ts` / `*.test.tsx`). The test setup file is `src/test/setup.ts`.
