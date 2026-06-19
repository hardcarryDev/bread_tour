-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 2 / Spots, menus, stamps
-- Tables: spots, spot_menus, stamps
-- Plus the atomic reorder_spots() function (REQ-F5-007 / D11).
-- =============================================================================
-- Depends on migration 1 (tours table + set_updated_at()).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- spots : a bakery/restaurant in the tour with coordinates + arrival radius.
--   - lat/lng : coordinates captured at registration (SPEC A8, REQ-F1-001).
--   - radius_m : arrival-detection radius, default 50m (SPEC A3, REQ-F1-001).
--   - order_index : planned visit order; kept gap-free by reorder_spots().
-- We do NOT store any raw coordinate stream here -- only the fixed spot
-- location. Member position history is never persisted (NFR-GEO-006 / A12).
-- ---------------------------------------------------------------------------
create table if not exists public.spots (
  id          uuid primary key default gen_random_uuid (),
  tour_id     uuid not null references public.tours (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  kind        spot_kind not null default 'bakery',
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    integer not null default 50 check (radius_m between 1 and 5000),
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists spots_tour_id_idx on public.spots (tour_id);
-- Ordering reads ("show spots in visit order") hit (tour_id, order_index).
create index if not exists spots_tour_order_idx on public.spots (tour_id, order_index);

-- ---------------------------------------------------------------------------
-- spot_menus : member-entered signature/recommended menu items (F4).
--   - author_id : the member who entered this menu (REQ-F4-003 attribution).
--   - ON DELETE CASCADE from spots: deleting a spot removes its menus
--     (REQ-F6-007 / D3 / EC-09).
-- ---------------------------------------------------------------------------
create table if not exists public.spot_menus (
  id         uuid primary key default gen_random_uuid (),
  spot_id    uuid not null references public.spots (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  menu_text  text not null check (char_length(menu_text) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spot_menus_spot_id_idx on public.spot_menus (spot_id);

-- ---------------------------------------------------------------------------
-- stamps : a digital stamp earned by physically arriving at a spot (F1).
--   - tour_id is denormalized alongside spot_id so RLS membership checks and
--     realtime filters can run without an extra join. It is kept consistent
--     by an application-side / trigger guarantee (see sync trigger below).
--   - arrived_at : SERVER timestamp, the source of truth for arrival time
--     (SPEC A6, REQ-F1-003). Never set by the client.
--   - cancelled_at : soft-cancel marker. Cancellation sets this rather than
--     deleting the row, preserving history (REQ-F1-009 / D14).
--   - method : 'auto' (GPS) or 'manual' (peer-verified check-in, REQ-F1-007).
-- We store only arrived_at + spot/user identifiers -- no raw coordinates
-- (NFR-GEO-006 / A12).
-- ---------------------------------------------------------------------------
create table if not exists public.stamps (
  id           uuid primary key default gen_random_uuid (),
  spot_id      uuid not null references public.spots (id) on delete cascade,
  tour_id      uuid not null references public.tours (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  method       stamp_method not null default 'auto',
  arrived_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists stamps_tour_id_idx on public.stamps (tour_id);
create index if not exists stamps_spot_id_idx on public.stamps (spot_id);
create index if not exists stamps_user_id_idx on public.stamps (user_id);

-- @MX:ANCHOR: [AUTO] Partial unique index enforces "one ACTIVE stamp per
-- (spot, user)" while allowing re-stamping after a cancel.
-- @MX:REASON: REQ-F1-004 forbids duplicate active stamps, but REQ-F1-011 / D14
-- require that a cancelled stamp (cancelled_at IS NOT NULL) does NOT block a
-- fresh stamp. A full UNIQUE(spot_id,user_id) would break re-stamping; the
-- WHERE cancelled_at IS NULL predicate is the invariant that satisfies both.
create unique index if not exists stamps_active_unique
  on public.stamps (spot_id, user_id)
  where cancelled_at is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists spots_set_updated_at on public.spots;
create trigger spots_set_updated_at
  before update on public.spots
  for each row execute function public.set_updated_at ();

drop trigger if exists spot_menus_set_updated_at on public.spot_menus;
create trigger spot_menus_set_updated_at
  before update on public.spot_menus
  for each row execute function public.set_updated_at ();

drop trigger if exists stamps_set_updated_at on public.stamps;
create trigger stamps_set_updated_at
  before update on public.stamps
  for each row execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- stamps.tour_id integrity : ensure the denormalized tour_id always matches
-- the spot's tour_id. Prevents a client from inserting a stamp with a tour_id
-- that differs from the spot's real tour (which would let RLS membership
-- checks be spoofed against the wrong tour).
-- ---------------------------------------------------------------------------
create or replace function public.sync_stamp_tour_id ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.tour_id into new.tour_id
  from public.spots s
  where s.id = new.spot_id;
  if new.tour_id is null then
    raise exception 'spot % does not exist', new.spot_id;
  end if;
  return new;
end;
$$;

drop trigger if exists stamps_sync_tour_id on public.stamps;
create trigger stamps_sync_tour_id
  before insert or update of spot_id on public.stamps
  for each row execute function public.sync_stamp_tour_id ();

-- ---------------------------------------------------------------------------
-- @MX:ANCHOR: [AUTO] reorder_spots() renumbers a tour's spots atomically.
-- @MX:REASON: REQ-F5-007 / D11 / EC-12 require concurrent visit-order edits to
-- resolve to a single gap-free, duplicate-free sequence. Doing this as one
-- server-side transaction (rather than N client UPDATEs) is the invariant that
-- guarantees continuity under concurrent reorders.
--
-- @MX:WARN: [AUTO] Authorization is enforced INSIDE the function, not by RLS.
-- @MX:REASON: This is SECURITY DEFINER and bypasses RLS, so it must itself
-- check is_tour_member(); otherwise any caller could renumber any tour.
--
-- Contract:
--   p_tour_id     : the tour whose spots are being reordered.
--   p_ordered_ids : spot ids in the desired visit order. MUST be exactly the
--                   full set of the tour's spot ids (no missing, no extra).
-- Renumbers order_index to 1..N following the array order, in one statement.
-- ---------------------------------------------------------------------------
create or replace function public.reorder_spots (
  p_tour_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_actual integer;
  v_count_given  integer;
begin
  -- Caller must be a member of this tour (any member may reorder per
  -- REQ-F6-005; owner-only is not required for ordering).
  if not public.is_tour_member (p_tour_id) then
    raise exception 'not authorized to reorder spots for tour %', p_tour_id
      using errcode = '42501';
  end if;

  -- The provided id list must match the tour's spot set exactly, otherwise we
  -- would leave gaps / orphans. Reject mismatches rather than silently fixing.
  select count(*) into v_count_actual
  from public.spots
  where tour_id = p_tour_id;

  v_count_given := coalesce(array_length(p_ordered_ids, 1), 0);

  if v_count_given <> v_count_actual then
    raise exception
      'ordered id count (%) does not match tour spot count (%)',
      v_count_given, v_count_actual
      using errcode = '22023';
  end if;

  -- Single UPDATE: each spot gets its 1-based position in the array.
  -- with ordinality yields the array position used as the new order_index.
  update public.spots s
  set order_index = ord.position,
      updated_at  = now()
  from (
    select id, position
    from unnest(p_ordered_ids) with ordinality as t (id, position)
  ) ord
  where s.id = ord.id
    and s.tour_id = p_tour_id;

  -- Guard: every targeted id must have belonged to this tour. If any id was
  -- foreign, fewer rows updated than expected -> abort the transaction.
  get diagnostics v_count_given = row_count;
  if v_count_given <> v_count_actual then
    raise exception
      'one or more ids do not belong to tour %', p_tour_id
      using errcode = '22023';
  end if;
end;
$$;
