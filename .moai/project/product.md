# Product Overview

**App name:** 빵투어 (bread-tour)
**SPEC:** SPEC-BREADTOUR-001
**Last updated:** 2026-06-21

---

## What It Is

A mobile-first GPS stamp-rally web app for groups visiting bakeries and restaurants together. Members create a tour, add spots on a map, and earn digital stamps by physically visiting each location in order.

---

## Who It Is For

Small groups of friends or colleagues who want a structured, game-like way to visit multiple food/bakery spots together. The app handles group coordination, navigation, and shared bill splitting.

---

## Core Features

### Tours and Members
- Any authenticated user can create a tour and becomes its owner.
- Members join via an invite link; the owner controls membership and tour settings.
- Supabase Realtime broadcasts all changes (spots, menus, stamps, settlement) to every open client instantly.
- Presence display shows which members are currently connected.

### Spots
- Spots are added by tapping on the Kakao Maps map or searching by keyword.
- Each spot has a name, kind (bakery/restaurant or custom per-tour label), coordinates, and arrival radius.
- Visit order is set by drag-and-drop; the owner-only reorder is applied as a single atomic transaction.
- "내기준정렬" (sort by my location) re-orders the local view by distance without changing the shared order.

### Menu Recommendations
- Any member can add recommended menu items (text + photos) to each spot.
- Photos open in an in-app full-screen lightbox (swipe, keyboard nav, zoom-to-fit) instead of a new browser tab.
- Menu text can be edited by its author after creation.

### GPS Stamp Collection
- The app watches the device GPS position and automatically issues a stamp when the user dwells inside the spot's radius for the required time.
- An accuracy gate holds low-accuracy readings and retries.
- Manual check-in: a peer member can confirm arrival on behalf of a user who lacks GPS permission.
- Stamps can be cancelled (soft-cancel, row preserved) and re-earned.

### Directions and Route
- Three transport modes: car (Kakao Mobility), walking/transit (TMAP).
- A compact icon-button control on the map top-right switches between straight-line connector, car route, and walking route.
- The straight-line connector hides when a road route is active.
- The per-pair DirectionsPanel shows transit segments, fares, and total walking time.
- API keys are kept server-side via a Supabase Edge Function proxy.

### Settlement (정산)
- Per-spot bill split: enter the total amount, pick one payer and the participants who share the cost equally.
- Each participant can mark their share as sent (보냄); the payer can mark them as settled (정산 완료).
- A tour-wide summary shows outstanding balances and suggested transfers.
- Backed by the `spot_settlements` Supabase table (one row per spot, RLS: any tour member).
