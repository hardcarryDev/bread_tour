// Maps Supabase auth failures to natural Korean messages shown to the user
// (REQ-F5-001). Raw Supabase/GoTrue messages are English and leak implementation
// details, so they must never reach the UI. We match primarily on the stable
// error `code` (see @supabase/auth-js ErrorCode) and fall back to substring
// matching on the message for older servers / codeless errors, then to a generic
// Korean fallback for anything unrecognised.

// The minimal shape we need from a Supabase AuthError. We accept a loose shape so
// callers can forward `{ message, code }` without importing the SDK error class.
export interface AuthErrorLike {
  message?: string | null;
  code?: string | null;
  status?: number | null;
}

const GENERIC_FALLBACK = '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';

// code -> Korean message. Codes come from @supabase/auth-js ErrorCode.
const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
  email_exists: '이미 가입된 이메일입니다. 로그인해 주세요.',
  user_already_exists: '이미 가입된 이메일입니다. 로그인해 주세요.',
  identity_already_exists: '이미 가입된 이메일입니다. 로그인해 주세요.',
  weak_password: '비밀번호가 너무 약합니다. 6자 이상으로 더 안전하게 설정해 주세요.',
  same_password: '이전과 다른 비밀번호를 사용해 주세요.',
  email_not_confirmed: '이메일 인증이 완료되지 않았습니다. 받은 메일의 인증 링크를 확인해 주세요.',
  email_address_invalid: '올바른 이메일 주소를 입력해 주세요.',
  email_address_not_authorized: '해당 이메일 주소로는 가입할 수 없습니다.',
  validation_failed: '입력한 정보를 다시 확인해 주세요.',
  user_not_found: '이메일 또는 비밀번호가 올바르지 않습니다.',
  signup_disabled: '현재 회원가입이 비활성화되어 있습니다.',
  email_provider_disabled: '이메일 로그인이 현재 비활성화되어 있습니다.',
  user_banned: '이용이 제한된 계정입니다. 관리자에게 문의해 주세요.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  over_email_send_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  session_expired: '세션이 만료되었습니다. 다시 로그인해 주세요.',
  session_not_found: '세션이 만료되었습니다. 다시 로그인해 주세요.',
  request_timeout: '요청 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.',
};

// Substring (lower-cased) match on the raw message, for errors that arrive
// without a recognised `code` (older servers, network-layer failures).
const MESSAGE_PATTERNS: { match: string; message: string }[] = [
  { match: 'invalid login credentials', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
  { match: 'invalid credentials', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
  { match: 'already registered', message: '이미 가입된 이메일입니다. 로그인해 주세요.' },
  { match: 'already been registered', message: '이미 가입된 이메일입니다. 로그인해 주세요.' },
  { match: 'user already', message: '이미 가입된 이메일입니다. 로그인해 주세요.' },
  { match: 'email already', message: '이미 가입된 이메일입니다. 로그인해 주세요.' },
  { match: 'password should be at least', message: '비밀번호는 6자 이상이어야 합니다.' },
  { match: 'weak password', message: '비밀번호가 너무 약합니다. 6자 이상으로 더 안전하게 설정해 주세요.' },
  { match: 'email not confirmed', message: '이메일 인증이 완료되지 않았습니다. 받은 메일의 인증 링크를 확인해 주세요.' },
  { match: 'unable to validate email', message: '올바른 이메일 주소를 입력해 주세요.' },
  { match: 'invalid email', message: '올바른 이메일 주소를 입력해 주세요.' },
  { match: 'rate limit', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  { match: 'too many requests', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  { match: 'network', message: '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.' },
  { match: 'failed to fetch', message: '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.' },
];

// @MX:ANCHOR: [AUTO] authErrorMessage is the single auth-error -> Korean
// translation point; Login (and any future auth surface) routes Supabase auth
// failures through here so no raw English message ever reaches the UI.
// @MX:REASON: REQ-F5-001 — Korean-only UX; centralising the mapping keeps the
// fallback guarantee (never leak English) in one auditable place.
export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_FALLBACK;

  const code = error.code?.toLowerCase();
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const msg = error.message?.toLowerCase() ?? '';
  for (const { match, message } of MESSAGE_PATTERNS) {
    if (msg.includes(match)) return message;
  }

  return GENERIC_FALLBACK;
}
