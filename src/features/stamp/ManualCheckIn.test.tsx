import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ManualCheckInRequest, Spot } from '../../types/database';
import ManualCheckIn from './ManualCheckIn';

function spot(p: Partial<Spot> & Pick<Spot, 'id' | 'order_index'>): Spot {
  return {
    tour_id: 't1',
    name: p.id,
    kind: 'bakery',
    lat: 37.5,
    lng: 127.0,
    radius_m: 50,
    created_at: 'x',
    updated_at: 'x',
    ...p,
  } as Spot;
}

function request(
  p: Partial<ManualCheckInRequest> & Pick<ManualCheckInRequest, 'id'>,
): ManualCheckInRequest {
  return {
    spot_id: 's1',
    tour_id: 't1',
    requester_id: 'u2',
    status: 'pending',
    confirmed_by: null,
    stamp_id: null,
    created_at: 'x',
    updated_at: 'x',
    ...p,
  } as ManualCheckInRequest;
}

const spots: Spot[] = [
  spot({ id: 's1', name: '성수 베이커리', order_index: 1 }),
  spot({ id: 's2', name: '연남 식당', order_index: 2 }),
];

function baseProps() {
  return {
    available: true,
    spots,
    stampedSpotIds: new Set<string>(),
    pendingRequests: [] as ManualCheckInRequest[],
    currentUserId: 'u1',
    onRequest: vi.fn(),
    onConfirm: vi.fn(),
    onCancelRequest: vi.fn(),
  };
}

describe('ManualCheckIn availability (REQ-F1-007 / NFR-GEO-002)', () => {
  it('shows the fallback only when auto-stamp is unavailable', () => {
    const { rerender } = render(
      <ManualCheckIn {...baseProps()} available={false} />,
    );
    // When auto-stamp IS available there is no manual fallback offered.
    expect(
      screen.queryByRole('button', { name: /수동 체크인 요청/ }),
    ).not.toBeInTheDocument();

    rerender(<ManualCheckIn {...baseProps()} available={true} />);
    // When unavailable, members can request manual check-in for unstamped spots.
    expect(
      screen.getAllByRole('button', { name: /수동 체크인 요청/ }).length,
    ).toBeGreaterThan(0);
  });

  it('does not offer a request for already-stamped spots', () => {
    render(
      <ManualCheckIn
        {...baseProps()}
        stampedSpotIds={new Set(['s1'])}
      />,
    );
    // s1 stamped -> only s2 can be requested.
    const buttons = screen.getAllByRole('button', { name: /수동 체크인 요청/ });
    expect(buttons).toHaveLength(1);
  });
});

describe('ManualCheckIn request action (REQ-F1-007)', () => {
  it('invokes onRequest with the spot id', async () => {
    const props = baseProps();
    render(<ManualCheckIn {...props} />);
    const buttons = screen.getAllByRole('button', { name: /수동 체크인 요청/ });
    await userEvent.click(buttons[0]);
    expect(props.onRequest).toHaveBeenCalledWith('s1');
  });
});

describe('ManualCheckIn peer confirmation (REQ-F1-007 / AC-F1-04)', () => {
  it('shows a confirm button for ANOTHER member’s pending request', () => {
    render(
      <ManualCheckIn
        {...baseProps()}
        pendingRequests={[request({ id: 'r1', requester_id: 'u2', spot_id: 's1' })]}
      />,
    );
    // u1 (current) can confirm u2's request.
    expect(
      screen.getByRole('button', { name: /확인/ }),
    ).toBeInTheDocument();
  });

  it('does NOT show a confirm button for the requester’s OWN request', () => {
    render(
      <ManualCheckIn
        {...baseProps()}
        pendingRequests={[request({ id: 'r1', requester_id: 'u1', spot_id: 's1' })]}
      />,
    );
    // u1 cannot confirm their own request (REQ-F1-007).
    expect(
      screen.queryByRole('button', { name: /확인/ }),
    ).not.toBeInTheDocument();
  });

  it('invokes onConfirm with the request id and requester id', async () => {
    const props = baseProps();
    render(
      <ManualCheckIn
        {...props}
        pendingRequests={[request({ id: 'r1', requester_id: 'u2', spot_id: 's1' })]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /확인/ }));
    expect(props.onConfirm).toHaveBeenCalledWith('r1', 'u2');
  });

  it('lets the requester withdraw their own pending request', async () => {
    const props = baseProps();
    render(
      <ManualCheckIn
        {...props}
        pendingRequests={[request({ id: 'r1', requester_id: 'u1', spot_id: 's1' })]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /요청 취소/ }));
    expect(props.onCancelRequest).toHaveBeenCalledWith('r1');
  });
});
