> ## Look to your right dummy. Do you see the **Releases** button?
> Click it because there is where the app is and you download that. Do that unless you are a developer and know how to clone repos to make them run on your machine locally instead of electron builder blah blah blah. Just click the **Releases** button and watch your 8 plus matches for free with no ads.

# MatchView

Multi-match football viewing desktop application for Windows. Built with Electron, TypeScript, React, Zustand, and SQLite.

MatchView is a client-side layout and viewing engine. It does not host, restream, or retransmit video content. Users input or share links from external broadcasting providers; MatchView renders each stream into an isolated, ad-blocked view tile on your chosen monitor.

---

## Features

- **Multi-Match Tiling**: View up to 5 concurrent matches (side-by-side, stacked, 3-primary, 4-grid, 5-primary focus) with automatic display-aware aspect ratios.
- **Aggressive Ad & Popup Blocking**: Built-in popup suppression (`setWindowOpenHandler({ action: "deny" })`) and network-level ad/tracker filtering in a dedicated partition (`persist:streams`).
- **Persistent Sessions**: Navigating back to Sources hides rather than destroys BrowserViews. Stream connections, authentication cookies, and CAPTCHA solutions stay alive without reloading.
- **Link Discovery & Sharing**:
  - Local Network (LAN) discovery via UDP multicast (`239.255.42.99:47698`) with zero central servers.
  - Portable base64 share codes for copying and sharing match links across platforms (chat, Discord).
  - One-click "Watch in MatchView" import directly from the Discover catalog.
- **Live Goal & Card Overlays**: Optional background polling via API-FOOTBALL with encrypted key storage (`safeStorage` / DPAPI). Automatically highlights the active match tile when a goal occurs.

---

## How Link Sharing Works

1. MatchView does not host streams. Users who find or subscribe to a match URL (e.g. Manchester United vs Liverpool) can post it to **Discover Matches**.
2. Posted links appear instantly in the local Discover catalog and broadcast across the local network.
3. Other viewers can:
   - Click **Copy Link** to copy the original broadcaster URL to clipboard.
   - Click **Watch in MatchView** to auto-load the link into their session.
   - Paste links manually into **Sources** (`Home Team vs Away Team` + `Stream URL`).
4. Hitting **Start session** renders each match in its own hardware-accelerated tile directly from the original source.

---

## Developer Setup

### Prerequisites

- Windows 10 or 11
- Node.js 18+ (tested on Node 22 and 24)
- Visual Studio C++ Build Tools (required by `better-sqlite3` native compilation)

### Install Dependencies

```bash
npm install
```

*Note: Native compilation is handled automatically through `node-gyp` with overridden modern toolchain support.*

### Running in Development

```bash
npm run build           # Compiles main process TypeScript -> dist/
npm run build:renderer  # Bundles React frontend via Vite -> dist/renderer
npm start               # Launches Electron application
```

For hot-reload UI development:
```bash
npm run dev:renderer    # Vite dev server
```

### Running Tests

```bash
npm test                # 87 Jest tests across layout, monitor, persistence, and event scheduler
npm run typecheck       # Strict TypeScript verification across main, renderer, and shared
npm run lint            # ESLint rules check
```

*The `pretest` hook automatically manages the `better-sqlite3` ABI between Node and Electron.*

### Packaging Installer

```bash
npm run rebuild:electron   # Rebuild native modules for Electron ABI
npx electron-builder --win # Produces release/MatchView Setup 0.1.0.exe (NSIS)
```

---

## Project Structure

```
src/
  main/
    discovery/         LAN UDP multicast and share-code codec
    events/            API-FOOTBALL poller and overlay scheduler
    monitors/          Windows display enumeration and resolution detection
    persistence/       SQLite storage (better-sqlite3) and DPAPI secure config
    streaming/         BrowserView manager, layout positioning, ad-blocking
    main.ts            Electron entry point and IPC registry
    preload.ts         Context bridge exposing matchview API to renderer
  renderer/
    screens/           Dashboard, SessionConfig, LiveViewing, Discovery, Settings, Events
    layout/            Tiling math, aspect-ratio fitting, and priority slot allocation
    store/             Zustand state store
  shared/
    types.ts           Shared data structures, event definitions, layout contracts
tests/                 Unit and integration tests (layoutEngine, eventMonitor, persistence, etc.)
```

---

## License

MIT
