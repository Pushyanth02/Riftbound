# Contributing to RIFTBOUND

Thanks for wanting to help. This document covers the workflow, conventions
and the bar a change needs to clear before it lands.

## Getting set up

```bash
bun install
bun run dev          # dev server on http://localhost:3000
```

Requirements: Node 20+/Bun, a WebGL-capable browser for manual testing.

## Project layout

| Path | What lives there |
|---|---|
| `src/game/` | Phaser engine code - scenes, entities, dungeon, audio, fx |
| `src/components/game/` | React overlays - menus, HUD, modals |
| `src/lib/gameStore.ts` | Zustand store + the bus bridge (game to React contract) |
| `src/game/types.ts` | The shared game/UI contract - change this deliberately |
| `public/assets/` | Processed sprites and manifests (do not hand-edit) |
| `scripts/asset-tools/` | The asset pipeline that generates `public/assets` |
| `docs/` | Design docs, QA and performance notes |

## Workflow

1. Fork / branch from `main`.
2. Make your change. Keep the game/UI boundary clean:
   - Game code talks to React **only** through the typed event bus.
   - React talks to the game **only** through `bus.cmd` commands.
   - New events need a type in `src/game/types.ts` and a mirror field in
     `src/lib/gameStore.ts`.
3. Verify locally:

   ```bash
   bun run lint
   bunx tsc --noEmit
   ```

4. Play the golden path before opening a PR: menu -> new run -> pact ->
   clear a room -> pick up loot -> level up -> pause/resume -> die or
   descend. The game must not throw console errors during this loop.
5. Open a PR describing what changed and why, with screenshots or a short
   clip for anything visual.

## Conventions

- **TypeScript strict** everywhere; no `any` unless you are wrapping an
  untyped third-party seam, and then narrow it immediately.
- **No per-frame allocations** in `update()` paths - use module-scratch
  objects, in-place array compaction, or pooled sprites. See
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md) for the patterns already in
  place.
- **Frame-rate independence**: scale all movement by `dt/1000`; friction
  and decay must be exponential, not per-frame multiplicative.
- **Accessibility**: interactive overlays need keyboard paths and ARIA
  labels; the HUD is read by screen readers via `role` and `aria-live`.
- **Styling** uses Tailwind plus the game's `rb-*` classes in
  `src/app/globals.css`. Do not introduce new design languages - extend
  the existing one (see [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md)).
- **Assets** are never hand-copied into `public/assets` - add or change the
  source pack, then re-run the pipeline script and commit its output.
- **No test files** in this repo - verification is lint, typecheck, and the
  manual golden path above.

## Performance bar

A change that costs frames needs to justify itself:

- New sprites in the update loop: static per floor, or dynamically pooled?
- New HUD payload fields: emitted at 10 Hz only if they change at that
  rate; anything slower should be event-driven.
- New audio cues: reuse the shared noise buffer and oscillator helpers.

## Reporting bugs

Open an issue with: browser + OS, what you did (seed if known), what
happened, what you expected, and the console output. The game logs boot
errors to the loading screen - include that text if it appeared.
