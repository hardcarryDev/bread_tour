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
import SpotList from '../features/map/SpotList';
import SpotForm, { type SpotFormValues } from '../features/map/SpotForm';
import {
  addSpot,
  deleteSpot,
  reorderSpots,
  updateSpot,
} from '../features/map/api';
import { addSpotMenu } from '../features/menu/api';
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
import type { LatLng } from '../features/directions/route';
import {
  spotConflictValue,
  useRealtimeTour,
} from '../features/collab/useRealtimeTour';
import ConnectedMembers from '../features/collab/ConnectedMembers';
import OfflineIndicator from '../features/collab/OfflineIndicator';
import ToastHost from '../features/collab/ToastHost';
import { useProfiles } from '../features/profile/useProfiles';
import { displayNameFor } from '../features/profile/api';
import AppNav from '../features/profile/AppNav';
import type { Spot } from '../types/database';
import { errorMessage } from '../lib/errors';

// Lazy-load the Kakao map so its SDK + render code stays out of the initial
// bundle (Slice A noted a 456KB baseline). The spot list works without it.
const MapView = lazy(() => import('../features/map/MapView'));

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
  const [showSpotForm, setShowSpotForm] = useState(false);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  // Real road route to overlay on the map (REQ-F2-001). Set from DirectionsPanel's
  // onRoute callback so the actual Kakao road polyline is drawn, not just the
  // straight spot-order connector. undefined => no route currently shown.
  const [routePath, setRoutePath] = useState<LatLng[] | undefined>(undefined);

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

  async function handleDeleteSpot(spotId: string) {
    setActionError(null);
    try {
      await deleteSpot(spotId);
      reloadSpots();
    } catch (err) {
      setActionError(errorMessage(err));
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
        {/* Live presence (REQ-F5-003) + offline state (REQ-F5-005). */}
        <ConnectedMembers members={connectedMembers} />
      </div>

      <OfflineIndicator online={online} />

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      <section className="members">
        <div className="section-head">
          <h2>멤버</h2>
          {isOwner && (
            <button type="button" onClick={handleInvite}>
              멤버 초대
            </button>
          )}
        </div>

        {inviteLink && (
          <p className="invite-link" data-testid="invite-link">
            초대 링크: <code>{inviteLink}</code>
          </p>
        )}

        <ul className="member-list" data-testid="member-list">
          {members.map((m) => (
            <li key={m.id}>
              {/* Show the member's display name, not the raw UUID (Feature 1). */}
              <span>{displayNameFor(m.user_id, profileNames)}</span>
              <span className="muted"> ({m.role})</span>
              {/* Owner may remove non-owner members only (AC-F6-04/06). */}
              {isOwner && m.role !== 'owner' && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleRemoveMember(m.id)}
                >
                  멤버 내보내기
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Slice B: spots list + Kakao map + add/edit/reorder. Stamps (Slice C)
          and realtime (Slice D) plug into MapView / useSpots via props. */}
      <section
        className="spots-panel"
        data-testid="spots-panel"
        aria-label="장소 목록"
      >
        <div className="section-head">
          <h2>장소</h2>
          {/* Any member may add a spot (REQ-F6-005). */}
          <button
            type="button"
            onClick={() => {
              setEditingSpot(null);
              setShowSpotForm((v) => !v);
            }}
          >
            장소 추가
          </button>
        </div>

        {showSpotForm && (
          <SpotForm
            onSubmit={handleAddSpot}
            onCancel={() => setShowSpotForm(false)}
          />
        )}

        {editingSpot && (
          <SpotForm
            initial={{
              name: editingSpot.name,
              lat: editingSpot.lat,
              lng: editingSpot.lng,
              kind: editingSpot.kind,
            }}
            onSubmit={handleEditSpot}
            onCancel={() => setEditingSpot(null)}
          />
        )}

        {spotsLoading ? (
          <p className="muted" role="status">
            장소 불러오는 중...
          </p>
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
          />
        )}

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
            // Live "내 위치" marker while GPS tracking is active. This is the
            // same in-memory fix used for directions (NFR-GEO-006: never
            // persisted); it appears while tracking and clears to null on stop.
            currentLocation={geo.currentPosition}
          />
        </Suspense>

        {/* Directions (F2): route between spots / guide to next unvisited. */}
        <DirectionsPanel
          spots={spots}
          stampedSpotIds={stampedSpotIds}
          // In-memory GPS position from the active watch (NFR-GEO-006: never
          // persisted) so "다음 장소로 안내" can route from the user's current
          // location once a fix is available (REQ-F2-003 / AC-F2-02).
          currentLocation={geo.currentPosition}
          // Draw the computed route's real road polyline on the map (REQ-F2-001).
          // result.path is the decoded Kakao road geometry (or [from,to] on the
          // straight-line fallback); MapView renders it as a distinct route line.
          onRoute={(result) => setRoutePath(result.path)}
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
