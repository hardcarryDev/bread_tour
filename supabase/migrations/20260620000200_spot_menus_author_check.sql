-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 7 / spot_menus author_id enforcement (M-02)
-- Harden the spot_menus INSERT path so the client can NEVER attribute a menu to
-- another member.
-- =============================================================================
-- WHY (defect M-02):
--   The anon key is public (D10 / A13); a client can POST any spot_menus row it
--   wants, including an arbitrary author_id. author_id drives the REQ-F4-003
--   authorship attribution AND the spot_menus UPDATE/DELETE policies (author may
--   edit/delete their own menu). If a client could forge author_id it could
--   impersonate another member or grant itself edit rights over a menu.
--
--   The INSERT policy from migration 3 already carries
--   `with check (author_id = auth.uid() and ...)`. This migration makes that
--   enforcement explicit, version-tracked, and re-asserts it idempotently
--   (drop-then-create) so the invariant cannot silently regress, and adds a
--   defence-in-depth note. RLS WITH CHECK is the enforcement mechanism here; a
--   table CHECK cannot reference auth.uid(), so the policy clause is the correct
--   server-side guard.
--
-- THREAT MODEL: security is RLS-only. This migration touches only the
-- spot_menus INSERT policy and is safe to re-apply.
--
-- Depends on migration 2 (spots / spot_menus) and migration 3 (is_tour_member
-- and the original spot_menus policies).
-- =============================================================================

-- @MX:ANCHOR: [AUTO] spot_menus_insert is the single guard that binds a new menu
-- to its real author; author_id MUST equal auth.uid() AND the author must be a
-- member of the menu's tour.
-- @MX:REASON: M-02 / REQ-F4-003 / NFR-SEC-004 — author_id is client-supplied and
-- drives authorship + the menu UPDATE/DELETE policies; without this WITH CHECK a
-- client could forge another member's author_id and impersonate them.
drop policy if exists spot_menus_insert on public.spot_menus;
create policy spot_menus_insert on public.spot_menus
  for insert to authenticated
  with check (
    -- The menu must be attributed to the caller themselves (no forging another
    -- member's author_id, M-02).
    author_id = auth.uid ()
    -- ...and the caller must belong to the spot's tour (REQ-F6-005).
    and exists (
      select 1 from public.spots s
      where s.id = spot_menus.spot_id
        and public.is_tour_member (s.tour_id)
    )
  );
