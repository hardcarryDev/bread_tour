import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';

// Auth method (stated explicitly): email + password via Supabase Auth.
// Chosen as the simplest reliable option that needs no SMTP / magic-link
// infrastructure for local development (REQ-F5-001).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Resolve the initial session, then keep it in sync via the listener.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return {
          error: error ? { message: error.message, code: error.code } : null,
        };
      },
      signUp: async (email, password, displayName) => {
        // Forward the display name as user metadata. The handle_new_user trigger
        // stores coalesce(raw_user_meta_data ->> 'display_name', email) on the
        // profile, so this name becomes the profile display_name (Feature 1).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        return {
          error: error ? { message: error.message, code: error.code } : null,
          // Confirmation OFF -> active session; ON -> null (Feature 2).
          session: data?.session ?? null,
        };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
