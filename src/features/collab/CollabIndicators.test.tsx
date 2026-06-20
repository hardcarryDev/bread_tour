import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OfflineIndicator from './OfflineIndicator';
import ToastHost from './ToastHost';

// Presence display moved into MemberRoster (all-members roster with an online
// dot), so the standalone ConnectedMembers component and its tests were removed.

describe('OfflineIndicator (REQ-F5-005 / AC-F5-05 / EC-03)', () => {
  it('shows nothing while online', () => {
    const { container } = render(<OfflineIndicator online={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an offline notice when disconnected (last state kept)', () => {
    render(<OfflineIndicator online={false} />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(/오프라인/);
  });
});

describe('ToastHost (NFR-CONFLICT-003)', () => {
  it('renders each toast message and allows dismissing', async () => {
    const dismiss = vi.fn();
    render(
      <ToastHost
        toasts={[{ id: 'a', message: '값이 갱신되었습니다' }]}
        onDismiss={dismiss}
      />,
    );
    expect(screen.getByText('값이 갱신되었습니다')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /닫기/ }));
    expect(dismiss).toHaveBeenCalledWith('a');
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastHost toasts={[]} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
