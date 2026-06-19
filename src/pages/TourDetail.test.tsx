import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// --- Mocks --------------------------------------------------------------
const getTour = vi.fn();
const listMembers = vi.fn();
const getMyRole = vi.fn();
const deleteTour = vi.fn();
const removeMember = vi.fn();
const createInvite = vi.fn();

vi.mock('../features/tour/api', () => ({
  getTour: (...a: unknown[]) => getTour(...a),
  listMembers: (...a: unknown[]) => listMembers(...a),
  getMyRole: (...a: unknown[]) => getMyRole(...a),
  deleteTour: (...a: unknown[]) => deleteTour(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
  createInvite: (...a: unknown[]) => createInvite(...a),
  inviteLinkFor: (token: string) => `https://app.test/invite/${token}`,
}));

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// --- Slice B mocks (spots / map / menu) ----------------------------------
const addSpot = vi.fn();
const updateSpot = vi.fn();
const deleteSpot = vi.fn();
const reorderSpots = vi.fn();
const addSpotMenu = vi.fn();

vi.mock('../features/map/api', () => ({
  addSpot: (...a: unknown[]) => addSpot(...a),
  updateSpot: (...a: unknown[]) => updateSpot(...a),
  deleteSpot: (...a: unknown[]) => deleteSpot(...a),
  reorderSpots: (...a: unknown[]) => reorderSpots(...a),
}));

vi.mock('../features/menu/api', () => ({
  addSpotMenu: (...a: unknown[]) => addSpotMenu(...a),
}));

// SpotForm now opens the interactive LocationPicker (Kakao map) to choose a
// coordinate. The picker's own behaviour is unit-tested in LocationPicker.test;
// here we stub it so these add-spot wiring tests can pick a real coordinate
// without loading the Kakao SDK. The stub confirms a fixed Daejeon coordinate.
vi.mock('../features/map/LocationPicker', () => ({
  default: ({
    onConfirm,
  }: {
    onConfirm: (loc: { lat: number; lng: number; name?: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="picker-confirm"
      onClick={() => onConfirm({ lat: 36.3275, lng: 127.4276 })}
    >
      이 위치로 선택
    </button>
  ),
}));

const useSpots = vi.fn();
vi.mock('../features/map/useSpots', () => ({
  useSpots: (...a: unknown[]) => useSpots(...a),
}));

// --- Slice C mocks (stamp / directions) ----------------------------------
// TourDetail now wires GPS auto-stamp + progress + directions. These are unit-
// tested in their own suites; here we stub them so the lifecycle/spot tests
// stay deterministic (no geolocation, no live stamp/route calls).
const useStamps = vi.fn();
vi.mock('../features/stamp/useStamps', () => ({
  useStamps: (...a: unknown[]) => useStamps(...a),
}));

const useGeoStamp = vi.fn();
vi.mock('../features/stamp/useGeoStamp', () => ({
  useGeoStamp: (...a: unknown[]) => useGeoStamp(...a),
}));

const cancelStamp = vi.fn();
const createStamp = vi.fn();
const requestManualCheckIn = vi.fn();
const confirmManualCheckIn = vi.fn();
const cancelManualCheckIn = vi.fn();
vi.mock('../features/stamp/api', () => ({
  cancelStamp: (...a: unknown[]) => cancelStamp(...a),
  createStamp: (...a: unknown[]) => createStamp(...a),
  requestManualCheckIn: (...a: unknown[]) => requestManualCheckIn(...a),
  confirmManualCheckIn: (...a: unknown[]) => confirmManualCheckIn(...a),
  cancelManualCheckIn: (...a: unknown[]) => cancelManualCheckIn(...a),
}));

const usePendingCheckIns = vi.fn();
vi.mock('../features/stamp/usePendingCheckIns', () => ({
  usePendingCheckIns: (...a: unknown[]) => usePendingCheckIns(...a),
}));

vi.mock('../features/stamp/StampTracker', () => ({
  default: () => <div data-testid="stamp-tracker" />,
}));
vi.mock('../features/stamp/StampProgress', () => ({
  default: ({ spots }: { spots: { id: string }[] }) => (
    <div data-testid="stamp-progress">stamps:{spots.length}</div>
  ),
}));
vi.mock('../features/stamp/ManualCheckIn', () => ({
  default: ({ available }: { available: boolean }) => (
    <div data-testid="manual-checkin">manual:{String(available)}</div>
  ),
}));
vi.mock('../features/directions/DirectionsPanel', () => ({
  // Echo the currentLocation prop so a test can assert TourDetail wires the
  // in-memory GPS position through to directions (C-01 / REQ-F2-003). Expose a
  // button that emits a route via onRoute so a test can verify the resulting
  // path flows through to the map (real road polyline rendering).
  default: ({
    currentLocation,
    onRoute,
  }: {
    currentLocation: unknown;
    onRoute: (route: { path: { lat: number; lng: number }[] }) => void;
  }) => (
    <div data-testid="directions-panel">
      loc:{currentLocation ? JSON.stringify(currentLocation) : 'null'}
      <button
        type="button"
        data-testid="emit-route"
        onClick={() =>
          onRoute({
            path: [
              { lat: 37.5, lng: 127.0 },
              { lat: 37.52, lng: 126.97 },
              { lat: 37.56, lng: 126.9 },
            ],
          })
        }
      >
        emit
      </button>
    </div>
  ),
}));

// Stub the heavy Kakao MapView so TourDetail tests do not need the SDK. Echo the
// routePath prop length so a test can assert the route's full multi-point path
// reaches the map for drawing.
vi.mock('../features/map/MapView', () => ({
  default: ({
    spots,
    routePath,
  }: {
    spots: { id: string }[];
    routePath?: { lat: number; lng: number }[];
  }) => (
    <div data-testid="map-view">
      map:{spots.length} route:{routePath ? routePath.length : 'none'}
    </div>
  ),
}));

// --- Slice D mock (realtime collaboration) -------------------------------
// useRealtimeTour owns its own unit suite; here we stub it so TourDetail tests
// stay deterministic (no live channel) and assert the wiring (presence/offline/
// toast rendering + that the hook is fed the tour + reloads).
const useRealtimeTour = vi.fn();
vi.mock('../features/collab/useRealtimeTour', () => ({
  useRealtimeTour: (...a: unknown[]) => useRealtimeTour(...a),
}));

// Feature 1: resolve member/presence user ids to display names. Stubbed here so
// the member list can assert names render instead of UUIDs without a real query.
const useProfiles = vi.fn();
vi.mock('../features/profile/useProfiles', () => ({
  useProfiles: (...a: unknown[]) => useProfiles(...a),
}));

import TourDetail from './TourDetail';

const sampleSpots = [
  {
    id: 's1',
    tour_id: 't1',
    name: '성수 베이커리',
    kind: 'bakery',
    lat: 37.5,
    lng: 127,
    radius_m: 50,
    order_index: 1,
    created_at: 'x',
    updated_at: 'x',
  },
  {
    id: 's2',
    tour_id: 't1',
    name: '연남 식당',
    kind: 'restaurant',
    lat: 37.56,
    lng: 126.9,
    radius_m: 50,
    order_index: 2,
    created_at: 'x',
    updated_at: 'x',
  },
];

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/tours/t1']}>
      <Routes>
        <Route path="/tours/:tourId" element={<TourDetail />} />
        <Route path="/tours" element={<div>Tour List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTour.mockResolvedValue({
    id: 't1',
    name: 'Seoul Bakeries',
    owner_id: 'u1',
  });
  listMembers.mockResolvedValue([
    { id: 'm1', tour_id: 't1', user_id: 'u1', role: 'owner' },
    { id: 'm2', tour_id: 't1', user_id: 'u2', role: 'member' },
  ]);
  useSpots.mockReturnValue({
    spots: sampleSpots,
    menusBySpot: {
      s1: [
        {
          id: 'mn1',
          spot_id: 's1',
          author_id: 'u1',
          menu_text: '소금빵',
          author: { display_name: 'Alice' },
        },
      ],
    },
    loading: false,
    error: null,
    reload: vi.fn(),
  });
  useStamps.mockReturnValue({
    stampBySpot: {},
    stampedSpotIds: new Set<string>(),
    loading: false,
    error: null,
    reload: vi.fn(),
  });
  usePendingCheckIns.mockReturnValue({
    pendingRequests: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  });
  useGeoStamp.mockReturnValue({
    tracking: false,
    accuracyWarning: false,
    permissionDenied: false,
    error: null,
    purpose: '도착 시 자동으로 스탬프를 적립하기 위해 위치 정보를 사용합니다.',
    currentPosition: null,
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  });
  useRealtimeTour.mockReturnValue({
    connectedMembers: [],
    online: true,
    toasts: [],
    dismissToast: vi.fn(),
    notePendingEdit: vi.fn(),
  });
  useProfiles.mockReturnValue({ u1: '빵돌이', u2: '빵순이' });
});

describe('TourDetail permission UI (REQ-F6-004/005/006 / AC-F6-04..06)', () => {
  it('shows owner-only actions when the current user is the owner', async () => {
    getMyRole.mockResolvedValue('owner');
    renderDetail();

    expect(await screen.findByText('Seoul Bakeries')).toBeInTheDocument();
    // Owner sees delete-tour and member-remove controls.
    expect(
      screen.getByRole('button', { name: '투어 삭제' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '멤버 초대' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: '멤버 내보내기' }).length,
    ).toBeGreaterThan(0);
  });

  it('hides owner-only actions from a regular member (AC-F6-06)', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();

    expect(await screen.findByText('Seoul Bakeries')).toBeInTheDocument();
    // Member must NOT see delete-tour or remove-member controls.
    expect(
      screen.queryByRole('button', { name: '투어 삭제' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '멤버 내보내기' }),
    ).not.toBeInTheDocument();
  });

  it('renders the spots section (Slice B replaces the placeholder)', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    // Slice B: the placeholder is gone, replaced by the real spots panel + map.
    expect(await screen.findByTestId('spots-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('spots-placeholder')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
  });

  it('owner can delete the tour and is navigated back to the list (AC-F6-04)', async () => {
    getMyRole.mockResolvedValue('owner');
    deleteTour.mockResolvedValue(undefined);
    renderDetail();
    await screen.findByText('Seoul Bakeries');
    await userEvent.click(
      screen.getByRole('button', { name: '투어 삭제' }),
    );
    await waitFor(() => expect(deleteTour).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('Tour List')).toBeInTheDocument();
  });

  it('owner can remove a member, then the list reloads (AC-F6-04)', async () => {
    getMyRole.mockResolvedValue('owner');
    removeMember.mockResolvedValue(undefined);
    renderDetail();
    await screen.findByText('Seoul Bakeries');
    await userEvent.click(
      screen.getByRole('button', { name: '멤버 내보내기' }),
    );
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('m2'));
    // listMembers called once on load + once on reload.
    await waitFor(() => expect(listMembers).toHaveBeenCalledTimes(2));
  });

  it('owner can create an invite and sees the shareable link (AC-F6-02)', async () => {
    getMyRole.mockResolvedValue('owner');
    createInvite.mockResolvedValue({ token: 'xyz789' });
    renderDetail();
    await screen.findByText('Seoul Bakeries');
    await userEvent.click(
      screen.getByRole('button', { name: '멤버 초대' }),
    );
    await waitFor(() =>
      expect(createInvite).toHaveBeenCalledWith({
        tourId: 't1',
        invitedBy: 'u1',
      }),
    );
    expect(await screen.findByTestId('invite-link')).toHaveTextContent(
      'https://app.test/invite/xyz789',
    );
  });

  it('shows member display names instead of raw UUIDs (Feature 1)', async () => {
    getMyRole.mockResolvedValue('owner');
    renderDetail();
    await screen.findByText('Seoul Bakeries');
    // Names resolved via useProfiles, not the user_id UUID. Scope to the member
    // list: the app nav also renders the current user's name (빵돌이).
    const memberList = within(screen.getByTestId('member-list'));
    expect(memberList.getByText('빵돌이')).toBeInTheDocument();
    expect(memberList.getByText('빵순이')).toBeInTheDocument();
    expect(screen.queryByText('u1')).not.toBeInTheDocument();
    expect(screen.queryByText('u2')).not.toBeInTheDocument();
    // Roles remain annotated.
    expect(screen.getByText(/owner/)).toBeInTheDocument();
  });

  it('falls back to a placeholder when a member has no display name (Feature 1)', async () => {
    getMyRole.mockResolvedValue('member');
    // u2 has no profile name.
    useProfiles.mockReturnValue({ u1: '빵돌이', u2: null });
    renderDetail();
    await screen.findByText('Seoul Bakeries');
    // Scope to the member list (the app nav also shows the current user's name).
    const memberList = within(screen.getByTestId('member-list'));
    expect(memberList.getByText('빵돌이')).toBeInTheDocument();
    expect(memberList.getByText('(이름 없음)')).toBeInTheDocument();
  });

  it('feeds member display names into useRealtimeTour for presence labels (Feature 1)', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    const arg = useRealtimeTour.mock.calls.at(-1)?.[0];
    // The presence label map must include member names, not just menu authors.
    expect(arg.profilesByUserId.u1).toBe('빵돌이');
    expect(arg.profilesByUserId.u2).toBe('빵순이');
  });

  it('shows access-denied guidance when the tour is hidden by RLS (AC-F5-01)', async () => {
    getMyRole.mockResolvedValue(null);
    getTour.mockResolvedValue(null);
    listMembers.mockResolvedValue([]);
    renderDetail();
    expect(
      await screen.findByText(/볼 권한이 없습니다/),
    ).toBeInTheDocument();
  });
});

describe('TourDetail Slice B spot management (REQ-F1-001, F3, F4, F5-007)', () => {
  it('lists the tour spots with visit-order numbers (AC-F1-07 / AC-F3-01)', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    const items = screen.getAllByRole('listitem');
    // member list (2) + spots (2). Filter to spot rows by content.
    expect(screen.getByText('성수 베이커리')).toBeInTheDocument();
    expect(screen.getByText('연남 식당')).toBeInTheDocument();
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('a member can add a spot with coordinates + menu (AC-F1-06 / AC-F4-01)', async () => {
    getMyRole.mockResolvedValue('member');
    addSpot.mockResolvedValue({ id: 's3' });
    addSpotMenu.mockResolvedValue({ id: 'mn2' });
    renderDetail();
    await screen.findByTestId('spots-panel');

    await userEvent.click(screen.getByRole('button', { name: /장소 추가/ }));
    await userEvent.type(screen.getByLabelText(/이름/), '망원 빵집');
    // Open the interactive picker and confirm a chosen coordinate (A8).
    await userEvent.click(screen.getByTestId('pin-here'));
    await userEvent.click(screen.getByTestId('picker-confirm'));
    await userEvent.type(screen.getByLabelText(/추천 메뉴/), '단팥빵');
    await userEvent.click(screen.getByRole('button', { name: /저장/ }));

    await waitFor(() => expect(addSpot).toHaveBeenCalledTimes(1));
    const arg = addSpot.mock.calls[0][0];
    expect(arg.tourId).toBe('t1');
    expect(arg.name).toBe('망원 빵집');
    expect(arg.existingCount).toBe(2);
    // The coordinate comes from the picker, not a hardcoded Seoul pin.
    expect(arg.lat).toBe(36.3275);
    expect(arg.lng).toBe(127.4276);
    // The non-empty menu is persisted for the new spot.
    await waitFor(() => expect(addSpotMenu).toHaveBeenCalledTimes(1));
    expect(addSpotMenu.mock.calls[0][0].menuText).toBe('단팥빵');
  });

  it('does not call addSpotMenu when the menu is left empty (AC-F4-03)', async () => {
    getMyRole.mockResolvedValue('member');
    addSpot.mockResolvedValue({ id: 's3' });
    renderDetail();
    await screen.findByTestId('spots-panel');
    await userEvent.click(screen.getByRole('button', { name: /장소 추가/ }));
    await userEvent.type(screen.getByLabelText(/이름/), '빵집');
    await userEvent.click(screen.getByTestId('pin-here'));
    await userEvent.click(screen.getByTestId('picker-confirm'));
    await userEvent.click(screen.getByRole('button', { name: /저장/ }));
    await waitFor(() => expect(addSpot).toHaveBeenCalledTimes(1));
    expect(addSpotMenu).not.toHaveBeenCalled();
  });

  it('reorder via the spot list calls reorder_spots RPC (AC-F5-06)', async () => {
    getMyRole.mockResolvedValue('member');
    reorderSpots.mockResolvedValue(undefined);
    renderDetail();
    await screen.findByTestId('spots-panel');
    await userEvent.click(screen.getByRole('button', { name: /아래로.*성수/ }));
    await waitFor(() =>
      expect(reorderSpots).toHaveBeenCalledWith('t1', ['s2', 's1']),
    );
  });

  it('owner can delete a spot; member cannot see delete controls (AC-F6-07 / AC-F6-06)', async () => {
    getMyRole.mockResolvedValue('owner');
    deleteSpot.mockResolvedValue(undefined);
    renderDetail();
    await screen.findByTestId('spots-panel');
    const delButtons = screen.getAllByRole('button', { name: /장소 삭제/ });
    await userEvent.click(delButtons[0]);
    await waitFor(() => expect(deleteSpot).toHaveBeenCalledWith('s1'));
  });

  it('hides the spot delete control from a regular member (AC-F6-06)', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(
      screen.queryByRole('button', { name: /장소 삭제/ }),
    ).not.toBeInTheDocument();
  });
});

describe('TourDetail Slice D realtime collaboration (REQ-F5-002/003/004/005)', () => {
  it('subscribes useRealtimeTour to the current tour with reload callbacks', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(useRealtimeTour).toHaveBeenCalled();
    const arg = useRealtimeTour.mock.calls.at(-1)?.[0];
    expect(arg.tourId).toBe('t1');
    expect(arg.currentUserId).toBe('u1');
    expect(typeof arg.reloadSpots).toBe('function');
    expect(typeof arg.reloadStamps).toBe('function');
    expect(typeof arg.reloadMembers).toBe('function');
  });

  it('renders the connected-members indicator from presence (AC-F5-03)', async () => {
    getMyRole.mockResolvedValue('member');
    useRealtimeTour.mockReturnValue({
      connectedMembers: [
        { user_id: 'u1', display_name: 'Alice' },
        { user_id: 'u2', display_name: 'Bob' },
      ],
      online: true,
      toasts: [],
      dismissToast: vi.fn(),
      notePendingEdit: vi.fn(),
    });
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(screen.getByLabelText('접속 중인 멤버')).toBeInTheDocument();
    expect(screen.getByTestId('connected-count')).toHaveTextContent('2');
  });

  it('shows the offline indicator when the channel is disconnected (AC-F5-05)', async () => {
    getMyRole.mockResolvedValue('member');
    useRealtimeTour.mockReturnValue({
      connectedMembers: [],
      online: false,
      toasts: [],
      dismissToast: vi.fn(),
      notePendingEdit: vi.fn(),
    });
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(screen.getByText(/오프라인/)).toBeInTheDocument();
  });

  it('renders conflict toasts non-destructively (AC-NFR-CONFLICT-02)', async () => {
    getMyRole.mockResolvedValue('member');
    useRealtimeTour.mockReturnValue({
      connectedMembers: [],
      online: true,
      toasts: [{ id: 'c1', message: '다른 멤버의 변경으로 갱신되었습니다.' }],
      dismissToast: vi.fn(),
      notePendingEdit: vi.fn(),
    });
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(
      screen.getByText('다른 멤버의 변경으로 갱신되었습니다.'),
    ).toBeInTheDocument();
  });

  it('feeds reloadPendingCheckIns into useRealtimeTour so requests reflect live (REQ-F1-007)', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    const arg = useRealtimeTour.mock.calls.at(-1)?.[0];
    expect(typeof arg.reloadPendingCheckIns).toBe('function');
  });
});

describe('TourDetail manual check-in fallback (REQ-F1-007 / AC-F1-04)', () => {
  it('marks the manual fallback available when auto-stamp is blocked (GPS denied)', async () => {
    getMyRole.mockResolvedValue('member');
    // Auto-stamp unavailable -> permission denied.
    useGeoStamp.mockReturnValue({
      tracking: false,
      accuracyWarning: false,
      permissionDenied: true,
      error: null,
      purpose: '도착 시 자동으로 스탬프를 적립하기 위해 위치 정보를 사용합니다.',
      currentPosition: null,
      start: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
    });
    renderDetail();
    await screen.findByTestId('spots-panel');
    // The stubbed ManualCheckIn echoes its `available` prop.
    expect(screen.getByTestId('manual-checkin')).toHaveTextContent('manual:true');
  });

  it('keeps the manual fallback unavailable while auto-stamp works normally', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(screen.getByTestId('manual-checkin')).toHaveTextContent('manual:false');
  });
});

describe('TourDetail directions wiring (C-01 / REQ-F2-003)', () => {
  it('passes the in-memory GPS position to DirectionsPanel as currentLocation', async () => {
    getMyRole.mockResolvedValue('member');
    // The GPS hook reports an in-memory position (never persisted). TourDetail
    // must forward it to DirectionsPanel so "다음 장소로 안내" is not permanently
    // disabled (the C-01 defect was a hard-coded currentLocation={null}).
    useGeoStamp.mockReturnValue({
      tracking: true,
      accuracyWarning: false,
      permissionDenied: false,
      error: null,
      purpose: '도착 시 자동으로 스탬프를 적립하기 위해 위치 정보를 사용합니다.',
      currentPosition: { lat: 37.49, lng: 127.01 },
      start: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
    });
    renderDetail();
    await screen.findByTestId('spots-panel');
    expect(screen.getByTestId('directions-panel')).toHaveTextContent(
      'loc:{"lat":37.49,"lng":127.01}',
    );
  });

  it('forwards the computed route path to MapView so the real road line is drawn', async () => {
    getMyRole.mockResolvedValue('member');
    renderDetail();
    await screen.findByTestId('spots-panel');
    // Before a route is requested, the map has no route overlay.
    expect(screen.getByTestId('map-view')).toHaveTextContent('route:none');

    // DirectionsPanel emits a 3-point route via onRoute; TourDetail must pass
    // that full path down to MapView as routePath (not just the 2 endpoints).
    await userEvent.click(screen.getByTestId('emit-route'));
    expect(screen.getByTestId('map-view')).toHaveTextContent('route:3');
  });
});
