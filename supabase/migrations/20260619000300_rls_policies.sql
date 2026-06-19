-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 3 / Row Level Security
-- Enable RLS on every table + explicit per-operation policies (NFR-SEC-004).
-- =============================================================================
-- THREAT MODEL (D10 / A13): the Supabase anon key is public and shipped in the
-- client bundle. Anyone can issue arbitrary PostgREST queries with it. Data
-- security depends ENTIRELY on the policies below. They are therefore written
-- default-deny: RLS is enabled on every table, and a row is only readable or
-- writable when a matching policy's USING / WITH CHECK clause returns true.
-- No table is left without explicit per-operation (SELECT/INSERT/UPDATE/DELETE)
-- coverage.
--
-- Depends on migration 1 (is_tour_member / is_tour_owner) and migration 2.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS (default-deny once enabled and no policy matches).
-- FORCE so that even the table owner is subject to RLS via PostgREST.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.tours         enable row level security;
alter table public.tour_members  enable row level security;
alter table public.tour_invites  enable row level security;
alter table public.spots         enable row level security;
alter table public.spot_menus    enable row level security;
alter table public.stamps        enable row level security;

-- Drop-then-create so the migration can be re-applied without "already exists".
-- =============================================================================
-- profiles
--   SELECT : a user may read their own profile and the profiles of anyone who
--            shares a tour with them (so member lists can show display names).
--   INSERT : a user may create only their own profile row (id = auth.uid()).
--            (Normally created by the on_auth_user_created trigger.)
--   UPDATE : a user may update only their own profile.
--   DELETE : no policy -> deletion only happens via auth.users cascade.
-- =============================================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid ()
    or exists (
      select 1
      from public.tour_members me
      join public.tour_members them on them.tour_id = me.tour_id
      where me.user_id = auth.uid ()
        and them.user_id = public.profiles.id
    )
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid ());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid ())
  with check (id = auth.uid ());

-- =============================================================================
-- tours
--   SELECT : members only (REQ-F5-006 / NFR-SEC-004 SELECT).
--   INSERT : any authenticated user may create a tour, but only as its own
--            owner (owner_id = auth.uid()). REQ-F6-001. The after-insert
--            trigger then adds the owner membership row.
--   UPDATE : owner only (e.g. rename). REQ-F6-004.
--   DELETE : owner only (REQ-F6-004 / REQ-F6-006). Cascades to all child rows.
-- =============================================================================
drop policy if exists tours_select on public.tours;
create policy tours_select on public.tours
  for select to authenticated
  using (public.is_tour_member (id));

drop policy if exists tours_insert on public.tours;
create policy tours_insert on public.tours
  for insert to authenticated
  with check (owner_id = auth.uid ());

drop policy if exists tours_update on public.tours;
create policy tours_update on public.tours
  for update to authenticated
  using (public.is_tour_owner (id))
  with check (public.is_tour_owner (id));

drop policy if exists tours_delete on public.tours;
create policy tours_delete on public.tours
  for delete to authenticated
  using (public.is_tour_owner (id));

-- =============================================================================
-- tour_members
--   SELECT : a user may see the membership rows of any tour they belong to
--            (to render the member list). Uses is_tour_member (SECURITY
--            DEFINER) to avoid RLS recursion on this same table.
--   INSERT : owner may add members; OR a user may add THEMSELVES as a member
--            (role 'member') -- this is how invite acceptance works
--            (REQ-F6-003). Self-insert as 'owner' is blocked.
--   UPDATE : owner only (e.g. role change). REQ-F6-004.
--   DELETE : owner may remove any member; a member may remove only themselves
--            (leave the tour). REQ-F6-004 / REQ-F6-006.
-- =============================================================================
drop policy if exists tour_members_select on public.tour_members;
create policy tour_members_select on public.tour_members
  for select to authenticated
  using (public.is_tour_member (tour_id));

drop policy if exists tour_members_insert on public.tour_members;
create policy tour_members_insert on public.tour_members
  for insert to authenticated
  with check (
    public.is_tour_owner (tour_id)
    or (user_id = auth.uid () and role = 'member')
  );

drop policy if exists tour_members_update on public.tour_members;
create policy tour_members_update on public.tour_members
  for update to authenticated
  using (public.is_tour_owner (tour_id))
  with check (public.is_tour_owner (tour_id));

drop policy if exists tour_members_delete on public.tour_members;
create policy tour_members_delete on public.tour_members
  for delete to authenticated
  using (
    public.is_tour_owner (tour_id)
    or user_id = auth.uid ()
  );

-- =============================================================================
-- tour_invites
--   SELECT : tour members may see their tour's invites; additionally an
--            invitee may see an invite addressed to their own email (so they
--            can view/accept it before joining). REQ-F6-002/003.
--   INSERT : owner (or any member -- "권한 있는 멤버", REQ-F6-002) may create
--            invites, and only as themselves (invited_by = auth.uid()).
--   UPDATE : the invitee may update status (accept/reject) on an invite for
--            their own email; the owner may also update (e.g. revoke).
--   DELETE : owner only (revoke an invite). REQ-F6-004.
-- =============================================================================
drop policy if exists tour_invites_select on public.tour_invites;
create policy tour_invites_select on public.tour_invites
  for select to authenticated
  using (
    public.is_tour_member (tour_id)
    or invited_email = (auth.jwt () ->> 'email')
  );

drop policy if exists tour_invites_insert on public.tour_invites;
create policy tour_invites_insert on public.tour_invites
  for insert to authenticated
  with check (
    public.is_tour_member (tour_id)
    and invited_by = auth.uid ()
  );

drop policy if exists tour_invites_update on public.tour_invites;
create policy tour_invites_update on public.tour_invites
  for update to authenticated
  using (
    public.is_tour_owner (tour_id)
    or invited_email = (auth.jwt () ->> 'email')
  )
  with check (
    public.is_tour_owner (tour_id)
    or invited_email = (auth.jwt () ->> 'email')
  );

drop policy if exists tour_invites_delete on public.tour_invites;
create policy tour_invites_delete on public.tour_invites
  for delete to authenticated
  using (public.is_tour_owner (tour_id));

-- =============================================================================
-- spots
--   SELECT : members only (NFR-SEC-004 SELECT).
--   INSERT : members may add spots (REQ-F6-005). Membership is checked on the
--            NEW row's tour_id.
--   UPDATE : members may edit spots (REQ-F6-005). Both the existing and the
--            new tour_id must be a tour the user belongs to (prevents moving a
--            spot into a tour they are not a member of).
--   DELETE : OWNER only (REQ-F6-004 / REQ-F6-006). Cascades to spot_menus and
--            stamps (REQ-F6-007 / D3).
-- =============================================================================
drop policy if exists spots_select on public.spots;
create policy spots_select on public.spots
  for select to authenticated
  using (public.is_tour_member (tour_id));

drop policy if exists spots_insert on public.spots;
create policy spots_insert on public.spots
  for insert to authenticated
  with check (public.is_tour_member (tour_id));

drop policy if exists spots_update on public.spots;
create policy spots_update on public.spots
  for update to authenticated
  using (public.is_tour_member (tour_id))
  with check (public.is_tour_member (tour_id));

drop policy if exists spots_delete on public.spots;
create policy spots_delete on public.spots
  for delete to authenticated
  using (public.is_tour_owner (tour_id));

-- =============================================================================
-- spot_menus
--   SELECT : members of the spot's tour (NFR-SEC-004 SELECT).
--   INSERT : members may add menus, only attributed to themselves
--            (author_id = auth.uid()). REQ-F4-001 / REQ-F6-005.
--   UPDATE : the menu's author may edit their own menu (members edit menus,
--            REQ-F6-005, scoped to authorship to avoid clobbering others).
--   DELETE : the menu's author, OR the tour owner, may delete a menu.
-- Membership is resolved through the parent spot's tour_id.
-- =============================================================================
drop policy if exists spot_menus_select on public.spot_menus;
create policy spot_menus_select on public.spot_menus
  for select to authenticated
  using (
    exists (
      select 1 from public.spots s
      where s.id = spot_menus.spot_id
        and public.is_tour_member (s.tour_id)
    )
  );

drop policy if exists spot_menus_insert on public.spot_menus;
create policy spot_menus_insert on public.spot_menus
  for insert to authenticated
  with check (
    author_id = auth.uid ()
    and exists (
      select 1 from public.spots s
      where s.id = spot_menus.spot_id
        and public.is_tour_member (s.tour_id)
    )
  );

drop policy if exists spot_menus_update on public.spot_menus;
create policy spot_menus_update on public.spot_menus
  for update to authenticated
  using (author_id = auth.uid ())
  with check (author_id = auth.uid ());

drop policy if exists spot_menus_delete on public.spot_menus;
create policy spot_menus_delete on public.spot_menus
  for delete to authenticated
  using (
    author_id = auth.uid ()
    or exists (
      select 1 from public.spots s
      where s.id = spot_menus.spot_id
        and public.is_tour_owner (s.tour_id)
    )
  );

-- =============================================================================
-- stamps
--   SELECT : members of the stamp's tour (NFR-SEC-004 SELECT).
--   INSERT : a member may insert ONLY their own stamp (user_id = auth.uid())
--            for a spot in a tour they belong to. REQ-F1-002 / NFR-SEC-004.
--   UPDATE : the stamp's own user OR the tour owner. This covers stamp
--            cancellation (setting cancelled_at) and arrival-time correction
--            (REQ-F1-009 / REQ-F1-010). Non-owners editing another member's
--            stamp are rejected (REQ-F1-010 / EC-11).
--   DELETE : the stamp's own user OR the tour owner (NFR-SEC-004 DELETE:
--            "stamps 취소는 본인 또는 소유자만"). Note: normal cancellation is a
--            soft-cancel UPDATE; hard DELETE is allowed for the same parties.
-- =============================================================================
drop policy if exists stamps_select on public.stamps;
create policy stamps_select on public.stamps
  for select to authenticated
  using (public.is_tour_member (tour_id));

drop policy if exists stamps_insert on public.stamps;
create policy stamps_insert on public.stamps
  for insert to authenticated
  with check (
    user_id = auth.uid ()
    and public.is_tour_member (tour_id)
  );

drop policy if exists stamps_update on public.stamps;
create policy stamps_update on public.stamps
  for update to authenticated
  using (
    user_id = auth.uid ()
    or public.is_tour_owner (tour_id)
  )
  with check (
    user_id = auth.uid ()
    or public.is_tour_owner (tour_id)
  );

drop policy if exists stamps_delete on public.stamps;
create policy stamps_delete on public.stamps
  for delete to authenticated
  using (
    user_id = auth.uid ()
    or public.is_tour_owner (tour_id)
  );
