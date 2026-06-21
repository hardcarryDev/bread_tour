# Tech Stack

**Last updated:** 2026-06-21

---

## Frontend

| Technology | Version | Role |
|-----------|---------|------|
| React | 19 | UI rendering |
| TypeScript | 5.7 (strict) | Type safety |
| Vite | 6 | Dev server, bundler |
| react-router-dom | 7 | Client-side routing (SPA) |

---

## Backend / Database

| Technology | Role |
|-----------|------|
| Supabase (PostgreSQL) | Relational database with RLS |
| Supabase Auth | Email + password authentication |
| Supabase Realtime | Live multi-user collaboration (broadcasts + presence) |
| Supabase Edge Functions | Server-side API key proxy (Deno; `directions` function) |
| Supabase Storage | Menu photo uploads (`menu-images` public bucket) |

Client library: `@supabase/supabase-js` ^2.45.4

---

## Maps and Routing APIs

| Service | Usage |
|---------|-------|
| Kakao Maps JavaScript SDK | Interactive map, markers, overlays, keyword search |
| Kakao Mobility REST API | Car route calculation |
| TMAP REST API | Walking and transit route calculation |

Both REST API keys are kept server-side in the `directions` Edge Function; only the Kakao Maps JS SDK key is bundled on the client (gated by Kakao domain allowlist).

---

## Testing

| Technology | Version | Role |
|-----------|---------|------|
| Vitest | 3 | Test runner (pool: forks, maxForks: 2) |
| @testing-library/react | 16 | Component testing |
| @testing-library/user-event | 14 | User interaction simulation |
| jsdom | 25 | Browser environment for unit tests |

---

## Tooling

| Tool | Role |
|------|------|
| ESLint 9 (flat config) | Linting |
| Prettier 3 | Code formatting |
| @vitest/coverage-v8 | Coverage reporting |

---

## Deployment

| Service | Role |
|---------|------|
| GitHub Pages | Static hosting |
| GitHub Actions | CI/CD (build + deploy on push to main) |

The build outputs to `dist/`. A `postbuild` script copies `index.html` to `404.html` for SPA deep-link support. `BASE_PATH` is injected at build time to handle the `/<repo-name>/` subpath.

---

## Environment Variables

| Variable | Exposure | Protection |
|----------|---------|-----------|
| `VITE_SUPABASE_URL` | Client bundle | Supabase RLS |
| `VITE_SUPABASE_ANON_KEY` | Client bundle | Supabase RLS |
| `VITE_KAKAO_MAP_APP_KEY` | Client bundle | Kakao domain allowlist |
| `KAKAO_REST_API_KEY` | Edge Function secret only | Server-side |
| `TMAP_APP_KEY` | Edge Function secret only | Server-side |
