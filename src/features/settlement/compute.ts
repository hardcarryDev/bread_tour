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
