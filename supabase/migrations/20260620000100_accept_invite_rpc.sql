-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 6 / Atomic invite acceptance (REQ-F6-003)
-- accept_invite() RPC: validate a pending invite, insert the membership, and
-- mark the invite accepted in ONE transaction.
-- =============================================================================
-- WHY this RPC (defect H-02):
--   acceptInvite() previously did three separate client calls:
--     SELECT invite -> INSERT tour_members -> UPDATE invite status.
--   That sequence is NOT atomic. If the final UPDATE failed (network/RLS), the
--   user was left a member while the invite stayed 'pending' and therefore
--   reusable -- a duplicate-membership / replay hazard. Doing all three steps
--   inside a single SECURITY DEFINER function makes them one transaction: either
--   the membership AND the status change both commit, or neither does.
--
-- THREAT MODEL (D10 / A13): the anon key is public; security is RLS-only. This
-- function is SECURITY DEFINER (bypasses RLS) so it re-checks authorization
-- itself and pins search_path, mirroring confirm_manual_checkin() in migration 5
-- and reorder_spots() in migration 2.
--
-- Depends on migration 1 (tours / tour_members / tour_invites / tour_invite_status)
-- and migration 3 (tour_members_insert / tour_invites RLS policies).
-- =============================================================================

-- @MX:ANCHOR: [AUTO] accept_invite() is the ONLY atomic path that turns a
-- pending invite into a membership; membership insert + invite status update
-- happen in one transaction (REQ-F6-003 / AC-F6-03).
-- @MX:REASON: H-02 — the prior client-side SELECT->INSERT->UPDATE was non-atomic
-- and could leave a member attached to a still-reusable invite. This function is
-- the invariant that guarantees both writes commit together or not at all.
--
-- @MX:WARN: [AUTO] SECURITY DEFINER bypasses RLS, so authorization is enforced
-- INSIDE the function.
-- @MX:REASON: it runs as owner and could otherwise add anyone to any tour; it
-- must validate the invite is pending and bind the membership to auth.uid().
--
-- Contract:
--   p_token : the invite token being accepted.
--   Returns the tour id the caller just joined.
-- Behaviour:
--   - the invite MUST exist and still be 'pending' (no re-use of an
--     accepted/rejected invite -> raises, leaving no partial state).
--   - inserts a 'member' membership for the CALLER (auth.uid()); if they are
--     already a member the unique (tour_id, user_id) constraint short-circuits
--     to a no-op so acceptance stays idempotent.
--   - marks the invite 'accepted' so it cannot be replayed.
create or replace function public.accept_invite (
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.tour_invites%rowtype;
begin
  if auth.uid () is null then
    raise exception 'authentication required to accept an invite'
      using errcode = '42501';
  end if;

  -- Lock the invite row so two concurrent acceptances cannot both proceed.
  select * into v_invite
  from public.tour_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invalid invite token'
      using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invalid or already-used invite'
      using errcode = '22023';
  end if;

  -- Add the caller as a 'member'. Idempotent: an existing membership row for
  -- (tour, user) is left untouched rather than erroring, so a retried accept
  -- still ends in a consistent state.
  insert into public.tour_members (tour_id, user_id, role)
  values (v_invite.tour_id, auth.uid (), 'member')
  on conflict (tour_id, user_id) do nothing;

  -- Mark the invite accepted so it can never be reused (replay protection).
  update public.tour_invites
  set status = 'accepted'
  where id = v_invite.id;

  return v_invite.tour_id;
end;
$$;
