import { describe, expect, it } from 'vitest';
import {
  spotNetByUser,
  spotOutstandingByUser,
  suggestedTransfers,
  tourNetByUser,
  tourOutstandingByUser,
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
      settledIds: [],
    };
    expect(spotNetByUser(s)).toEqual({ u1: 8000, u2: -4000, u3: -4000 });
  });

  it('two participants, single payer: payer +half, other −half', () => {
    const s: SettlementInput = {
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
      settledIds: [],
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
      settledIds: [],
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
      settledIds: [],
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
      settledIds: [],
    };
    expect(spotNetByUser(s)).toEqual({ u1: 4000, u2: -4000 });
  });

  it('empty participant/payer arrays do not divide by zero (all zero / absent)', () => {
    expect(
      spotNetByUser({
        amount: 5000,
        payerIds: [],
        participantIds: [],
        settledIds: [],
      }),
    ).toEqual({});
    // Payer with no participants: paidPer applies, sharePer is 0.
    expect(
      spotNetByUser({
        amount: 5000,
        payerIds: ['u1'],
        participantIds: [],
        settledIds: [],
      }),
    ).toEqual({ u1: 5000 });
    // Participants with no payer: everyone owes their share, no one is paid.
    expect(
      spotNetByUser({
        amount: 6000,
        payerIds: [],
        participantIds: ['u1', 'u2'],
        settledIds: [],
      }),
    ).toEqual({ u1: -3000, u2: -3000 });
  });

  it('rounds each net to whole won (no decimals leak through)', () => {
    // 10,000 / 3 = 3333.33 share. u1 paid all.
    // u1: 10000 − 3333.33 = 6666.67 -> 6667; u2/u3: −3333.33 -> −3333.
    const s: SettlementInput = {
      amount: 10000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3'],
      settledIds: [],
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
      {
        amount: 12000,
        payerIds: ['u1'],
        participantIds: ['u1', 'u2', 'u3'],
        settledIds: [],
      },
      {
        amount: 6000,
        payerIds: ['u2'],
        participantIds: ['u2', 'u3'],
        settledIds: [],
      },
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

describe('spotOutstandingByUser (settled owers cleared, payer reduced)', () => {
  it('with no settled ids, outstanding equals gross net', () => {
    const s: SettlementInput = {
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3'],
      settledIds: [],
    };
    expect(spotOutstandingByUser(s)).toEqual(spotNetByUser(s));
    expect(spotOutstandingByUser(s)).toEqual({ u1: 8000, u2: -4000, u3: -4000 });
  });

  it('one ower settled: that ower becomes 0, payer receivable drops by the share', () => {
    // 20,000 by u1, 5 participants -> 4,000 share each. Gross: u1 +16000, others −4000.
    // u5 settled -> u5: 0; payer: 16000 − 4000 = 12000; u2/u3/u4 still −4000.
    const s: SettlementInput = {
      amount: 20000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
      settledIds: ['u5'],
    };
    expect(spotOutstandingByUser(s)).toEqual({
      u1: 12000,
      u2: -4000,
      u3: -4000,
      u4: -4000,
      u5: 0,
    });
  });

  it('all owers settled: everyone is 0 (payer fully paid back)', () => {
    const s: SettlementInput = {
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3'],
      settledIds: ['u2', 'u3'],
    };
    expect(spotOutstandingByUser(s)).toEqual({ u1: 0, u2: 0, u3: 0 });
  });

  it('ignores a stale settled id that is the payer or not a participant', () => {
    // u1 is the payer (cannot be settled); u9 is not a participant -> both ignored.
    const s: SettlementInput = {
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2', 'u3'],
      settledIds: ['u1', 'u9'],
    };
    expect(spotOutstandingByUser(s)).toEqual({ u1: 8000, u2: -4000, u3: -4000 });
  });
});

describe('tourOutstandingByUser (sum outstanding across spots)', () => {
  it('sums outstanding, excluding settled shares', () => {
    // Spot 1: 20,000 by u1, 5 ppl, u5 settled -> u1 +12000, u2/u3/u4 −4000, u5 0.
    // Spot 2: 6,000 by u2, shared u2,u3 (3,000) -> u2 +3000, u3 −3000.
    // Totals: u1 +12000, u2 −1000, u3 −7000, u4 −4000, u5 0.
    const settlements: SettlementInput[] = [
      {
        amount: 20000,
        payerIds: ['u1'],
        participantIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
        settledIds: ['u5'],
      },
      {
        amount: 6000,
        payerIds: ['u2'],
        participantIds: ['u2', 'u3'],
        settledIds: [],
      },
    ];
    expect(tourOutstandingByUser(settlements)).toEqual({
      u1: 12000,
      u2: -1000,
      u3: -7000,
      u4: -4000,
      u5: 0,
    });
  });

  it('feeds suggestedTransfers so settled shares are excluded from 보낼 돈', () => {
    // 12,000 by u1, 3 ppl (4,000 each); u2 settled. Outstanding: u1 +4000, u3 −4000.
    // Only u3 -> u1 remains as a transfer.
    const settlements: SettlementInput[] = [
      {
        amount: 12000,
        payerIds: ['u1'],
        participantIds: ['u1', 'u2', 'u3'],
        settledIds: ['u2'],
      },
    ];
    const outstanding = tourOutstandingByUser(settlements);
    expect(suggestedTransfers(outstanding)).toEqual([
      { fromUserId: 'u3', toUserId: 'u1', amount: 4000 },
    ]);
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
