-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 1 / Core schema
-- Tables: profiles, tours, tour_members, tour_invites
-- Plus SECURITY DEFINER membership helpers used by every RLS policy.
-- =============================================================================
-- Ordering note: this file MUST run before the spots/menus/stamps migration
-- (foreign keys reference tours) and before the RLS migration (policies call
-- the helper functions defined here).
-- All timestamps are server-side (now()): arrival/edit time source of truth is
-- the server, never the client device clock (SPEC A6 / NFR-CONFLICT-001).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- gen_random_uuid() ships with pgcrypto on managed Postgres / Supabase.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Wrapped in DO blocks so re-running the migration does not error on an
-- already-created type (idempotent-friendly per task constraint).
do $$ begin
  create type tour_member_role as enum ('owner', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tour_invite_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type spot_kind as enum ('bakery', 'restaurant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stamp_method as enum ('auto', 'manual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles : 1:1 with auth.users, holds display info the client may read.
-- (auth.users itself is not directly selectable by the anon/authenticated
-- roles, so a public-facing mirror is required to render member names.)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tours : the stamp-rally itself. owner_id is the creator (REQ-F6-001).
-- ---------------------------------------------------------------------------
create table if not exists public.tours (
  id         uuid primary key default gen_random_uuid (),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tours_owner_id_idx on public.tours (owner_id);

-- ---------------------------------------------------------------------------
-- tour_members : membership + role (REQ-F6-004/005). This table is the
-- authority for "who may see/edit a tour" and is referenced by every other
-- table's RLS policy via the helper functions below.
-- ---------------------------------------------------------------------------
create table if not exists public.tour_members (
  id        uuid primary key default gen_random_uuid (),
  tour_id   uuid not null references public.tours (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      tour_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (tour_id, user_id)
);

create index if not exists tour_members_tour_id_idx on public.tour_members (tour_id);
create index if not exists tour_members_user_id_idx on public.tour_members (user_id);

-- ---------------------------------------------------------------------------
-- tour_invites : link/email invitations (REQ-F6-002/003).
-- token is for link-based invites; invited_email is optional for email invites.
-- ---------------------------------------------------------------------------
create table if not exists public.tour_invites (
  id            uuid primary key default gen_random_uuid (),
  tour_id       uuid not null references public.tours (id) on delete cascade,
  invited_email text,
  token         text not null unique default encode(gen_random_bytes(18), 'hex'),
  status        tour_invite_status not null default 'pending',
  invited_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tour_invites_tour_id_idx on public.tour_invites (tour_id);
create index if not exists tour_invites_email_idx on public.tour_invites (invited_email);

-- ---------------------------------------------------------------------------
-- updated_at trigger : keeps updated_at = server now() on every UPDATE.
-- This is the server timestamp that row-level last-write-wins relies on
-- (NFR-CONFLICT-001/002 / D4). Clients never set updated_at.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at ();

drop trigger if exists tours_set_updated_at on public.tours;
create trigger tours_set_updated_at
  before update on public.tours
  for each row execute function public.set_updated_at ();

drop trigger if exists tour_invites_set_updated_at on public.tour_invites;
create trigger tour_invites_set_updated_at
  before update on public.tour_invites
  for each row execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Membership helper functions (SECURITY DEFINER).
--
-- These run with the function owner's privileges and therefore BYPASS RLS on
-- tour_members. That is required to avoid infinite recursion: tour_members'
-- own RLS policy needs to ask "is this user a member?", which would re-trigger
-- the same policy if it queried tour_members directly under RLS.
--
-- search_path is pinned to public to prevent search_path hijacking on a
-- SECURITY DEFINER function (a real privilege-escalation vector).
-- ---------------------------------------------------------------------------
create or replace function public.is_tour_member (p_tour_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tour_members tm
    where tm.tour_id = p_tour_id
      and tm.user_id = auth.uid ()
  );
$$;

create or replace function public.is_tour_owner (p_tour_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tour_members tm
    where tm.tour_id = p_tour_id
      and tm.user_id = auth.uid ()
      and tm.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-bootstrap : when a tour is created, insert the creator as the owner
-- member in the same transaction. Without this, the creator could not pass
-- their own RLS membership check and would be locked out of the tour they
-- just made (REQ-F6-001).
-- ---------------------------------------------------------------------------
create or replace function public.add_owner_membership ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tour_members (tour_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (tour_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tours_add_owner_membership on public.tours;
create trigger tours_add_owner_membership
  after insert on public.tours
  for each row execute function public.add_owner_membership ();

-- ---------------------------------------------------------------------------
-- Profile auto-provisioning : create a profiles row whenever a new auth user
-- signs up, so member lists can render a display name.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();
