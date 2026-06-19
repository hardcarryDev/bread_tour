/// <reference types="vite/client" />

// Typed access to the public client env vars (see .env.example).
// These are PUBLIC client keys (NFR-SEC threat model): the Supabase anon key
// and Kakao JS key are exposed in the client bundle by design. Security relies
// on Supabase RLS + Kakao domain allowlist, NOT on hiding these values.
// Server-only secrets (e.g. Supabase service-role key) must NEVER appear here.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_KAKAO_MAP_APP_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
