-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration 9 / Free-text spot kind
-- Converts spots.kind from the fixed `spot_kind` enum to free text so members
-- can enter any category (빵집, 음식점, 카페, 디저트, ...) instead of the two
-- hardcoded options. Existing enum values are mapped to their Korean display
-- labels so previously stored rows read naturally.
-- =============================================================================
-- Depends on migration 2 (spots table + spot_kind enum).
-- =============================================================================

-- Drop the enum default before changing the column type, then re-apply a
-- text default. Existing 'bakery'/'restaurant' values become their Korean
-- labels; any other value is preserved verbatim.
alter table public.spots alter column kind drop default;

alter table public.spots
  alter column kind type text using (
    case kind::text
      when 'bakery' then '빵집'
      when 'restaurant' then '음식점'
      else kind::text
    end
  );

alter table public.spots alter column kind set default '빵집';

-- Keep a light guard so the field cannot be blank or absurdly long.
alter table public.spots
  add constraint spots_kind_len check (char_length(kind) between 1 and 50);

-- The enum is no longer referenced by any column.
drop type if exists public.spot_kind;
