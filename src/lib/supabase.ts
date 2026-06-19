import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// @MX:NOTE: [AUTO] The Supabase URL and anon key are PUBLIC client values and
// are intentionally shipped in the client bundle (NFR-SEC threat model / D10).
// Data security depends entirely on Supabase RLS, not on hiding these values.
// The service-role key must NEVER be referenced here.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

// Single shared browser client. Auth session persists in localStorage by
// default, which suits the SPA login flow (REQ-F5-001).
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
