-- =============================================================================
-- SPEC-BREADTOUR-001 :: settlement payment tracking
-- Track which participants have already sent their share back to the payer
-- (정산 완료 / 보냄). The payer is a single person (the app now restricts
-- payer_ids to one entry); everyone else owes their share and gets checked off
-- here once they have paid the payer back.
-- =============================================================================

alter table public.spot_settlements
  add column if not exists settled_ids uuid[] not null default '{}';
