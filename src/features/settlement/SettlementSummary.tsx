// Tour-wide settlement (정산) summary (SPEC-BREADTOUR-001 / F-정산).
//
// Aggregates every spot's settlement into each member's total net across the
// whole tour, plus a suggested set of transfers (누가 누구에게 얼마) to settle up.
// Pure presentational: it takes the raw settlements + the name map and derives
// everything via the compute module. Renders nothing when there is no money to
// show (no settlements / everyone nets zero) so the caller can mount it
// unconditionally below the spots.

import type { SpotSettlement } from '../../types/database';
import { displayNameFor, type DisplayNameMap } from '../profile/api';
import {
  suggestedTransfers,
  tourNetByUser,
  type SettlementInput,
} from './compute';
import { formatSignedWon, formatWon } from './format';

interface SettlementSummaryProps {
  settlements: SpotSettlement[];
  profileNames: DisplayNameMap;
}

export default function SettlementSummary({
  settlements,
  profileNames,
}: SettlementSummaryProps) {
  if (settlements.length === 0) return null;

  const inputs: SettlementInput[] = settlements.map((s) => ({
    amount: s.amount,
    payerIds: s.payer_ids,
    participantIds: s.participant_ids,
  }));
  const netByUser = tourNetByUser(inputs);
  // Only members with a non-zero net are interesting (sorted by id for stable
  // display, matching the deterministic transfer ordering).
  const nonZero = Object.entries(netByUser)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const transfers = suggestedTransfers(netByUser);

  // Nothing owed either direction -> nothing to render.
  if (nonZero.length === 0 && transfers.length === 0) return null;

  return (
    <section
      className="settlement-summary"
      data-testid="settlement-summary"
      aria-label="정산 요약"
    >
      <h2>정산 요약</h2>

      <div className="settlement-summary-card">
        <ul className="settlement-net-list">
          {nonZero.map(([userId, net]) => (
            <li key={userId}>
              <span>{displayNameFor(userId, profileNames)}</span>
              <span
                className={
                  net > 0 ? 'settlement-net-pos' : 'settlement-net-neg'
                }
              >
                {formatSignedWon(net)}원
              </span>
            </li>
          ))}
        </ul>

        {transfers.length > 0 && (
          <>
            <p className="muted settlement-transfers-title">보낼 돈</p>
            <ul className="settlement-transfer-list">
              {transfers.map((t) => (
                <li key={`${t.fromUserId}->${t.toUserId}`}>
                  {displayNameFor(t.fromUserId, profileNames)} →{' '}
                  {displayNameFor(t.toUserId, profileNames)}:{' '}
                  {formatWon(t.amount)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
