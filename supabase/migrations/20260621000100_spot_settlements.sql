-- =============================================================================
-- SPEC-BREADTOUR-001 :: per-spot bill settlement (정산 / dutch-pay)
-- One settlement row per spot. Members enter a total amount, pick who paid
-- (payers split the total equally) and who shares the cost (participants split
-- equally). Net per person = paid - share. Mirrors the spots/stamps patterns:
-- tour_id is denormalized for simple RLS and kept in sync by a BEFORE trigger.
-- Depends on migration 1 (set_updated_at, is_tour_member, is_tour_owner) and
-- migration 2 (spots).
-- =============================================================================

create table if not exists public.spot_settlements (
  id              uuid primary key default gen_random_uuid (),
  -- One settlement per spot (upsert target). Cascades when the spot is removed.
  spot_id         uuid not null unique references public.spots (id) on delete cascade,
  -- Denormalized for RLS; synced from the parent spot by the trigger below.
  tour_id         uuid not null references public.tours (id) on delete cascade,
  -- KRW, whole won. >= 0 guard.
  amount          integer not null default 0 check (amount >= 0),
  -- Members who paid (the total is split equally among them).
  payer_ids       uuid[] not null default '{}',
  -- Members who share the cost (the total is split equally among them).
  participant_ids uuid[] not null default '{}',
  created_by      uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists spot_settlements_tour_id_idx on public.spot_settlements (tour_id);
create index if not exists spot_settlements_spot_id_idx on public.spot_settlements (spot_id);

-- updated_at maintenance (reuses the shared trigger function from migration 1).
drop trigger if exists spot_settlements_set_updated_at on public.spot_settlements;
create trigger spot_settlements_set_updated_at
  before update on public.spot_settlements
  for each row execute function public.set_updated_at ();

-- Keep tour_id consistent with the parent spot (mirror of sync_stamp_tour_id),
-- so the client cannot point a settlement at a tour it does not belong to and
-- the RLS checks below can rely on tour_id alone.
create or replace function public.sync_settlement_tour_id ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.tour_id into new.tour_id
  from public.spots s
  where s.id = new.spot_id;
  return new;
end;
$$;

drop trigger if exists spot_settlements_sync_tour_id on public.spot_settlements;
create trigger spot_settlements_sync_tour_id
  before insert or update on public.spot_settlements
  for each row execute function public.sync_settlement_tour_id ();

-- ---------------------------------------------------------------------------
-- RLS: any tour member may read/create/edit/delete their tour's settlements
-- (collaborative, like spots). tour_id is set by the BEFORE trigger above
-- before these checks run (same approach as stamps).
-- ---------------------------------------------------------------------------
alter table public.spot_settlements enable row level security;

drop policy if exists spot_settlements_select on public.spot_settlements;
create policy spot_settlements_select on public.spot_settlements
  for select to authenticated
  using (public.is_tour_member (tour_id));

drop policy if exists spot_settlements_insert on public.spot_settlements;
create policy spot_settlements_insert on public.spot_settlements
  for insert to authenticated
  with check (
    created_by = auth.uid ()
    and exists (
      select 1 from public.spots s
      where s.id = spot_settlements.spot_id
        and public.is_tour_member (s.tour_id)
    )
  );

drop policy if exists spot_settlements_update on public.spot_settlements;
create policy spot_settlements_update on public.spot_settlements
  for update to authenticated
  using (public.is_tour_member (tour_id))
  with check (
    exists (
      select 1 from public.spots s
      where s.id = spot_settlements.spot_id
        and public.is_tour_member (s.tour_id)
    )
  );

drop policy if exists spot_settlements_delete on public.spot_settlements;
create policy spot_settlements_delete on public.spot_settlements
  for delete to authenticated
  using (public.is_tour_member (tour_id));
