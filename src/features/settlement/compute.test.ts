import { describe, expect, it } from 'vitest';
import {
  spotNetByUser,
  suggestedTransfers,
  tourNetByUser,
  type SettlementInput,
} from './compute';

describe('spotNetByUser (per-spot net = paid − share)', () => {
  it('single payer, all participants: payer receives the others share, each other pays their share', () => {
    // 12,000 split 3 ways = 4,000 each. u1 paid the whole 12,000.
    // u1: 12000 − 4000 = +8000; u2: 0 − 4000 = −4000; u3: −4000.
    const s: SettlementInput = {
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3'],
    };
    expect(spotNetByUser(s)).toEqual({ u1: 8000, u2: -4000, u3: -4000 });
  });

  it('two participants, single payer: payer +half, other −half', () => {
    const s: SettlementInput = {
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
    };
    expect(spotNetByUser(s)).toEqual({ u1: 6000, u2: -6000 });
  });

  it('multiple payers split the total equally among themselves', () => {
    // 10,000 paid by u1 + u2 (5,000 each), shared by u1,u2,u3,u4 (2,500 each).
    // u1: 5000 − 2500 = +2500; u2: +2500; u3: −2500; u4: −2500.
    const s: SettlementInput = {
      amount: 10000,
      payerIds: ['u1', 'u2'],
      participantIds: ['u1', 'u2', 'u3', 'u4'],
    };
    expect(spotNetByUser(s)).toEqual({
      u1: 2500,
      u2: 2500,
      u3: -2500,
      u4: -2500,
    });
  });

  it('payer who is NOT a participant nets the full amount they paid', () => {
    // u1 paid 9,000 but did not share; u2,u3,u4 share 3,000 each.
    // u1: 9000 − 0 = +9000; u2/u3/u4: −3000 each.
    const s: SettlementInput = {
      amount: 9000,
      payerIds: ['u1'],
      participantIds: ['u2', 'u3', 'u4'],
    };
    expect(spotNetByUser(s)).toEqual({
      u1: 9000,
      u2: -3000,
      u3: -3000,
      u4: -3000,
    });
  });

  it('participant who is NOT a payer nets a negative share', () => {
    // u1 paid 8,000 and shares; u2 only shares. 4,000 each.
    // u1: 8000 − 4000 = +4000; u2: 0 − 4000 = −4000.
    const s: SettlementInput = {
      amount: 8000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
    };
    expect(spotNetByUser(s)).toEqual({ u1: 4000, u2: -4000 });
  });

  it('empty participant/payer arrays do not divide by zero (all zero / absent)', () => {
    expect(spotNetByUser({ amount: 5000, payerIds: [], participantIds: [] })).toEqual(
      {},
    );
    // Payer with no participants: paidPer applies, sharePer is 0.
    expect(
      spotNetByUser({ amount: 5000, payerIds: ['u1'], participantIds: [] }),
    ).toEqual({ u1: 5000 });
    // Participants with no payer: everyone owes their share, no one is paid.
    expect(
      spotNetByUser({ amount: 6000, payerIds: [], participantIds: ['u1', 'u2'] }),
    ).toEqual({ u1: -3000, u2: -3000 });
  });

  it('rounds each net to whole won (no decimals leak through)', () => {
    // 10,000 / 3 = 3333.33 share. u1 paid all.
    // u1: 10000 − 3333.33 = 6666.67 -> 6667; u2/u3: −3333.33 -> −3333.
    const s: SettlementInput = {
      amount: 10000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3'],
    };
    expect(spotNetByUser(s)).toEqual({ u1: 6667, u2: -3333, u3: -3333 });
  });
});

describe('tourNetByUser (sum nets across spots)', () => {
  it('sums each user net across two settlements', () => {
    // Spot 1: u1 +8000, u2 −4000, u3 −4000.
    // Spot 2: u2 paid 6000, shared by u2,u3 (3000 each) -> u2 +3000, u3 −3000.
    // Totals: u1 +8000, u2 −1000, u3 −7000.
    const settlements: SettlementInput[] = [
      { amount: 12000, payerIds: ['u1'], participantIds: ['u1', 'u2', 'u3'] },
      { amount: 6000, payerIds: ['u2'], participantIds: ['u2', 'u3'] },
    ];
    expect(tourNetByUser(settlements)).toEqual({
      u1: 8000,
      u2: -1000,
      u3: -7000,
    });
  });

  it('returns an empty map for no settlements', () => {
    expect(tourNetByUser([])).toEqual({});
  });
});

describe('suggestedTransfers (greedy settle-up)', () => {
  it('one creditor, two debtors: A receives from B and C', () => {
    // A +10000, B −6000, C −4000. Deterministic (sorted by id): B pays first.
    const transfers = suggestedTransfers({ A: 10000, B: -6000, C: -4000 });
    expect(transfers).toEqual([
      { fromUserId: 'B', toUserId: 'A', amount: 6000 },
      { fromUserId: 'C', toUserId: 'A', amount: 4000 },
    ]);
  });

  it('splits a debtor across two creditors when one creditor fills up', () => {
    // A +6000, B +4000 owed; C owes −10000. C pays A 6000 then B 4000.
    const transfers = suggestedTransfers({ A: 6000, B: 4000, C: -10000 });
    expect(transfers).toEqual([
      { fromUserId: 'C', toUserId: 'A', amount: 6000 },
      { fromUserId: 'C', toUserId: 'B', amount: 4000 },
    ]);
  });

  it('skips users whose net is zero and returns [] when everyone is settled', () => {
    expect(suggestedTransfers({ A: 0, B: 0 })).toEqual([]);
    const transfers = suggestedTransfers({ A: 5000, B: -5000, C: 0 });
    expect(transfers).toEqual([{ fromUserId: 'B', toUserId: 'A', amount: 5000 }]);
  });

  it('is deterministic regardless of input key order (sorted by user id)', () => {
    const a = suggestedTransfers({ C: -4000, A: 10000, B: -6000 });
    const b = suggestedTransfers({ A: 10000, B: -6000, C: -4000 });
    expect(a).toEqual(b);
  });
});
