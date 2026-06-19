// Connected-members indicator (SPEC-BREADTOUR-001 / REQ-F5-003 / AC-F5-03).
// Shows who is currently viewing the tour (presence), by display name. Presence
// entries are enriched with display names upstream (useRealtimeTour maps each
// connected user_id through the tour's profile names, Feature 1); when a name is
// still unknown we show "(이름 없음)" rather than leaking the raw UUID.
// Presentational only.

import type { PresenceMember } from './api';

interface ConnectedMembersProps {
  members: PresenceMember[];
}

export default function ConnectedMembers({ members }: ConnectedMembersProps) {
  return (
    <div className="connected-members" aria-label="접속 중인 멤버">
      <span className="connected-label">접속 중</span>
      <span className="connected-count" data-testid="connected-count">
        {members.length}
      </span>
      <ul className="connected-list">
        {members.map((m) => (
          <li key={m.user_id} className="connected-member">
            {m.display_name || '(이름 없음)'}
          </li>
        ))}
      </ul>
    </div>
  );
}
