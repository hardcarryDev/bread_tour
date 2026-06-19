import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
  // displayName is forwarded as Supabase user metadata so the handle_new_user
  // trigger stores it on the profile (Feature 1). The created `session` is
  // returned so the caller (Login) can route into the app on success or show a
  // "check your email" message when confirmation is required (Feature 2).
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{
    error: { message: string; code?: string } | null;
    session: Session | null;
  }>;
  signOut: () => Promise<void>;
}

// Exported separately from the provider component so that fast-refresh only
// sees component exports in AuthProvider.tsx.
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
