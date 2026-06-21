// Pure settlement (정산 / dutch-pay) math for Slice E (SPEC-BREADTOUR-001 / F-정산).
//
// One settlement describes a single spot's bill: a total `amount` (whole KRW),
// the members who shared it (`participantIds`, split EQUALLY), and the members
// who paid it (`payerIds`, each assumed to have paid amount / payerCount).
//
// Each person's NET for one spot = (what they paid) − (what they owe):
//   paid  = payerIds.includes(user)       ? amount / payerCount       : 0
//   share = participantIds.includes(user) ? amount / participantCount : 0
//   net   = paid − share
// Positive net = should RECEIVE money; negative net = should PAY money.
//
// This module is intentionally free of React and network code so the money math
// can be unit-tested in isolation and reused by the modal preview, the per-row
// caption, and the tour-wide summary.

export interface SettlementInput {
  amount: number;
  payerIds: string[];
  participantIds: string[];
  // Non-payer participants who have already sent their share back to the payer.
  // Used by the OUTSTANDING math to clear their debt (and reduce what the payer
  // is still owed). Ignored by the GROSS net math, which always shows full splits.
  settledIds: string[];
}

// One suggested money transfer to settle up: `fromUserId` pays `toUserId`.
export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

// Net per user for ONE settlement, keyed by user id, rounded to whole won.
//
// We compute a net for every user in the UNION of payerIds + participantIds so a
// payer who did not share (net = +paid) and a participant who did not pay
// (net = −share) both appear. Each net is rounded independently with Math.round;
// because shares/paids are divided then rounded per person, the rounded nets may
// not sum to exactly zero (a ±few-won residue on indivisible totals). That
// residue is acceptable for a casual dutch-pay UI and is documented here so the
// summary/transfers callers know the inputs are not guaranteed to net to zero.
export function spotNetByUser(s: SettlementInput): Record<string, number> {
  // GROSS net ignores settledIds on purpose — it shows each person's full split.
  const { amount, payerIds, participantIds } = s;
  const paidPer = payerIds.length ? amount / payerIds.length : 0;
  const sharePer = participantIds.length ? amount / participantIds.length : 0;

  const payerSet = new Set(payerIds);
  const participantSet = new Set(participantIds);
  const users = new Set<string>([...payerIds, ...participantIds]);

  const net: Record<string, number> = {};
  for (const user of users) {
    const paid = payerSet.has(user) ? paidPer : 0;
    const share = participantSet.has(user) ? sharePer : 0;
    net[user] = Math.round(paid - share);
  }
  return net;
}

// OUTSTANDING per user for ONE settlement, keyed by user id, rounded to whole won.
//
// Like spotNetByUser, but accounts for who has already paid the payer back
// (`settledIds`). A settled non-payer participant's debt is cleared (their
// outstanding becomes 0) AND the payer's receivable drops by that cleared share.
// Net result with a single payer:
//   - payer        = sum of UNSETTLED owers' shares (what they still expect)
//   - unsettled ower = −share (what they still owe)
//   - settled ower   = 0 (already paid back)
// The payer is never treated as settled (a payer can't owe themselves).
//
// We subtract each cleared share from the payer using the SAME per-share value
// the ower contributes, so the rounded payer total stays consistent with the
// rounded ower amounts (no residue beyond the per-person rounding already in
// spotNetByUser).
export function spotOutstandingByUser(
  s: SettlementInput,
): Record<string, number> {
  const { amount, payerIds, participantIds, settledIds } = s;
  const sharePer = participantIds.length ? amount / participantIds.length : 0;

  const payerSet = new Set(payerIds);
  // Only non-payer participants can be "settled"; ignore stray ids defensively.
  const participantSet = new Set(participantIds);
  const settledSet = new Set(
    settledIds.filter((id) => participantSet.has(id) && !payerSet.has(id)),
  );

  const gross = spotNetByUser(s);
  const out: Record<string, number> = {};
  for (const [user, net] of Object.entries(gross)) {
    if (settledSet.has(user)) {
      // This ower already paid back: clear their debt entirely.
      out[user] = 0;
    } else {
      out[user] = net;
    }
  }
  // Reduce each payer's receivable by the cleared shares (split evenly across
  // payers; with the single-payer UI there is exactly one). Recompute from the
  // rounded share so the payer total matches the cleared owers exactly.
  const clearedTotal = Math.round(sharePer) * settledSet.size;
  if (clearedTotal > 0 && payerIds.length > 0) {
    const perPayer = clearedTotal / payerIds.length;
    for (const payer of payerIds) {
      if (out[payer] !== undefined) out[payer] = Math.round(out[payer] - perPayer);
    }
  }
  return out;
}

// Sum nets across many settlements into one user id -> total net (whole won).
// Per-spot nets are already rounded; summing rounded integers stays integral.
export function tourNetByUser(
  settlements: SettlementInput[],
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const s of settlements) {
    const net = spotNetByUser(s);
    for (const [user, value] of Object.entries(net)) {
      total[user] = (total[user] ?? 0) + value;
    }
  }
  return total;
}

// Sum OUTSTANDING amounts across many settlements into one user id -> total
// outstanding (whole won). Mirror of tourNetByUser but settled-aware: feed this
// to suggestedTransfers so already-paid-back shares are excluded from the
// remaining "보낼 돈" list.
export function tourOutstandingByUser(
  settlements: SettlementInput[],
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const s of settlements) {
    const out = spotOutstandingByUser(s);
    for (const [user, value] of Object.entries(out)) {
      total[user] = (total[user] ?? 0) + value;
    }
  }
  return total;
}

// Greedy settle-up: from a net map, produce transfers debtor -> creditor.
//
// Creditors (net > 0) are owed money; debtors (net < 0) owe money. For each
// debtor we pay min(remaining debt, remaining credit) to creditors in order
// until the debtor is settled, advancing creditors as they fill up. Zero-amount
// transfers are skipped. Both lists are sorted by user id so the output is
// deterministic (stable for tests). This is the standard greedy heuristic — it
// is near-minimal, not provably minimal, which is fine for casual splitting.
export function suggestedTransfers(
  netByUser: Record<string, number>,
): Transfer[] {
  const creditors = Object.entries(netByUser)
    .filter(([, v]) => v > 0)
    .map(([userId, v]) => ({ userId, amount: v }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const debtors = Object.entries(netByUser)
    .filter(([, v]) => v < 0)
    .map(([userId, v]) => ({ userId, amount: -v })) // store debt as positive
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const pay = Math.min(creditor.amount, debtor.amount);
    if (pay > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: pay,
      });
    }
    creditor.amount -= pay;
    debtor.amount -= pay;
    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }
  return transfers;
}
