# MatchView — Implementation Status & Known Limitations

This file is the honest record requested by the project spec: what works,
what's partial, and what genuinely cannot be verified without resources
this build environment doesn't have (a Windows machine with real monitors,
a paid football-data API key, actual streaming provider URLs).

## Fully implemented and automatically tested (86/86 tests passing)

- **Layout engine** (`src/renderer/layout/LayoutEngine.ts`): resolution-independent,
  pure functions for 2/3/4/5-match layouts (horizontal/vertical split, primary-focus,
  equal, grid, fully custom with overlap/bounds validation). Tested across all
  7 target resolutions (1920×1080 down to 800×600), including the "too small to
  be usable" warning system.
- **Monitor detection** (`src/main/monitors/MonitorService.ts`): wraps Electron's
  real `screen` module. Tested for single monitor, multi-monitor, disconnection
  fallback (never leaves a stale/off-screen selection), and display-metrics-changed
  (resolution/DPI change) events.
- **Event provider abstraction + API-FOOTBALL integration**
  (`src/main/events/providers/`): real HTTPS request shape against api-football.com's
  documented `fixtures/events` endpoint. No event is ever invented; `MockProviderForTestsOnly`
  is used exclusively inside `tests/` and is named so it can never be mistaken for a
  live source in logs or the Settings screen.
- **EventMonitor** (polling, de-duplication, idempotent start, error isolation per
  poll) — tested.
- **OverlayScheduler** (`src/main/events/OverlayScheduler.ts`) — the core of the
  goal-overlay feature: event delay, manual calibration offset, one-overlay-at-a-time
  queueing, priority-based ordering, duplicate protection, primary-match protection,
  lower-priority interruption rule, pause, manual dismiss, auto-expiry/restore — all
  tested with a fake deterministic clock (no real timers in the test suite).
- **SQLite persistence** (`better-sqlite3`) for preferences, saved layouts, and match
  sources — tested including a simulated "app restart" (re-reading from the same file).
- **Secure API key storage** via Electron's `safeStorage` (OS-keychain backed),
  deliberately kept out of the SQLite database and out of the repository.
- **TypeScript strict mode** across the whole tree — `tsc --noEmit` passes with
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all enabled.
- **Production build pipeline** — `npm run build` (main process → CommonJS) and
  `npm run build:renderer` (Vite/React → static bundle) both succeed and were run
  in this environment.
- **Custom application icon** — designed from scratch (not a stock football emoji),
  rasterized to a real multi-resolution `.ico` (16–256px) in `assets/icon.ico`.

## Implemented but NOT runnable/verifiable in this environment

These are written against the real, documented APIs and are structurally correct,
but this build sandbox is headless Linux with no display server, no Windows, and
no physical monitors — so the following can only be exercised by you, on Windows:

- **Actually launching the Electron window** (`npm start`). The main process code,
  IPC wiring, and preload bridge are complete and typecheck, but I have not seen
  the window render.
- **Real multi-monitor behavior** — `MonitorService` is tested against a fake
  `screen` implementation that mimics Electron's real API shape exactly, but has
  not been exercised against actual connected displays, Windows DPI scaling, or
  physical monitor disconnection.
- **BrowserView embedding of a real stream URL** — `StreamingManager.probeEmbedCompatibility`
  performs a genuine load attempt and inspects Electron's real failure codes
  (e.g. `ERR_BLOCKED_BY_RESPONSE`), but I have not pointed it at a real streaming
  site, because I don't have one and would not scrape/bypass access controls if I did.
  **Expect many streaming sites to fail embedding** — this is expected behavior per
  the spec, and the UI is designed to surface it honestly (the whole reason Mode B exists).
- **External browser window positioning** — `StreamingManager.launchExternal` uses
  Chrome/Edge/Brave's documented `--window-position`/`--window-size` launch flags.
  This reliably positions a *new, dedicated* browser window. It does **not** and
  cannot reposition a tab inside a browser window you already have open — Windows
  only exposes window handles to external processes, not tabs. A native Win32
  helper (`EnumWindows`/`SetWindowPos` by window title) would make *existing*
  windows repositionable too; that's flagged as a Phase-2 enhancement, not built here.
- **Live API-FOOTBALL events** — requires your own API key (free tier: 100
  requests/day, not viable for continuous live polling of multiple fixtures; paid
  tiers required for real use). Without a key, `isConfigured()` returns false and
  the UI says so — it will not pretend to monitor events it isn't actually polling.
- **The Windows installer** — `electron-builder` config targets NSIS/x64 and is
  included (`package.json` → `build`), but producing and running a signed `.exe`
  requires a Windows (or properly configured cross-compilation) host; this sandbox
  can build the JS bundles but not produce/sign a Windows installer artifact.

## Deliberately not built in this initial pass

- Native Win32 window-handle repositioning for pre-existing external browser windows
  (see above) — flagged, not faked.
- DRM/anti-embedding bypass of any kind — explicitly out of scope per the spec and
  per Anthropic's usage policies; the app detects and reports these restrictions
  instead.
- Video replay/footage capture of goals — the overlay system switches between the
  user's own live feeds; it does not record, download, or rebroadcast any
  broadcaster's footage.

## Test execution record

```
Test Suites: 5 passed, 5 total
Tests:       86 passed, 86 total
Time:        ~4s
```
Run yourself with `npm test`. One real bug (a race condition in an idempotency
test, caused by not flushing microtasks between two `start()` calls) was found
and fixed during this build — see `tests/eventMonitor.test.ts` git history if
you restore version control.
