# MatchView

Professional multi-match football viewing desktop application for Windows.
Electron + TypeScript + React + Zustand + SQLite.

See `LIMITATIONS.md` for an honest account of what's tested-and-working vs.
what needs a real Windows machine / API credentials / streaming URLs to verify.

## Requirements

- Node.js 18+ (built/tested here with Node 22)
- Windows 10/11 for actually running and packaging the app
- (Optional, for live goal overlays) an API-FOOTBALL API key — https://www.api-football.com/

## Setup

```bash
npm install
```

`better-sqlite3` is a native module; `npm install` compiles it for your platform
automatically via node-gyp/prebuild-install. If that fails on your machine you
likely need the Visual Studio Build Tools (Windows) or an equivalent C++ toolchain.

## Running in development

```bash
npm run build          # compiles src/main + src/shared -> dist/
npm run build:renderer # bundles src/renderer -> dist/renderer via Vite
npm start               # runs electron against the compiled output
```

(`npm start` currently chains `build` + `electron .`; run `build:renderer` once
beforehand, or add it to the `start` script if you want a single command — it
was kept separate here so renderer iteration can use `npm run dev:renderer`
with Vite's dev server instead, if you prefer hot reload while working on UI.)

## Running tests

```bash
npm test             # 86 tests, no external services or Windows required
npm run test:coverage
npm run typecheck    # strict TypeScript, whole project
```

All of the above were actually executed during development of this codebase
(not just written) — see `LIMITATIONS.md` for the exact output.

## Configuring live goal overlays

1. Get an API-FOOTBALL key (note their free tier is 100 req/day — not enough for
   continuous polling of several live fixtures; you'll likely want a paid tier
   for real use).
2. Launch the app → Settings → Event API → paste the key → Save. It's encrypted
   at rest via Electron's `safeStorage` (Windows DPAPI) in your user-data folder,
   never written to the SQLite database or the repo.
3. In Session Config, when adding a match, you'll eventually want to link it to
   a provider fixture id (the API-FOOTBALL fixture id for that game) so detected
   events are matched to the right viewing tile — the data model
   (`MatchSource.providerFixtureId`) supports this; wiring a fixture-search UI
   into Session Config is a natural next increment.

## Packaging for Windows

```bash
npm run dist:win
```

Produces an NSIS installer under `release/` via `electron-builder`, using
`assets/icon.ico` for both the app and installer branding. This step needs to
be run on Windows (or a configured cross-build host) — see `LIMITATIONS.md`.

## Project layout

```
src/
  main/        Electron main process: monitors, persistence, events, streaming, config
  renderer/    React UI: screens, store, layout engine, styles
  shared/      Types shared between main and renderer
tests/         Jest test suites (layout, monitors, events/overlays, persistence)
assets/        Application icon source (SVG) and generated .ico
```
