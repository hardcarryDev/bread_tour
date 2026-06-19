// Converts arbitrary caught errors (Supabase/PostgREST/RPC failures, thrown
// Errors, unknown values) into a natural Korean message for display. Raw backend
// messages are English and often leak SQL/RLS details, so callers route caught
// errors through here instead of showing `err.message` directly. Unrecognised
// errors collapse to a Korean generic fallback — English is never surfaced.

const GENERIC_FALLBACK = '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';

// Substring (lower-cased) patterns for known backend failures that can reach the
// UI from tour / spot / menu / stamp / invite / collaboration flows.
const PATTERNS: { match: string; message: string }[] = [
  // Permission / RLS denials.
  { match: 'row-level security', message: '이 작업을 수행할 권한이 없습니다.' },
  { match: 'permission denied', message: '이 작업을 수행할 권한이 없습니다.' },
  { match: 'violates row', message: '이 작업을 수행할 권한이 없습니다.' },
  { match: 'not authorized', message: '이 작업을 수행할 권한이 없습니다.' },
  { match: 'jwt', message: '세션이 만료되었습니다. 다시 로그인해 주세요.' },
  // Invite flow. accept_invite() raises three distinct conditions whose raw
  // messages all contain "invite"; match the specific ones BEFORE the generic
  // 'invite' fallback so the user gets an actionable cause instead of a single
  // misleading "expired link". A stale/expired session reaches the RPC as
  // "authentication required to accept an invite" — the cure is re-login, NOT a
  // new link, so this case must say so explicitly.
  {
    match: 'authentication required',
    message: '로그인이 만료되었습니다. 다시 로그인한 뒤 초대 링크를 다시 열어 주세요.',
  },
  {
    match: 'already-used invite',
    message: '이미 수락했거나 거절한 초대입니다.',
  },
  {
    match: 'invalid invite token',
    message: '유효하지 않은 초대 링크입니다. 초대한 사람에게 링크를 다시 받아 주세요.',
  },
  // Generic invite fallback (keep AFTER the specific invite patterns above).
  { match: 'invite', message: '초대를 처리할 수 없습니다. 링크가 만료되었거나 유효하지 않습니다.' },
  { match: 'token', message: '초대 링크가 유효하지 않거나 만료되었습니다.' },
  // Manual check-in (peer confirmation) flow.
  { match: 'confirmed by another member', message: '수동 체크인은 다른 멤버가 확인해야 합니다.' },
  { match: 'confirmer', message: '수동 체크인은 다른 멤버가 확인해야 합니다.' },
  // Menu flow.
  { match: 'empty menu', message: '메뉴 내용을 입력해 주세요.' },
  // Stamp uniqueness (re-stamp guard / already stamped).
  { match: 'duplicate key', message: '이미 처리된 항목입니다.' },
  { match: 'unique constraint', message: '이미 처리된 항목입니다.' },
  { match: 'already exists', message: '이미 처리된 항목입니다.' },
  // Network-layer failures.
  { match: 'failed to fetch', message: '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.' },
  { match: 'network', message: '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.' },
  { match: 'timeout', message: '요청 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.' },
];

// @MX:ANCHOR: [AUTO] errorMessage is the single backend-error -> Korean
// translation point for action handlers (tour/spot/menu/stamp/invite/collab).
// @MX:REASON: REQ-F5-001 — Korean-only UX; every catch block routes through here
// so unexpected English backend messages collapse to a Korean fallback instead
// of leaking to the UI.
export function errorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const msg = raw.toLowerCase();
  if (!msg) return GENERIC_FALLBACK;

  for (const { match, message } of PATTERNS) {
    if (msg.includes(match)) return message;
  }

  return GENERIC_FALLBACK;
}
