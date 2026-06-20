-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 11 / spot_menus -> profiles embed FK
-- =============================================================================
-- DEFECT: the spot list / map marker fetch menus with the PostgREST embed
--   `author:profiles(display_name)` (REQ-F4-003 attribution). spot_menus.author_id
--   only had a foreign key to auth.users, NOT to public.profiles, so PostgREST
--   could not resolve the relationship and returned PGRST200 ("Could not find a
--   relationship between 'spot_menus' and 'profiles'"). The error was swallowed
--   client-side, so every spot showed "추천 메뉴 없음" even after saving a menu.
--
-- FIX: add an explicit FK from spot_menus.author_id to profiles.id. profiles.id
--   IS auth.users.id (profiles.id references auth.users.id), so the values are
--   identical and the existing auth.users FK is kept for cascade semantics.
--   NOT VALID skips validation of any pre-existing orphan rows while still
--   registering the relationship PostgREST needs for embedding.
--
-- Depends on migration 1 (profiles) and migration 2 (spot_menus).
-- =============================================================================

alter table public.spot_menus
  drop constraint if exists spot_menus_author_id_profiles_fkey;

alter table public.spot_menus
  add constraint spot_menus_author_id_profiles_fkey
  foreign key (author_id) references public.profiles (id) on delete cascade
  not valid;
