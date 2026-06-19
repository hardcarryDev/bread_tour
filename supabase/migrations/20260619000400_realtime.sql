-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 4 / Realtime publication
-- Add collaborative tables to supabase_realtime so row-level changes broadcast
-- to subscribed clients (REQ-F5-002, row-level last-write-wins per D4).
-- =============================================================================
-- Realtime broadcasts respect RLS: a subscriber only receives change events
-- for rows they are allowed to SELECT under the policies in migration 3.
--
-- We publish the tables that collaborative editing and the stamp board depend
-- on: tours (rename/delete), tour_members (joins/leaves), spots (add/edit/
-- reorder), spot_menus (menu edits), stamps (stamp board updates).
-- tour_invites is intentionally NOT published (invite flow does not need a
-- live channel for the MVP).
-- =============================================================================

-- supabase_realtime publication is created by the Supabase platform. On a bare
-- local Postgres it may not exist yet; create it defensively.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

-- Add tables idempotently. ALTER PUBLICATION ... ADD TABLE errors if the table
-- is already a member, so guard each one against pg_publication_tables.
do $$
declare
  t text;
  tbls text[] := array['tours', 'tour_members', 'spots', 'spot_menus', 'stamps'];
begin
  foreach t in array tbls loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- REPLICA IDENTITY FULL so UPDATE/DELETE realtime payloads include the full old
-- row. Without this, deletes broadcast only the primary key, which is enough to
-- remove a row from the UI but not to show "what changed" for last-write-wins
-- conflict toasts (NFR-CONFLICT-003).
alter table public.tours        replica identity full;
alter table public.tour_members replica identity full;
alter table public.spots        replica identity full;
alter table public.spot_menus   replica identity full;
alter table public.stamps       replica identity full;
