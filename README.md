# Duo Arcade

**A shared game table for two — wherever you are.**

Duo Arcade is a polished, no-sign-up arcade for Web and iPhone. Create a private room, send a six-character code to a friend, and play competitive or cooperative games across devices. Prefer to play immediately? Every game also supports an adaptive AI opponent or teammate.

[Play the current web release](https://duo-arcade.yimgyan.workers.dev)

## Version 1.0

- iOS marketing version: `1.0`
- iOS build: `1`
- Workspace packages: `1.0.0`
- Realtime service release: `1.0`
- Shared network protocol: `27` (kept separately for backwards-compatible multiplayer)

## What is included

- 28 complete competitive and cooperative games
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

| Competitive | Cooperative |
| --- | --- |
| Gomoku | Split Maze |
| Reversi | Sync Tap |
| Cover Hunt | Starship Defuse |
| Quantum Duel | Starway Escort |
| Gravity Beat | Orbital Repair |
| Shadow Shuttle | Echo Relay |
| Meteor Dash | Core Rally |
| Trajectory Intercept | Skyline Rescue |
| Neon Dash | Dual Thrusters |
| Signal Bluff | Fog Sonar |
| Nova Volley | Storm Grid |
| Pulse Pass | Star Trace |
|  | Magnet Haul |
|  | Lumen Bridge |
|  | Prism Heist |
|  | Drop Rescue |

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
- `docs` — product, game, architecture, accessibility, QA, and release documentation.

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

With the local Worker running, the three smoke suites exercise HTTP behavior, every AI configuration, and real two-client WebSocket sessions:

```bash
pnpm smoke:http
pnpm smoke:ai
pnpm smoke:realtime
```

The realtime smoke suite creates actual rooms for all 28 games and verifies private-state isolation, disconnect recovery, duplicated and out-of-order actions, rematches, and rolling protocol compatibility.

## Repository status

Version 1.0 is the source release in this repository. The existing production URL and stable internal identifiers remain unchanged so installed clients, room links, and iOS upgrades continue to work. Publishing a new Web deployment or App Store build is a separate release operation.
