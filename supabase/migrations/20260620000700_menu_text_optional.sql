-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration / Allow photo-only signature menus (REQ-F4)
-- =============================================================================
-- A signature menu may now be registered with a photo but no text (the photo IS
-- the menu). The previous CHECK required char_length(menu_text) >= 1, which
-- rejected photo-only menus. Relax it to allow an empty name (still capped at
-- 500 chars). The client prevents a truly-empty add (no text AND no photo).
-- =============================================================================

alter table public.spot_menus
  drop constraint if exists spot_menus_menu_text_check;

alter table public.spot_menus
  add constraint spot_menus_menu_text_check
  check (char_length(menu_text) <= 500);
