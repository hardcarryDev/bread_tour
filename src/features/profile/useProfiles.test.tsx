import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listProfiles = vi.fn();
vi.mock('./api', () => ({
  listProfiles: (...a: unknown[]) => listProfiles(...a),
}));

import { useProfiles } from './useProfiles';

// A tiny probe that renders the resolved display name for a fixed id.
function Probe({ ids, lookup }: { ids: string[]; lookup: string }) {
  const names = useProfiles(ids);
  return <span data-testid="name">{names[lookup] ?? 'none'}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProfiles (Feature 1)', () => {
  it('loads display names for the given user ids', async () => {
    listProfiles.mockResolvedValue({ u1: '빵돌이', u2: '빵순이' });
    render(<Probe ids={['u1', 'u2']} lookup="u1" />);
    await waitFor(() =>
      expect(screen.getByTestId('name')).toHaveTextContent('빵돌이'),
    );
    expect(listProfiles).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('does not query when there are no ids', async () => {
    render(<Probe ids={[]} lookup="u1" />);
    await waitFor(() =>
      expect(screen.getByTestId('name')).toHaveTextContent('none'),
    );
    expect(listProfiles).not.toHaveBeenCalled();
  });
});
