import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Build a controllable auth-state mock for the Supabase client. Everything the
// vi.mock factory touches is created inside vi.hoisted so it is initialized
// before the (hoisted) mock factory runs.
const h = vi.hoisted(() => {
  const authState: { session: unknown } = { session: null };
  const ref: {
    cb: ((event: string, session: unknown) => void) | null;
  } = { cb: null };
  return {
    authState,
    ref,
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(() => {
      authState.session = null;
      ref.cb?.('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    }),
  };
});

const { signInWithPassword } = h;
const authState = h.authState;
function emitAuthChange(event: string, session: unknown) {
  h.ref.cb?.(event, session);
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: h.authState.session } }),
      ),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        h.ref.cb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: h.signInWithPassword,
      signUp: h.signUp,
      signOut: h.signOut,
    },
  },
}));

import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { ProtectedRoute } from './ProtectedRoute';

beforeEach(() => {
  vi.clearAllMocks();
  authState.session = null;
  h.ref.cb = null;
});

function AuthProbe() {
  const { user, loading, signIn, signUp, signOut: doSignOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : 'anon'}</span>
      <button onClick={() => signIn('a@b.com', 'pw')}>login</button>
      <button onClick={() => signUp('a@b.com', 'pw', '빵돌이')}>register</button>
      <button onClick={() => doSignOut()}>logout</button>
    </div>
  );
}

describe('useAuth + AuthProvider (REQ-F5-001)', () => {
  it('starts with no user once the initial session check resolves', async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent('anon');
  });

  it('exposes the user when a session already exists', async () => {
    authState.session = { user: { id: 'u1', email: 'a@b.com' } };
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('a@b.com'),
    );
  });

  it('signUp passes the display name as user metadata (Feature 1)', async () => {
    h.signUp.mockResolvedValue({
      data: { session: { user: { id: 'u3', email: 'a@b.com' } } },
      error: null,
    });
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
    await userEvent.click(screen.getByText('register'));
    // The trigger handle_new_user reads raw_user_meta_data ->> 'display_name',
    // so signUp must forward it under options.data.display_name.
    expect(h.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
      options: { data: { display_name: '빵돌이' } },
    });
  });

  it('signUp returns the created session so the caller can route in (Feature 2)', async () => {
    const session = { user: { id: 'u3', email: 'a@b.com' } };
    h.signUp.mockResolvedValue({ data: { session }, error: null });
    let result: { error: unknown; session: unknown } | undefined;
    function Probe() {
      const { signUp } = useAuth();
      return (
        <button
          onClick={async () => {
            result = await signUp('a@b.com', 'pw', '빵돌이');
          }}
        >
          go
        </button>
      );
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(result).toBeDefined());
    expect(result?.error).toBeNull();
    expect(result?.session).toEqual(session);
  });

  it('signUp returns a null session when email confirmation is required (Feature 2)', async () => {
    // With email confirmation ON, Supabase returns no session.
    h.signUp.mockResolvedValue({ data: { session: null }, error: null });
    let result: { error: unknown; session: unknown } | undefined;
    function Probe() {
      const { signUp } = useAuth();
      return (
        <button
          onClick={async () => {
            result = await signUp('a@b.com', 'pw', '빵돌이');
          }}
        >
          go
        </button>
      );
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(result).toBeDefined());
    expect(result?.error).toBeNull();
    expect(result?.session).toBeNull();
  });

  it('signIn calls supabase signInWithPassword and surfaces errors', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'bad creds' },
    });
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
    await userEvent.click(screen.getByText('login'));
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
    });
  });

  it('updates the user when auth state changes to signed-in', async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
    // Simulate Supabase emitting a SIGNED_IN event.
    act(() => {
      emitAuthChange('SIGNED_IN', {
        user: { id: 'u2', email: 'c@d.com' },
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('c@d.com'),
    );
  });
});

describe('ProtectedRoute (REQ-F5-006 / AC-F5-01)', () => {
  function renderWithRouter(initialPath: string) {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/tours"
              element={
                <ProtectedRoute>
                  <div>Secret Tours</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('redirects unauthenticated users to /login', async () => {
    renderWithRouter('/tours');
    await waitFor(() =>
      expect(screen.getByText('Login Page')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Secret Tours')).not.toBeInTheDocument();
  });

  it('renders protected content for authenticated users', async () => {
    authState.session = { user: { id: 'u1', email: 'a@b.com' } };
    renderWithRouter('/tours');
    await waitFor(() =>
      expect(screen.getByText('Secret Tours')).toBeInTheDocument(),
    );
  });
});
