-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 5 / Manual check-in requests (REQ-F1-007)
-- Table: manual_checkin_requests
-- Plus the confirm_manual_checkin() RPC that atomically turns a peer-confirmed
-- request into a real stamp (AC-F1-04).
-- =============================================================================
-- WHY a separate table (not a pending state on stamps):
--   A row in `stamps` means a VALID arrival. AC-F1-04 says the stamp is only
--   applied AFTER a DIFFERENT member confirms a request. A pending row therefore
--   is NOT a stamp and must not appear in the stamp board, the partial-unique
--   re-stamp index, or stampMapBySpot. Keeping requests in their own table leaves
--   every stamp invariant from migration 2 untouched and gives a clean place to
--   enforce "requester != confirmer" (REQ-F1-007 / NFR-SEC-004).
--
-- THREAT MODEL (D10 / A13): the anon key is public; security is RLS-only. This
-- migration is written default-deny with explicit per-operation policies and a
-- SECURITY DEFINER confirm function that re-checks authorization itself.
--
-- Depends on migration 1 (tours / is_tour_member / is_tour_owner / set_updated_at)
-- and migration 2 (spots / stamps + the partial unique index + sync trigger).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Status enum for a manual check-in request lifecycle.
--   pending   : awaiting another member's confirmation.
--   confirmed : a different member confirmed -> a stamp was created.
--   cancelled : the requester (or owner) withdrew the request.
-- ---------------------------------------------------------------------------
do $$ begin
  create type manual_checkin_status as enum ('pending', 'confirmed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- manual_checkin_requests : a member's request to be stamped at a spot when GPS
-- auto-stamp is unavailable (REQ-F1-007). tour_id is denormalized (like stamps)
-- so RLS membership checks and the realtime filter run without a join; it is
-- kept consistent with the spot by sync_manual_checkin_tour_id() below.
--   - requester_id : the member who needs the stamp.
--   - confirmed_by : the DIFFERENT member who confirmed (null until confirmed).
--   - stamp_id     : the stamp produced on confirmation (null until confirmed).
-- We store NO raw coordinates (NFR-GEO-006 / A12); only the spot + member ids.
-- ---------------------------------------------------------------------------
create table if not exists public.manual_checkin_requests (
  id           uuid primary key default gen_random_uuid (),
  spot_id      uuid not null references public.spots (id) on delete cascade,
  tour_id      uuid not null references public.tours (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  status       manual_checkin_status not null default 'pending',
  confirmed_by uuid references auth.users (id) on delete set null,
  stamp_id     uuid references public.stamps (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A request can never be self-confirmed at the data level (REQ-F1-007). This
  -- is a hard backstop in addition to the RLS / RPC checks.
  constraint manual_checkin_no_self_confirm
    check (confirmed_by is null or confirmed_by <> requester_id)
);

create index if not exists manual_checkin_tour_id_idx
  on public.manual_checkin_requests (tour_id);
create index if not exists manual_checkin_spot_id_idx
  on public.manual_checkin_requests (spot_id);
create index if not exists manual_checkin_requester_idx
  on public.manual_checkin_requests (requester_id);

-- @MX:ANCHOR: [AUTO] Partial unique index enforces "at most one PENDING request
-- per (spot, requester)" so a member cannot spam duplicate pending requests.
-- @MX:REASON: REQ-F1-007 — a member needs exactly one outstanding request per
-- spot; confirmed/cancelled rows (history) must NOT block a fresh request, so the
-- predicate is limited to status = 'pending' (mirrors the stamps re-stamp index).
create unique index if not exists manual_checkin_pending_unique
  on public.manual_checkin_requests (spot_id, requester_id)
  where status = 'pending';

drop trigger if exists manual_checkin_set_updated_at on public.manual_checkin_requests;
create trigger manual_checkin_set_updated_at
  before update on public.manual_checkin_requests
  for each row execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Keep the denormalized tour_id consistent with the spot's real tour_id, so a
-- client cannot point a request at a tour they are not a member of (mirrors
-- sync_stamp_tour_id in migration 2).
-- ---------------------------------------------------------------------------
create or replace function public.sync_manual_checkin_tour_id ()
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

drop trigger if exists manual_checkin_sync_tour_id on public.manual_checkin_requests;
create trigger manual_checkin_sync_tour_id
  before insert or update of spot_id on public.manual_checkin_requests
  for each row execute function public.sync_manual_checkin_tour_id ();

-- =============================================================================
-- RLS : default-deny, explicit per-operation (NFR-SEC-004).
-- =============================================================================
alter table public.manual_checkin_requests enable row level security;

-- SELECT : any member of the request's tour may see its requests, so another
--          member can find a pending request and confirm it (REQ-F1-007).
drop policy if exists manual_checkin_select on public.manual_checkin_requests;
create policy manual_checkin_select on public.manual_checkin_requests
  for select to authenticated
  using (public.is_tour_member (tour_id));

-- INSERT : a member may create ONLY their own request (requester_id = auth.uid())
--          for a spot in a tour they belong to. They cannot request on behalf of
--          someone else (REQ-F1-007 / NFR-SEC-004 INSERT).
drop policy if exists manual_checkin_insert on public.manual_checkin_requests;
create policy manual_checkin_insert on public.manual_checkin_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid ()
    and status = 'pending'
    and public.is_tour_member (tour_id)
  );

-- UPDATE : the requester (to withdraw their own pending request) OR the tour
--          owner (moderation). NOTE: confirmation does NOT go through this policy
--          -- it goes through the SECURITY DEFINER RPC below, which enforces the
--          confirmer != requester rule. A direct UPDATE here can never set
--          confirmed_by to oneself because the CHECK constraint forbids self-
--          confirm and this policy only permits the requester/owner. So peer
--          confirmation must use the RPC. We still scope writes tightly.
drop policy if exists manual_checkin_update on public.manual_checkin_requests;
create policy manual_checkin_update on public.manual_checkin_requests
  for update to authenticated
  using (
    requester_id = auth.uid ()
    or public.is_tour_owner (tour_id)
  )
  with check (
    requester_id = auth.uid ()
    or public.is_tour_owner (tour_id)
  );

-- DELETE : the requester or the tour owner may delete a request row.
drop policy if exists manual_checkin_delete on public.manual_checkin_requests;
create policy manual_checkin_delete on public.manual_checkin_requests
  for delete to authenticated
  using (
    requester_id = auth.uid ()
    or public.is_tour_owner (tour_id)
  );

-- =============================================================================
-- @MX:ANCHOR: [AUTO] confirm_manual_checkin() is the ONLY path that turns a
-- pending request into a real stamp; it is the server-side guard for
-- "confirmed by a DIFFERENT member" (REQ-F1-007 / AC-F1-04).
-- @MX:REASON: AC-F1-04 requires the stamp to exist only after a peer confirms.
-- Doing the confirmer-check + stamp insert + request update as one SECURITY
-- DEFINER transaction is the invariant that prevents self-confirmation and
-- partial state; clients must never insert the stamp directly for a manual
-- check-in.
--
-- @MX:WARN: [AUTO] SECURITY DEFINER bypasses RLS, so every authorization rule is
-- enforced INSIDE this function.
-- @MX:REASON: the function runs as owner and could otherwise stamp any spot for
-- anyone; it must itself verify membership AND that the caller is not the
-- requester before inserting the stamp.
--
-- Contract:
--   p_request_id : the pending request to confirm.
--   Returns the created stamp id.
-- Behaviour:
--   - caller (auth.uid()) MUST be a member of the request's tour.
--   - caller MUST NOT be the requester (peer confirmation, REQ-F1-007).
--   - request MUST still be 'pending' (idempotency / no double-confirm).
--   - inserts a stamp (method 'manual', server arrived_at) for the REQUESTER;
--     the partial unique index from migration 2 still applies, so if the
--     requester already has a valid stamp this raises a unique violation
--     (REQ-F1-004). Re-stamp after cancel still works (cancelled_at IS NULL).
--   - marks the request confirmed and links the new stamp.
-- =============================================================================
create or replace function public.confirm_manual_checkin (
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.manual_checkin_requests%rowtype;
  v_stamp_id uuid;
begin
  -- Lock the request row so two concurrent confirmers cannot both proceed.
  select * into v_req
  from public.manual_checkin_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'manual check-in request % not found', p_request_id
      using errcode = 'P0002';
  end if;

  if not public.is_tour_member (v_req.tour_id) then
    raise exception 'not authorized to confirm check-ins for this tour'
      using errcode = '42501';
  end if;

  -- Peer confirmation only: the confirmer must differ from the requester
  -- (REQ-F1-007 / AC-F1-04). This is the real server guard.
  if auth.uid () = v_req.requester_id then
    raise exception 'a manual check-in must be confirmed by another member'
      using errcode = '42501';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'manual check-in request % is not pending', p_request_id
      using errcode = '22023';
  end if;

  -- Create the actual stamp for the REQUESTER. arrived_at is the server default
  -- (A6 / REQ-F1-003); the stamps.sync_stamp_tour_id + partial unique index
  -- still apply (REQ-F1-004 / REQ-F1-011).
  insert into public.stamps (spot_id, user_id, method)
  values (v_req.spot_id, v_req.requester_id, 'manual')
  returning id into v_stamp_id;

  update public.manual_checkin_requests
  set status       = 'confirmed',
      confirmed_by = auth.uid (),
      stamp_id     = v_stamp_id
  where id = p_request_id;

  return v_stamp_id;
end;
$$;

-- =============================================================================
-- Realtime : publish manual_checkin_requests so a pending request from one
-- member surfaces live to other members who can confirm it (REQ-F1-007 +
-- REQ-F5-002 live reflection). REPLICA IDENTITY FULL so UPDATE/DELETE payloads
-- carry the full row (needed to notify the requester on confirmation).
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'manual_checkin_requests'
  ) then
    alter publication supabase_realtime
      add table public.manual_checkin_requests;
  end if;
end $$;

alter table public.manual_checkin_requests replica identity full;
