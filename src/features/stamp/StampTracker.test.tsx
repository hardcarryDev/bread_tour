import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StampTracker from './StampTracker';

function baseProps(over: Record<string, unknown> = {}) {
  return {
    tracking: false,
    accuracyWarning: false,
    permissionDenied: false,
    error: null as string | null,
    purpose: '도착 시 자동으로 스탬프를 적립하기 위해 위치 정보를 사용합니다.',
    onStart: vi.fn(),
    onPause: vi.fn(),
    ...over,
  };
}

describe('StampTracker purpose prompt (NFR-GEO-001 / AC-NFR-GEO-03)', () => {
  it('shows the auto-stamp purpose before tracking starts', () => {
    render(<StampTracker {...baseProps()} />);
    expect(screen.getByText(/자동으로 스탬프를 적립/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '위치 추적 시작' }),
    ).toBeInTheDocument();
  });

  it('calls onStart when tracking is started', async () => {
    const onStart = vi.fn();
    render(<StampTracker {...baseProps({ onStart })} />);
    await userEvent.click(screen.getByRole('button', { name: '위치 추적 시작' }));
    expect(onStart).toHaveBeenCalled();
  });
});

describe('StampTracker active indicator + pause (NFR-GEO-004/005)', () => {
  it('shows a persistent tracking indicator and a pause control while active', async () => {
    const onPause = vi.fn();
    render(<StampTracker {...baseProps({ tracking: true, onPause })} />);
    expect(screen.getByTestId('tracking-indicator')).toBeInTheDocument();
    const pause = screen.getByRole('button', { name: '위치 추적 중지' });
    await userEvent.click(pause);
    expect(onPause).toHaveBeenCalled();
  });
});

describe('StampTracker accuracy warning (REQ-F1-006 / AC-F1-03)', () => {
  it('renders an accuracy warning when accuracy is unreliable', () => {
    render(<StampTracker {...baseProps({ tracking: true, accuracyWarning: true })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/정확도/);
  });
});

describe('StampTracker permission-denied fallback (NFR-GEO-002 / AC-NFR-GEO-01)', () => {
  it('guides the user to manual check-in when permission is denied', () => {
    render(
      <StampTracker {...baseProps({ permissionDenied: true, error: 'denied' })} />,
    );
    expect(screen.getByText(/수동 체크인/)).toBeInTheDocument();
  });
});
