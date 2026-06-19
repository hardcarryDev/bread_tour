// SPA fallback for GitHub Pages.
//
// GitHub Pages has no server-side rewrite, so a hard navigation to a deep link
// (e.g. /<repo>/tours/123) returns the static 404 page for unknown paths. By
// shipping a 404.html that is a byte-for-byte copy of index.html, GitHub Pages
// serves the SPA shell (with the correct <base>-relative asset URLs); the app
// boots and BrowserRouter resolves the in-app route client-side.
//
// Cross-platform: uses Node's fs API rather than a shell `cp` so it runs on
// Windows, macOS, and Linux (CI) identically. Invoked via the `postbuild` npm
// script, so it runs automatically after `vite build`.
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const index = resolve(dist, 'index.html');
const fallback = resolve(dist, '404.html');

if (!existsSync(index)) {
  console.error('[spa-404] dist/index.html not found — did the build run?');
  process.exit(1);
}

copyFileSync(index, fallback);
console.log('[spa-404] copied dist/index.html -> dist/404.html');
