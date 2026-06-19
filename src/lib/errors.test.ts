import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

// The accept_invite() RPC raises three DISTINCT conditions, all of whose raw
// messages contain the substring "invite". Before the fix they collapsed to the
// same misleading "expired/invalid link" string, hiding the real cause from the
// user (e.g. a stale session that only needs re-login). These tests pin the
// distinct, actionable Korean messages.
describe('errorMessage — invite RPC failures (accept_invite)', () => {
  it('maps an auth-required failure to a re-login prompt', () => {
    const msg = errorMessage(
      new Error('authentication required to accept an invite'),
    );
    expect(msg).toContain('로그인');
    expect(msg).not.toContain('만료된 링크');
  });

  it('maps an already-used invite to a distinct message', () => {
    const msg = errorMessage(new Error('invalid or already-used invite'));
    expect(msg).toContain('이미');
  });

  it('maps an invalid invite token to a link-specific message', () => {
    const msg = errorMessage(new Error('invalid invite token'));
    expect(msg).toContain('초대 링크');
    expect(msg).not.toContain('로그인');
  });

  it('still routes an unknown invite error to a safe Korean fallback', () => {
    const msg = errorMessage(new Error('some invite weirdness'));
    expect(msg).toContain('초대');
    // never leaks the raw English backend message
    expect(msg).not.toMatch(/invite/i);
  });

  it('never surfaces a raw English message for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe(
      '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    );
  });
});
