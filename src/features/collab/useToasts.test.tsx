import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useToasts } from './useToasts';

describe('useToasts (NFR-CONFLICT-003 — non-destructive notices)', () => {
  it('adds a toast and exposes it in the list', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.push('최신 값으로 갱신되었습니다');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('최신 값으로 갱신되었습니다');
  });

  it('assigns a stable unique id per toast', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.push('a');
      result.current.push('b');
    });
    const ids = result.current.toasts.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('dismiss removes a toast by id', () => {
    const { result } = renderHook(() => useToasts());
    let id = '';
    act(() => {
      id = result.current.push('to dismiss');
    });
    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useToasts({ timeoutMs: 1000 }));
      act(() => {
        result.current.push('temporary');
      });
      expect(result.current.toasts).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.toasts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
