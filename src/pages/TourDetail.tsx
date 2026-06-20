import { Suspense, lazy, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useTourDetail } from '../hooks/useTours';
import {
  createInvite,
  deleteTour,
  inviteLinkFor,
  removeMember,
} from '../features/tour/api';
import { useSpots } from '../features/map/useSpots';
import { useSpotKinds } from '../features/map/useSpotKinds';
import SpotList from '../features/map/SpotList';
import SpotReorder from '../features/map/SpotReorder';
import SpotForm, { type SpotFormValues } from '../features/map/SpotForm';
import {
  addSpot,
  deleteSpot,
  reorderSpots,
  updateSpot,
} from '../features/map/api';
import {
  addSpotMenu,
  deleteSpotMenu,
  updateSpotMenuText,
  removeImageObjects,
  updateMenuImages,
  uploadMenuImage,
  type MenuImage,
  type SpotMenuWithAuthor,
} from '../features/menu/api';
import { useStamps } from '../features/stamp/useStamps';
import { usePendingCheckIns } from '../features/stamp/usePendingCheckIns';
import { useGeoStamp } from '../features/stamp/useGeoStamp';
import {
  cancelManualCheckIn,
  cancelStamp,
  confirmManualCheckIn,
  createStamp,
  requestManualCheckIn,
} from '../features/stamp/api';
import StampTracker from '../features/stamp/StampTracker';
import StampProgress from '../features/stamp/StampProgress';
import ManualCheckIn from '../features/stamp/ManualCheckIn';
import DirectionsPanel from '../features/directions/DirectionsPanel';
import { getPathRoute, getRoute } from '../features/directions/api';
import type { LatLng, TravelMode } from '../features/directions/route';
import type { SpotDistance } from '../features/map/SpotList';
import {
  spotConflictValue,
  useRealtimeTour,
} from '../features/collab/useRealtimeTour';
import MemberRoster from '../features/collab/MemberRoster';
import OfflineIndicator from '../features/collab/OfflineIndicator';
import ToastHost from '../features/collab/ToastHost';
import { useProfiles } from '../features/profile/useProfiles';
import AppNav from '../features/profile/AppNav';
import type { Spot } from '../types/database';
import { errorMessage } from '../lib/errors';

// Lazy-load the Kakao map so its SDK + render code stays out of the initial
// bundle (Slice A noted a 456KB baseline). The spot list works without it.
const MapView = lazy(() => import('../features/map/MapView'));

// Modes for the "전체 경로 보기" overlay control only. 'straight' (직선) draws the
// visit order as plain connectors with no routing API call; 'car'/'walk' are a
// subset of the shared TravelMode and use the road-routing path. (대중교통/transit
// stays on the separate DirectionsPanel, not on this control.)
type RouteOverlayMode = 'straight' | 'car' | 'walk';

// Tour detail shell. Spots / map / stamps arrive in Slice B — only the
// lifecycle + permission surface (F6) is implemented here. Owner-only controls
// are gated on the current user's role (REQ-F6-004/005/006). RLS is the real
// enforcement; this UI must not present owner controls to members.
export default function TourDetail() {
  const { tourId } = useParams<{ tourId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tour, members, role, loading, error, reload } = useTourDetail(
    tourId,
    user?.id,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const {
    spots,
    menusBySpot,
    loading: spotsLoading,
    reload: reloadSpots,
  } = useSpots(tourId);
  // Per-tour 종류 list for the spot form dropdown + "종류 추가" button (F1).
  const { kinds: spotKinds, addKind: addSpotKindOption } = useSpotKinds(tourId);
  const [showSpotForm, setShowSpotForm] = useState(false);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  // "순서" mode: multi-select + drag-and-drop reorder applied on 확인.
  const [reorderMode, setReorderMode] = useState(false);
  // Real road route to overlay on the map (REQ-F2-001). Set from DirectionsPanel's
  // onRoute callback so the actual Kakao road polyline is drawn, not just the
  // straight spot-order connector. undefined => no route currently shown.
  const [routePath, setRoutePath] = useState<LatLng[] | undefined>(undefined);
  // Whole-tour route overlay (REQ-F2-001): on-demand per overlay mode
  // (직선/차/도보). Each leg is drawn in its own color. `routeLegs` holds the
  // per-segment geometry; `routeModeShown` is the mode currently drawn (null =
  // none); `routeBusy` is the mode being fetched. This control has its own
  // 'straight' (직선) mode which the shared TravelMode does not include, so it
  // uses a LOCAL union — `travelMode`/DirectionsPanel stay TravelMode.
  const [routeLegs, setRouteLegs] = useState<LatLng[][] | undefined>(undefined);
  const [routeModeShown, setRouteModeShown] = useState<RouteOverlayMode | null>(
    null,
  );
  const [routeBusy, setRouteBusy] = useState<RouteOverlayMode | null>(null);

  // Selected travel mode, lifted from DirectionsPanel so BOTH the directions
  // toggle AND the "내기준정렬" button read the same mode (Feature). Default 차/car.
  const [travelMode, setTravelMode] = useState<TravelMode>('car');

  // "내기준정렬" local view sort state (Feature). This is a PERSONAL view sort —
  // it never calls reorder_spots or changes order_index. When `sortMode` is set,
  // SpotList displays spots by ascending distance and shows the green captions.
  //   - distanceBySpot: per-spot { distanceM, durationSec, fallback } or null on
  //     failure, keyed by spot id (in-memory only).
  //   - sorting: button loading state while distances compute.
  const [distanceBySpot, setDistanceBySpot] = useState<
    Record<string, SpotDistance | null>
  >({});
  const [sortMode, setSortMode] = useState<TravelMode | null>(null);
  const [sorting, setSorting] = useState(false);

  const isOwner = role === 'owner';

  // Slice C: stamp status (REQ-F1-005) + GPS auto-stamp pipeline (F1) + directions.
  const { stampBySpot, stampedSpotIds, reload: reloadStamps } = useStamps(tourId);

  // Manual check-in fallback (REQ-F1-007 / AC-F1-04): pending peer-confirmation
  // requests for this tour. Refreshed live by the realtime hook below.
  const { pendingRequests, reload: reloadPendingCheckIns } =
    usePendingCheckIns(tourId);

  // Resolve every member's user id to a display name so the member list and the
  // presence indicator show real names instead of raw UUIDs (REQ-F5-003 /
  // Feature 1). Reading co-member profiles is RLS-permitted (same as the menu
  // contributor join). useMemo keeps the id array stable so useProfiles only
  // refetches when the membership actually changes.
  const memberUserIds = useMemo(
    () => members.map((m) => m.user_id),
    [members],
  );
  const profileNames = useProfiles(memberUserIds);

  // Best-effort user_id -> display_name map for presence labels (REQ-F5-003).
  // Member profiles (fetched fresh from `profiles`) are authoritative; menu
  // authors only fill in ids not already covered (e.g. a former member who
  // authored a menu). Presence falls back to "(이름 없음)" when a name is still
  // unknown.
  const profilesByUserId: Record<string, string | null> = {};
  for (const list of Object.values(menusBySpot)) {
    for (const m of list) {
      if (m.author?.display_name) profilesByUserId[m.author_id] = m.author.display_name;
    }
  }
  Object.assign(profilesByUserId, profileNames);

  // Slice D: subscribe the tour's realtime channel so other members' spot/menu/
  // stamp/member changes reflect live (REQ-F5-002), show presence (REQ-F5-003),
  // surface overwrite conflicts non-destructively (REQ-F5-004), and keep last
  // state while offline + re-sync on reconnect (REQ-F5-005).
  const { connectedMembers, online, toasts, dismissToast, notePendingEdit } =
    useRealtimeTour({
      tourId,
      currentUserId: user?.id,
      reloadSpots,
      reloadStamps,
      reloadMembers: reload,
      reloadPendingCheckIns,
      profilesByUserId,
    });

  // When the GPS pipeline signals a sustained arrival, create the stamp with the
  // server timestamp (A6 — no client time) and refresh status. createStamp may
  // reject on the partial-unique-index when a valid stamp already exists
  // (REQ-F1-004); that is expected and non-fatal here.
  const geo = useGeoStamp({
    spots,
    stampedSpotIds,
    onStamp: async (spotId) => {
      if (!user) return;
      try {
        await createStamp({ spotId, userId: user.id });
        reloadStamps();
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
  });

  async function handleCancelStamp(stampId: string) {
    setActionError(null);
    try {
      await cancelStamp(stampId);
      reloadStamps();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Manual check-in fallback (REQ-F1-007 / AC-F1-04). A request creates a PENDING
  // row (not a stamp); the stamp is only created when a DIFFERENT member confirms
  // (via the confirm_manual_checkin RPC). Realtime surfaces the request to other
  // members and notifies the requester on confirmation.
  async function handleRequestCheckIn(spotId: string) {
    if (!user) return;
    setActionError(null);
    try {
      await requestManualCheckIn({ spotId, userId: user.id });
      reloadPendingCheckIns();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleConfirmCheckIn(requestId: string, requesterId: string) {
    if (!user) return;
    setActionError(null);
    try {
      await confirmManualCheckIn({
        requestId,
        confirmerId: user.id,
        requesterId,
      });
      reloadPendingCheckIns();
      reloadStamps();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleCancelCheckIn(requestId: string) {
    setActionError(null);
    try {
      await cancelManualCheckIn(requestId);
      reloadPendingCheckIns();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleDeleteTour() {
    if (!tourId) return;
    setActionError(null);
    try {
      await deleteTour(tourId);
      navigate('/tours');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleRemoveMember(memberId: string) {
    setActionError(null);
    try {
      await removeMember(memberId);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleInvite() {
    if (!tourId || !user) return;
    setActionError(null);
    try {
      const invite = await createInvite({
        tourId,
        invitedBy: user.id,
      });
      setInviteLink(inviteLinkFor(invite.token));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Add a spot (REQ-F1-001 coordinate + radius) plus an optional menu in the
  // same flow (REQ-F4-001). An empty menu is allowed and simply not stored
  // (REQ-F4-004 / AC-F4-03).
  async function handleAddSpot(values: SpotFormValues) {
    if (!tourId || !user) return;
    setActionError(null);
    try {
      const spot = await addSpot({
        tourId,
        name: values.name,
        lat: values.lat,
        lng: values.lng,
        kind: values.kind,
        existingCount: spots.length,
      });
      if (values.menuText.length > 0) {
        await addSpotMenu({
          spotId: spot.id,
          authorId: user.id,
          menuText: values.menuText,
        });
      }
      setShowSpotForm(false);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleEditSpot(values: SpotFormValues) {
    if (!editingSpot || !user) return;
    setActionError(null);
    // Record the value we are submitting so an overwriting change from another
    // member (row-level last-write-wins) can be detected and surfaced as a
    // non-destructive toast (REQ-F5-004 / NFR-CONFLICT-003). Use the composite of
    // every editable field so a concurrent lat/lng/kind/radius change (not just a
    // name change) is also detected (H-01 / AC-F5-03/04).
    notePendingEdit({
      table: 'spots',
      rowId: editingSpot.id,
      value: spotConflictValue({
        name: values.name,
        lat: values.lat,
        lng: values.lng,
        kind: values.kind,
        radius_m: editingSpot.radius_m,
      }),
    });
    try {
      await updateSpot(editingSpot.id, {
        name: values.name,
        lat: values.lat,
        lng: values.lng,
        kind: values.kind,
      });
      if (values.menuText.length > 0) {
        await addSpotMenu({
          spotId: editingSpot.id,
          authorId: user.id,
          menuText: values.menuText,
        });
      }
      setEditingSpot(null);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Persist a new visit order via the single-transaction reorder RPC
  // (REQ-F5-007 / AC-F5-06), then refresh.
  async function handleReorder(orderedIds: string[]) {
    if (!tourId) return;
    setActionError(null);
    try {
      await reorderSpots(tourId, orderedIds);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Show the whole-tour route for an overlay mode (직선/차/도보), drawing each
  // visit-order segment in its own color. Clicking the mode that is already
  // shown toggles it off. For 직선 (straight) we build the connectors locally
  // with no routing call (instant). For 차/도보 we fetch the real road path;
  // getPathRoute never throws (each leg degrades to a straight segment), so the
  // map stays usable even if routing fails.
  async function showRouteForMode(mode: RouteOverlayMode) {
    if (routeModeShown === mode) {
      setRouteModeShown(null);
      setRouteLegs(undefined);
      return;
    }
    const ordered = [...spots].sort((a, b) => a.order_index - b.order_index);
    if (ordered.length < 2) return;

    // 직선: straight connectors between adjacent spots, no routing API call.
    if (mode === 'straight') {
      const legPaths: LatLng[][] = [];
      for (let i = 0; i < ordered.length - 1; i++) {
        const a = ordered[i];
        const b = ordered[i + 1];
        legPaths.push([
          { lat: a.lat, lng: a.lng },
          { lat: b.lat, lng: b.lng },
        ]);
      }
      setActionError(null);
      setRouteLegs(legPaths);
      setRouteModeShown('straight');
      return;
    }

    // 차/도보: real road path. mode is 'car' | 'walk' here, both ⊂ TravelMode.
    setRouteBusy(mode);
    setActionError(null);
    try {
      const result = await getPathRoute(
        ordered.map((s) => ({ lat: s.lat, lng: s.lng })),
        { mode },
      );
      setRouteLegs(result.legPaths);
      setRouteModeShown(mode);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setRouteBusy(null);
    }
  }

  async function handleDeleteSpot(spotId: string) {
    setActionError(null);
    try {
      await deleteSpot(spotId);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Upload photos for a menu and return their { path, url } descriptors.
  async function uploadFilesForMenu(
    menuId: string,
    files: File[],
  ): Promise<MenuImage[]> {
    if (!tourId || files.length === 0) return [];
    const uploaded: MenuImage[] = [];
    for (const file of files) {
      uploaded.push(await uploadMenuImage(file, { tourId, menuId }));
    }
    return uploaded;
  }

  // Add a signature menu to a spot from the inline editor (REQ-F4-001), with any
  // attached photos, then refresh so the editor reflects it immediately.
  async function handleAddMenuToSpot(
    spotId: string,
    menuText: string,
    files: File[] = [],
  ) {
    if (!user) return;
    setActionError(null);
    try {
      const menu = await addSpotMenu({ spotId, authorId: user.id, menuText });
      const uploaded = await uploadFilesForMenu(menu.id, files);
      if (uploaded.length > 0) await updateMenuImages(menu.id, uploaded);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Attach more photos to an existing menu (REQ-F4 images).
  async function handleAddImagesToMenu(
    menu: SpotMenuWithAuthor,
    files: File[],
  ) {
    setActionError(null);
    try {
      const uploaded = await uploadFilesForMenu(menu.id, files);
      if (uploaded.length > 0) {
        await updateMenuImages(menu.id, [...(menu.images ?? []), ...uploaded]);
        reloadSpots();
      }
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Detach one photo from a menu: drop it from images, then best-effort delete
  // the underlying storage object.
  async function handleRemoveMenuImage(
    menu: SpotMenuWithAuthor,
    image: MenuImage,
  ) {
    setActionError(null);
    try {
      const next = (menu.images ?? []).filter((i) => i.path !== image.path);
      await updateMenuImages(menu.id, next);
      await removeImageObjects([image.path]);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Delete a signature menu from the inline editor (REQ-F4). RLS allows the
  // author or the tour owner; a denied attempt surfaces as an error.
  async function handleDeleteMenu(menuId: string) {
    setActionError(null);
    try {
      await deleteSpotMenu(menuId);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleUpdateMenu(menuId: string, text: string) {
    setActionError(null);
    try {
      await updateSpotMenuText(menuId, text);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  // Resolve the user's current location for the local sort. Prefer the live
  // in-memory GPS fix (NFR-GEO-006: never persisted); if tracking is off, take a
  // ONE-SHOT navigator.geolocation fix (also in-memory only — never stored).
  // Resolves null when location is denied/unavailable so the caller can show a
  // clear message and skip sorting.
  function resolveCurrentLocation(): Promise<LatLng | null> {
    if (geo.currentPosition) {
      return Promise.resolve({
        lat: geo.currentPosition.lat,
        lng: geo.currentPosition.lng,
      });
    }
    const geolocation =
      typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null), // permission denied / unavailable
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
    });
  }

  // "내기준정렬": compute each spot's distance from the user's current location
  // using the CURRENTLY SELECTED travel mode, then display the list ascending by
  // distance (closest first) with a green per-spot caption (Feature). LOCAL VIEW
  // ONLY — this never persists order (no reorder_spots / no order_index change).
  async function handleSortByMyDistance() {
    setActionError(null);
    const origin = await resolveCurrentLocation();
    if (!origin) {
      // Denied / unavailable: do NOT sort; surface a clear Korean message.
      setActionError(
        '현재 위치를 가져올 수 없습니다. 위치 권한을 허용해 주세요.',
      );
      return;
    }
    const mode = travelMode;
    setSorting(true);
    try {
      // Compute all spot distances in parallel with the selected mode.
      const results = await Promise.all(
        spots.map(async (spot) => {
          try {
            const route = await getRoute(
              origin,
              { lat: spot.lat, lng: spot.lng },
              { mode },
            );
            return [
              spot.id,
              {
                distanceM: route.distanceM,
                durationSec: route.durationSec,
                fallback: route.fallback,
              } as SpotDistance,
            ] as const;
          } catch {
            // A failed spot sorts last and shows no caption.
            return [spot.id, null] as const;
          }
        }),
      );
      setDistanceBySpot(Object.fromEntries(results));
      // Caption the rows with the mode that was actually used for THIS sort.
      setSortMode(mode);
    } finally {
      setSorting(false);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted" role="status">
          불러오는 중...
        </p>
      </main>
    );
  }

  // RLS hid the tour or it does not exist (REQ-F5-006 / AC-F5-01).
  if (error || !tour) {
    return (
      <main className="page">
        <h1>접근할 수 없는 투어</h1>
        <p role="alert">
          이 투어를 볼 권한이 없습니다. 투어 멤버에게 초대를 요청하세요.
        </p>
        <button type="button" onClick={() => navigate('/tours')}>
          내 투어로 돌아가기
        </button>
      </main>
    );
  }

  return (
    <main className="page page-tour-detail">
      <header className="page-header">
        <h1>{tour.name}</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => navigate('/tours')}
          >
            뒤로
          </button>
          {/* Name + 정보 변경 + 로그아웃 entry point (REQ-F5 nav). */}
          <AppNav />
        </div>
      </header>

      <div className="collab-bar">
        <p className="role-badge">{isOwner ? '소유자' : '멤버'}</p>
      </div>

      <OfflineIndicator online={online} />

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {/* Single member roster (F5/F6): all members with an "접속 중" dot for
          those present on the realtime channel. The owner long-presses a name
          (touch/mouse hold or right-click) to remove a member; the invite
          control lives here too (owner only, AC-F6-02/04/06). */}
      <MemberRoster
        members={members}
        profileNames={profileNames}
        onlineIds={new Set(connectedMembers.map((m) => m.user_id))}
        isOwner={isOwner}
        inviteLink={inviteLink}
        onInvite={handleInvite}
        onRemoveMember={handleRemoveMember}
      />

      {/* Slice B: spots list + Kakao map + add/edit/reorder. Stamps (Slice C)
          and realtime (Slice D) plug into MapView / useSpots via props. */}
      <section
        className="spots-panel"
        data-testid="spots-panel"
        aria-label="장소 목록"
      >
        <div className="section-head">
          <h2>장소</h2>
          <div className="spots-panel-actions">
            {/* "순서": enter multi-select + drag-and-drop reorder mode (AC-F5-06).
                Needs at least two spots to be meaningful. */}
            <button
              type="button"
              data-testid="reorder-mode"
              onClick={() => {
                setSortMode(null);
                setShowSpotForm(false);
                setEditingSpot(null);
                setReorderMode(true);
              }}
              disabled={reorderMode || spots.length < 2}
            >
              순서
            </button>
            {/* "내기준정렬" (Feature): personal distance sort, to the LEFT of
                "장소 추가". Uses the currently selected travel mode and the
                user's current location; LOCAL VIEW ONLY (never persisted). */}
            <button
              type="button"
              onClick={() => void handleSortByMyDistance()}
              disabled={sorting || reorderMode}
            >
              {sorting ? '정렬 중…' : '내기준정렬'}
            </button>
            {/* Any member may add a spot (REQ-F6-005). */}
            <button
              type="button"
              onClick={() => {
                setEditingSpot(null);
                setShowSpotForm((v) => !v);
              }}
              disabled={reorderMode}
            >
              장소 추가
            </button>
          </div>
        </div>

        {showSpotForm && (
          <SpotForm
            kinds={spotKinds}
            onAddKind={addSpotKindOption}
            onSubmit={handleAddSpot}
            onCancel={() => setShowSpotForm(false)}
          />
        )}

        {spotsLoading ? (
          <p className="muted" role="status">
            장소 불러오는 중...
          </p>
        ) : reorderMode ? (
          <SpotReorder
            spots={spots}
            onApply={(orderedIds) => {
              setReorderMode(false);
              void handleReorder(orderedIds);
            }}
            onCancel={() => setReorderMode(false)}
          />
        ) : (
          <SpotList
            spots={spots}
            isOwner={isOwner}
            onReorder={handleReorder}
            onDelete={isOwner ? handleDeleteSpot : undefined}
            onEdit={(s) => {
              setShowSpotForm(false);
              setEditingSpot(s);
            }}
            // Inline edit: the editor renders inside the clicked row (not above
            // the list). It includes signature-menu add/delete (REQ-F4).
            editingSpotId={editingSpot?.id}
            renderEditor={(s) => (
              <SpotForm
                initial={{
                  name: s.name,
                  lat: s.lat,
                  lng: s.lng,
                  kind: s.kind,
                }}
                kinds={spotKinds}
                onAddKind={addSpotKindOption}
                menus={menusBySpot[s.id] ?? []}
                onAddMenu={(text, files) =>
                  handleAddMenuToSpot(s.id, text, files)
                }
                onDeleteMenu={handleDeleteMenu}
                onUpdateMenu={handleUpdateMenu}
                onAddImagesToMenu={handleAddImagesToMenu}
                onRemoveImage={handleRemoveMenuImage}
                currentUserId={user?.id}
                isOwner={isOwner}
                onSubmit={handleEditSpot}
                onCancel={() => setEditingSpot(null)}
              />
            )}
            // Personal distance sort (Feature): display by distance + show the
            // green captions. order_index / shared plan order is untouched.
            sortMode={sortMode}
            distanceBySpot={distanceBySpot}
            menusBySpot={menusBySpot}
          />
        )}

        {/* Map on the left (shrinks to fit), the whole-tour route control as a
            vertical button column on the right. */}
        <div className="map-with-route">
          <Suspense
            fallback={
              <p className="muted" role="status">
                지도 불러오는 중...
              </p>
            }
          >
            {/* Slice C wires real stamp status into the map summary placeholder. */}
            <MapView
              spots={spots}
              menusBySpot={menusBySpot}
              stampBySpot={stampBySpot}
              routePath={routePath}
              routeLegs={routeLegs}
              // Live "내 위치" marker while GPS tracking is active. This is the
              // same in-memory fix used for directions (NFR-GEO-006: never
              // persisted); it appears while tracking and clears to null on stop.
              currentLocation={geo.currentPosition}
            />
          </Suspense>

          {/* Whole-tour route per mode (REQ-F2-001): draw the visit order either
              as straight connectors (직선) or the real road-following path
              (차/도보), each segment in its own color. One button per mode; the
              active mode toggles off when pressed again. */}
          {spots.length >= 2 && (
            <div
              className="route-mode-control route-mode-control--side"
              role="group"
              aria-label="전체 경로 보기"
            >
              {([
                { mode: 'straight', label: '직선' },
                { mode: 'car', label: '차' },
                { mode: 'walk', label: '도보' },
              ] as const).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  className="route-mode-btn"
                  aria-pressed={routeModeShown === mode}
                  data-testid={`route-mode-${mode}`}
                  onClick={() => void showRouteForMode(mode)}
                  disabled={routeBusy !== null}
                >
                  {routeBusy === mode ? '계산 중…' : label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Directions (F2): route between two chosen spots. */}
        <DirectionsPanel
          spots={spots}
          // Draw the computed route's real road polyline on the map (REQ-F2-001).
          // result.path is the decoded Kakao road geometry (or [from,to] on the
          // straight-line fallback); MapView renders it as a distinct route line.
          onRoute={(result) => setRoutePath(result.path)}
          // Shared travel mode (Feature): the toggle here and the "내기준정렬"
          // button read/write the same selected mode.
          mode={travelMode}
          onModeChange={setTravelMode}
        />
      </section>

      {/* GPS auto-stamp control + progress (F1 / NFR-GEO). */}
      <section className="stamp-panel" aria-label="스탬프">
        <h2>스탬프</h2>
        <StampTracker
          tracking={geo.tracking}
          accuracyWarning={geo.accuracyWarning}
          permissionDenied={geo.permissionDenied}
          error={geo.error}
          purpose={geo.purpose}
          onStart={geo.start}
          onPause={geo.pause}
        />
        <StampProgress
          spots={spots}
          stampBySpot={stampBySpot}
          currentUserId={user?.id}
          isOwner={isOwner}
          onCancel={handleCancelStamp}
        />
        {/* Manual check-in fallback when auto-stamp is unavailable
            (REQ-F1-007 / AC-F1-04). Requires a DIFFERENT member to confirm. */}
        <ManualCheckIn
          available={geo.permissionDenied || geo.accuracyWarning}
          spots={spots}
          stampedSpotIds={stampedSpotIds}
          pendingRequests={pendingRequests}
          currentUserId={user?.id}
          onRequest={handleRequestCheckIn}
          onConfirm={handleConfirmCheckIn}
          onCancelRequest={handleCancelCheckIn}
        />
      </section>

      {isOwner && (
        <section className="danger-zone">
          <button type="button" className="danger" onClick={handleDeleteTour}>
            투어 삭제
          </button>
        </section>
      )}

      {/* Non-destructive conflict notices (NFR-CONFLICT-003 / AC-NFR-CONFLICT-02). */}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
