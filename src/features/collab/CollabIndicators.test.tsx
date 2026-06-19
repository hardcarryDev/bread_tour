import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConnectedMembers from './ConnectedMembers';
import OfflineIndicator from './OfflineIndicator';
import ToastHost from './ToastHost';

describe('ConnectedMembers (REQ-F5-003 / AC-F5-03)', () => {
  it('renders the list of currently connected members by display name', () => {
    render(
      <ConnectedMembers
        members={[
          { user_id: 'u1', display_name: 'Alice' },
          { user_id: 'u2', display_name: 'Bob' },
        ]}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('falls back to a name placeholder (not the raw UUID) when no display name is present (Feature 1)', () => {
    render(
      <ConnectedMembers members={[{ user_id: 'u3', display_name: null }]} />,
    );
    // The raw UUID must never be shown; presence names are resolved upstream.
    expect(screen.queryByText('u3')).not.toBeInTheDocument();
    expect(screen.getByText('(이름 없음)')).toBeInTheDocument();
  });

  it('shows the connected count', () => {
    render(
      <ConnectedMembers
        members={[
          { user_id: 'u1', display_name: 'Alice' },
          { user_id: 'u2', display_name: 'Bob' },
        ]}
      />,
    );
    // Count reflects how many members are currently connected.
    expect(screen.getByTestId('connected-count')).toHaveTextContent('2');
  });
});

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
