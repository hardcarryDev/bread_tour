-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 8 / Idempotent re-click of accept_invite
-- =============================================================================
-- DEFECT:
--   A user who already accepted an invite and re-opens the same invite link
--   gets an error instead of being taken back into the tour. accept_invite()
--   flips the invite status 'pending' -> 'accepted' on first accept, so a second
--   call hits `if v_invite.status <> 'pending' then raise ...` and aborts BEFORE
--   returning the tour id. The caller is already a member but can never navigate
--   in via the link again.
--
-- FIX (minimal, single-use protection preserved):
--   When the invite is no longer 'pending', check whether the CALLER is already
--   a member of that tour. If so, the re-click is a no-op success: return the
--   tour id so the client navigates into the tour. Only raise when the caller is
--   NOT a member (a genuinely used/rejected link for someone else), keeping the
--   one-token-one-join guarantee for non-members.
--
-- This is the behaviour the original @MX:ANCHOR already intended ("acceptance
-- stays idempotent"); the status check short-circuited it for the re-click path.
--
-- Depends on migration 6 (accept_invite) and migration 1 (tour_members).
-- =============================================================================

-- @MX:ANCHOR: [AUTO] accept_invite() is the ONLY atomic path that turns a
-- pending invite into a membership; membership insert + invite status update
-- happen in one transaction (REQ-F6-003 / AC-F6-03). Re-clicking an already
-- accepted invite is now idempotent for existing members (returns the tour id).
-- @MX:REASON: H-02 — the prior client-side SELECT->INSERT->UPDATE was non-atomic
-- and could leave a member attached to a still-reusable invite. This function is
-- the invariant that guarantees both writes commit together or not at all.
--
-- @MX:WARN: [AUTO] SECURITY DEFINER bypasses RLS, so authorization is enforced
-- INSIDE the function.
-- @MX:REASON: it runs as owner and could otherwise add anyone to any tour; it
-- must validate the invite and bind the membership to auth.uid().
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

  -- Re-click after a prior accept: the invite is no longer pending. If the
  -- caller is already a member of the target tour, treat this as an idempotent
  -- success and send them back into the tour rather than erroring. A non-member
  -- hitting a used/rejected link is still rejected (single-use protection).
  if v_invite.status <> 'pending' then
    if exists (
      select 1
      from public.tour_members
      where tour_id = v_invite.tour_id
        and user_id = auth.uid ()
    ) then
      return v_invite.tour_id;
    end if;
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
