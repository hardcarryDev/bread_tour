-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 10 / Per-tour spot kind list
-- Backs the "종류 추가" button: each tour owns a list of selectable spot
-- categories. Members pick from this list in the spot form and can append new
-- entries that every member then sees. spots.kind (free text since migration 9)
-- stores the chosen label.
-- =============================================================================
-- Depends on migration 1 (tours + is_tour_member/is_tour_owner) and migration 2
-- (spots).
-- =============================================================================

create table if not exists public.spot_kinds (
  id         uuid primary key default gen_random_uuid (),
  tour_id    uuid not null references public.tours (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now(),
  -- One row per (tour, label): the same category cannot be added twice.
  unique (tour_id, name)
);

create index if not exists spot_kinds_tour_id_idx on public.spot_kinds (tour_id);

-- ---------------------------------------------------------------------------
-- Seed the two defaults (빵집/음식점) whenever a tour is created so every new
-- tour starts with usable options. SECURITY DEFINER so the trigger can insert
-- regardless of the creating user's RLS context.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_spot_kinds ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.spot_kinds (tour_id, name)
  values (new.id, '빵집'), (new.id, '음식점')
  on conflict (tour_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_default_spot_kinds on public.tours;
create trigger trg_seed_default_spot_kinds
  after insert on public.tours
  for each row
  execute function public.seed_default_spot_kinds ();

-- ---------------------------------------------------------------------------
-- Backfill existing tours: the two defaults plus any kind already used by their
-- spots (so options carried over from migration 9's free-text values appear).
-- ---------------------------------------------------------------------------
insert into public.spot_kinds (tour_id, name)
select t.id, '빵집' from public.tours t
on conflict (tour_id, name) do nothing;

insert into public.spot_kinds (tour_id, name)
select t.id, '음식점' from public.tours t
on conflict (tour_id, name) do nothing;

insert into public.spot_kinds (tour_id, name)
select distinct s.tour_id, s.kind
from public.spots s
where char_length(s.kind) between 1 and 50
on conflict (tour_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- RLS (mirrors spots: members read/add, owner deletes). UPDATE intentionally
-- has no policy -- labels are immutable; "rename" means adding a new label.
-- ---------------------------------------------------------------------------
alter table public.spot_kinds enable row level security;

drop policy if exists spot_kinds_select on public.spot_kinds;
create policy spot_kinds_select on public.spot_kinds
  for select to authenticated
  using (public.is_tour_member (tour_id));

drop policy if exists spot_kinds_insert on public.spot_kinds;
create policy spot_kinds_insert on public.spot_kinds
  for insert to authenticated
  with check (public.is_tour_member (tour_id));

drop policy if exists spot_kinds_delete on public.spot_kinds;
create policy spot_kinds_delete on public.spot_kinds
  for delete to authenticated
  using (public.is_tour_owner (tour_id));
