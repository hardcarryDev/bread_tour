-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 7 / Fix tours SELECT owner-bootstrap (RLS)
-- Defect: tour creation via supabase-js .insert(...).select() (PostgREST
-- Prefer: return=representation) fails with 42501
-- "new row violates row-level security policy for table \"tours\"".
-- =============================================================================
-- ROOT CAUSE:
--   tours_select used `using (public.is_tour_member(id))`. is_tour_member() is
--   SECURITY DEFINER + STABLE and reads tour_members. On INSERT ... RETURNING
--   (PostgREST issues a single statement when return=representation), the
--   freshly-created owner membership row from the AFTER-INSERT trigger
--   add_owner_membership is NOT yet visible to the RETURNING clause's SELECT
--   policy evaluation. is_tour_member(id) therefore returns false and the
--   RETURNING row is rejected -> 42501. This is the classic owner-bootstrap
--   chicken-and-egg under a membership-derived SELECT policy.
--
--   The return=minimal path (no RETURNING SELECT) succeeds, which is why
--   plain inserts and the after-insert trigger work, but the app's createTour
--   (which uses .select()) is broken in production.
--
-- FIX (minimal, security-preserving):
--   Allow the owner to read their own tour DIRECTLY via owner_id = auth.uid(),
--   without depending on tour_members-row visibility. The owner is, by
--   definition (REQ-F6-001), always entitled to see their tour. We OR this with
--   the existing membership check so non-owner members keep their access and
--   non-members are still denied. This resolves the insert-returning bootstrap
--   and does NOT broaden visibility to anyone outside the tour.
--
-- No FORCE ROW LEVEL SECURITY change: none was set previously, and this fix
-- does not require one. Default-deny posture is preserved.
--
-- Depends on migration 1 (is_tour_member) and migration 3 (tours_select).
-- =============================================================================

drop policy if exists tours_select on public.tours;
create policy tours_select on public.tours
  for select to authenticated
  using (
    -- Owner can always read their own tour. owner_id is a column on the NEW row
    -- itself, so this is visible during INSERT ... RETURNING without depending
    -- on the freshly-inserted tour_members row being visible yet. This is what
    -- unblocks createTour()'s .insert(...).select() (return=representation).
    owner_id = auth.uid ()
    -- Non-owner members keep read access via membership (REQ-F5-006).
    or public.is_tour_member (id)
  );
