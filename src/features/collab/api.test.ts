import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Supabase Realtime channel that records the handlers registered via
// .on(...) and lets a test drive synthetic postgres_changes / presence /
// system events. Mirrors the subset of the supabase-js RealtimeChannel API the
// collab layer uses (on / subscribe / track / untrack / presenceState /
// unsubscribe). No live service is contacted.
function makeFakeChannel() {
  const changeHandlers: Array<{
    filter: Record<string, unknown>;
    cb: (payload: unknown) => void;
  }> = [];
  const presenceHandlers: Record<string, Array<(payload: unknown) => void>> = {};
  const systemHandlers: Array<(status: string, err?: unknown) => void> = [];
  let presence: Record<string, unknown[]> = {};

  const channel = {
    on(
      type: string,
      filterOrEvent: Record<string, unknown> | { event: string },
      cb: (payload: unknown) => void,
    ) {
      if (type === 'postgres_changes') {
        changeHandlers.push({
          filter: filterOrEvent as Record<string, unknown>,
          cb,
        });
      } else if (type === 'presence') {
        const evt = (filterOrEvent as { event: string }).event;
        (presenceHandlers[evt] ??= []).push(cb);
      }
      return channel;
    },
    subscribe(cb?: (status: string, err?: unknown) => void) {
      if (cb) systemHandlers.push(cb);
      return channel;
    },
    track: vi.fn(async () => 'ok'),
    untrack: vi.fn(async () => 'ok'),
    presenceState() {
      return presence;
    },
    unsubscribe: vi.fn(async () => 'ok'),

    // --- test drivers ---
    __emitChange(payload: unknown) {
      for (const h of changeHandlers) h.cb(payload);
    },
    __emitPresence(event: string, state: Record<string, unknown[]>) {
      presence = state;
      for (const h of presenceHandlers[event] ?? []) h({});
    },
    __emitStatus(status: string, err?: unknown) {
      for (const h of systemHandlers) h(status, err);
    },
    __changeHandlers: changeHandlers,
  };
  return channel;
}

let fakeChannel: ReturnType<typeof makeFakeChannel>;
const channelFactory = vi.fn((...args: unknown[]): unknown => {
  void args;
  return fakeChannel;
});
const removeChannel = vi.fn((...args: unknown[]): unknown => {
  void args;
  return undefined;
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: (...a: unknown[]) => channelFactory(...a),
    removeChannel: (...a: unknown[]) => removeChannel(...a),
  },
}));

import { subscribeTourRealtime } from './api';

beforeEach(() => {
  vi.clearAllMocks();
  fakeChannel = makeFakeChannel();
});

describe('subscribeTourRealtime (REQ-F5-002/003 — channel wiring)', () => {
  it('creates a tour-scoped channel and subscribes', () => {
    subscribeTourRealtime('t1', { presenceKey: 'u1' });
    expect(channelFactory).toHaveBeenCalledTimes(1);
    // Channel name should be derived from the tour id so members of the same
    // tour share one channel.
    expect(String(channelFactory.mock.calls[0][0])).toContain('t1');
  });

  it('subscribes to row changes for spots, spot_menus, stamps, tour_members, manual_checkin_requests scoped to the tour', () => {
    subscribeTourRealtime('t1', { presenceKey: 'u1' });
    const tables = fakeChannel.__changeHandlers.map(
      (h) => (h.filter as { table: string }).table,
    );
    expect(tables).toContain('spots');
    expect(tables).toContain('spot_menus');
    expect(tables).toContain('stamps');
    expect(tables).toContain('tour_members');
    // Manual check-in requests must broadcast so another member sees pending
    // requests live and can confirm them (REQ-F1-007).
    expect(tables).toContain('manual_checkin_requests');
    // Tables WITH a tour_id column are filtered to this tour (RLS already scopes,
    // but the client filter trims cross-tour noise — REQ-F5-002).
    for (const h of fakeChannel.__changeHandlers) {
      const f = h.filter as { table: string; filter?: string };
      if (f.table === 'spot_menus') {
        // spot_menus has NO tour_id column; a tour_id filter there is invalid and
        // would kill postgres_changes for the whole channel, so it MUST be unfiltered.
        expect(f.filter).toBeUndefined();
      } else {
        expect(f.filter).toContain('t1');
      }
    }
  });

  it('routes incoming spot changes to onSpotsChange', () => {
    const onSpotsChange = vi.fn();
    subscribeTourRealtime('t1', { presenceKey: 'u1', onSpotsChange });
    // Drive a synthetic postgres_changes event for the spots table.
    fakeChannel.__changeHandlers
      .filter((h) => (h.filter as { table: string }).table === 'spots')
      .forEach((h) =>
        h.cb({ table: 'spots', eventType: 'UPDATE', new: { id: 's1' } }),
      );
    expect(onSpotsChange).toHaveBeenCalledTimes(1);
  });

  it('routes stamp changes to onStampsChange and member changes to onMembersChange', () => {
    const onStampsChange = vi.fn();
    const onMembersChange = vi.fn();
    subscribeTourRealtime('t1', {
      presenceKey: 'u1',
      onStampsChange,
      onMembersChange,
    });
    fakeChannel.__changeHandlers
      .filter((h) => (h.filter as { table: string }).table === 'stamps')
      .forEach((h) => h.cb({ table: 'stamps', eventType: 'INSERT' }));
    fakeChannel.__changeHandlers
      .filter((h) => (h.filter as { table: string }).table === 'tour_members')
      .forEach((h) => h.cb({ table: 'tour_members', eventType: 'INSERT' }));
    expect(onStampsChange).toHaveBeenCalledTimes(1);
    expect(onMembersChange).toHaveBeenCalledTimes(1);
  });

  it('routes incoming manual_checkin_requests changes to onManualCheckInChange', () => {
    const onManualCheckInChange = vi.fn();
    subscribeTourRealtime('t1', { presenceKey: 'u1', onManualCheckInChange });
    fakeChannel.__changeHandlers
      .filter(
        (h) =>
          (h.filter as { table: string }).table === 'manual_checkin_requests',
      )
      .forEach((h) =>
        h.cb({
          table: 'manual_checkin_requests',
          eventType: 'INSERT',
          new: { id: 'r1', status: 'pending' },
        }),
      );
    expect(onManualCheckInChange).toHaveBeenCalledTimes(1);
  });

  it('tracks presence with the supplied key and reports presence sync', () => {
    const onPresence = vi.fn();
    subscribeTourRealtime('t1', { presenceKey: 'u1', onPresence });
    // The channel becomes joined; presence is tracked then synced.
    fakeChannel.__emitStatus('SUBSCRIBED');
    fakeChannel.__emitPresence('sync', {
      u1: [{ user_id: 'u1', display_name: 'Alice' }],
      u2: [{ user_id: 'u2', display_name: 'Bob' }],
    });
    expect(fakeChannel.track).toHaveBeenCalled();
    expect(onPresence).toHaveBeenCalled();
    // The latest presence list is derived from presenceState().
    const last = onPresence.mock.calls.at(-1)?.[0] as Array<{
      user_id: string;
    }>;
    expect(last.map((m) => m.user_id).sort()).toEqual(['u1', 'u2']);
  });

  it('reports connection status changes (offline/reconnect)', () => {
    const onStatus = vi.fn();
    subscribeTourRealtime('t1', { presenceKey: 'u1', onStatus });
    fakeChannel.__emitStatus('SUBSCRIBED');
    fakeChannel.__emitStatus('CHANNEL_ERROR');
    fakeChannel.__emitStatus('SUBSCRIBED');
    expect(onStatus).toHaveBeenNthCalledWith(1, 'SUBSCRIBED');
    expect(onStatus).toHaveBeenNthCalledWith(2, 'CHANNEL_ERROR');
    expect(onStatus).toHaveBeenNthCalledWith(3, 'SUBSCRIBED');
  });

  it('returns a cleanup that removes the channel (no leaks)', async () => {
    const cleanup = subscribeTourRealtime('t1', { presenceKey: 'u1' });
    await cleanup();
    expect(removeChannel).toHaveBeenCalledWith(fakeChannel);
  });
});
