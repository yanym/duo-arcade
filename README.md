# Duo Arcade

**A shared game table for two — wherever you are.**

Duo Arcade is a polished, no-sign-up arcade for Web and iPhone. Create a private room, send a six-character code to a friend, and play competitive or cooperative games across devices. Prefer to play immediately? Every game also supports an adaptive AI opponent or teammate.

[Play the current web release](https://duo-arcade.yimgyan.workers.dev)

The working branch contains a curated game-library update that has not yet been deployed. The live web release may still show the previous library. Native cross-platform acceptance and release packaging remain in progress.

## Version 1.0

- iOS marketing version: `1.0`
- iOS build: `1`
- Workspace packages: `1.0.0`
- Realtime service release: `1.0`
- Shared network protocol: `28` (version 27 remains supported for games it understands; Ember Crew requires version 28)

## What is included

- 10 playable games in the current working catalog, including the new cooperative Ember Crew
- Friend rooms and instant solo play with adaptive AI
- Cross-platform play between Web and iPhone
- Private room codes with no account required
- Server-authoritative rules, timing, scoring, and results
- Ready states, turn feedback, reconnect handling, and rematches
- Adjustable pace, difficulty, strategy, and match length
- English and Chinese interfaces
- Original artwork, music, sound effects, and haptic feedback
- Reduced Motion, increased contrast, keyboard support, and screen-reader semantics

## Game library

Competitive: Gomoku, Reversi, Cover Hunt, Quantum Duel, Meteor Dash, Neon Dash, Signal Bluff, Nova Volley, and Pulse Pass.

Cooperative: **Ember Crew**. Plan independently on a shared rescue board, coordinate firefighting and movement, share limited water, and bring residents back to safety. Plans remain visible and revisable until each player confirms. An AI teammate adapts to your plan and confirms after you.

Nineteen instruction-relay, repetitive, or weaker games have been removed from new-room creation. Existing running rooms can still reconnect and finish; retired games cannot start a new round. Legacy identifiers remain decodable so the catalog change does not strand saved sessions.

## How multiplayer works

1. Choose a game.
2. Create a private room and share its six-character code.
3. Your friend joins from Web or iPhone.
4. Both players confirm they are ready.
5. The server validates each action and synchronizes both screens.
6. If a player briefly disconnects, the match pauses and can resume on the same device.

Room credentials are generated from secure random values. Only SHA-256 credential digests are stored by the service, and credentials are never placed in invitation URLs.

## Architecture

```text
Expo + React Native client (Web and iOS)
                    │
              HTTPS + WebSocket
                    │
Cloudflare Worker (API and static web assets)
                    │
       Durable Object per private room
                    │
 Durable Object SQLite snapshots and action IDs
```

- `apps/client` — Expo Router client, game interfaces, tutorials, results, settings, and original media.
- `services/realtime` — Cloudflare Worker, HTTP API, hibernatable WebSockets, and room coordination.
- `packages/game-core` — deterministic rules and AI strategies without UI or networking dependencies.
- `packages/protocol` — shared HTTP/WebSocket types and runtime message validation.

The client submits player intent only. Random layouts, legal actions, timers, scores, private information, and final results are owned by the room's Durable Object.

## Run locally

Requirements: Node.js and pnpm.

```bash
pnpm install
```

Start the realtime service and client in separate terminals:

```bash
pnpm dev:server
pnpm dev:client
```

Open `http://localhost:8081`. The local realtime service runs at `http://localhost:8787`.

For an iPhone on the same network, point `EXPO_PUBLIC_API_URL` to the computer's local network address, then open the project with Expo Go or a development build.

## Quality checks

```bash
pnpm check
pnpm doctor:client
pnpm audit:licenses
pnpm build:web
pnpm build:ios
DUO_SKIP_REMOTE=1 pnpm audit:release
```

With the local Worker running, these suites exercise HTTP behavior, the complete active catalog's two-client scenarios, AI room recovery, and cooperative rescue synchronization:

```bash
pnpm smoke:http
pnpm smoke:realtime
pnpm smoke:ai
pnpm smoke:ember
```

`pnpm test:realtime` uses the actual Workers runtime and SQLite-backed rooms to verify retirement, protocol compatibility, and AI plan revisions across hibernation. `pnpm smoke:realtime` covers all ten playable games, including a full Reversi match with automatic passes and a complete Ember Crew rescue, and preserves privacy, reconnect, duplicate-action, stale-action, and previous-protocol checks. Cover Hunt and Quantum Duel use focused privacy rounds followed by resignation; this script is not a complete usability playthrough of every game. Legacy state recovery retains runtime and engine coverage without recreating retired games.

Run export/build commands before the live smoke suites, not concurrently: writing assets watched by the local Worker can reload the development server and interrupt its sockets. Automated play and passing export checks do not replace human or native-device acceptance.

Board-game pace now persists for every move, including automatic Reversi passes and recovered saved rooms. Runtime tests also cover both players confirming Ember plans from the same version, in either send order and after hibernation, without relaxing stale-action checks.

## Support

See the [support guide](SUPPORT.md) for connection help and how to report an issue.

## Repository status

The app configuration specifies iOS version `1.0`, build `2`, and bundle ID `com.duoarcade.app`. A Release device archive and App Store distribution IPA for build 2 were generated successfully with Xcode 26.6 on September 16, 2026. Build 1 has a historical successful Apple upload record; build 2 upload is blocked by Apple account authentication and has not completed. The Web service is deployed with protocol 28 and ten playable games; production artifact and two-client smoke checks passed. Native touch, lifecycle, and cross-platform acceptance remain partially complete; compilation is not a claim that all games passed. `pnpm build:ios` exports JavaScript/assets; it does not produce a signed App Store archive.

For local native development, `pnpm --filter @duo/client ios:native` generates the native project and builds it with Expo. The existing `ios` command still starts Expo for iOS. Generated `apps/client/ios` files stay untracked; app configuration and config plugins remain the source of truth. Use a checkout outside cloud-synced folders for native compilation: this machine's Desktop sync added Finder metadata to generated frameworks, which caused a code-signing failure. Building an isolated local copy resolved that issue without modifying SDK code or changing global Xcode settings.

Native acceptance must use a normally signed Simulator build, not `CODE_SIGNING_ALLOWED=NO`. A linker-only Simulator executable can launch while lacking the application-identifier entitlement needed by SecureStore; this produced keychain error `-34018` and launch-only room/preferences storage in local testing. Xcode's normal ad-hoc Simulator signing supplies the simulated application identifier. This is separate from distribution signing and does not produce an App Store archive. Native-to-Web rescue and background/foreground recovery have been exercised. The normally signed build now also preserves language, reduced motion, room credentials and a three-stone Gomoku position across process termination/relaunch. A native fractional-width grid-wrapping defect was repaired and verified by coordinate taps and a complete nine-move Web–iOS Gomoku match. The remaining native game matrix, broader touch ergonomics and large-text acceptance are still in progress.

Further native–Web playthroughs completed Reversi (60 moves and four automatic passes), Cover Hunt (both roles, scans and shots), and Quantum Duel (all moves, hidden choices and a tied match). Cover Hunt's cropped native arena and the off-screen Quantum Duel controls were repaired and checked in actual Simulator play. Small-screen home layouts now prioritize creating or joining a room, and game cards retain only the useful selected-state badge. Web screenshots were reviewed at 320×740, 390×844 and 1024×1366; this does not replace remaining iOS device and large-text acceptance.
