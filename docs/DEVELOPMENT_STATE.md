# Gameplay overhaul checkpoint

Gameplay checkpoint `b67049c`, based on `588a48f`. The game builds and runs. The [next-phase plan](NEXT_PHASES.md) gives the implementation order and acceptance checks for the remaining work.

## Combat baseline checkpoint (this build)

Phase 1 tooling is in place. The deterministic combat core was extracted and
tested, and the F3 overlay can now frame-compare combat internals against the
presentation layer. GitHub Pages hosting and CI landed with it.

Changes:

- `src/game/combat.ts` is the pure combat core: `MeleeTimeline` (phases,
  buffering, combo, per-swing hit registry), `ChargeTracker`,
  `meleeCadenceFor`/`meleeSectorFor` (typed weapon cadence and hit areas from
  the new `MELEE` config block), `inMeleeSector` geometry, and
  `projectileStepCount` stepping. `Player` and `Projectile` consume it, so the
  test suite exercises shipping code.
- `scripts/combat.test.ts` adds 24 deterministic tests: input buffering
  (early, late, expired), exact cooldown expiry, dodge cancels in windup/
  active/recover with buffer clearing, interrupted charging, combo cycling and
  idle reset, sector entry/exit with at-most-one hit per target per swing,
  point-blank and two-enemy piercing shots, wall and diagonal-corner checks at
  8/16/33/50 ms frame intervals, and temporary seals blocking damage from the
  barrier's far side (then clearing).
- F3 now draws the melee sector (gold windup ghost, red active arc, dim
  recovery), the projectile sweep capsule for the frame, and enemy telegraph
  warning areas with a windup-progress ring (`debugMelee()` on Player,
  `debugTelegraph()` on Enemy).
- Static GitHub Pages export (`bun run build:pages`) with the `/Riftbound`
  base path wired into the Phaser loader and every React overlay icon via
  `src/lib/assetPath.ts`; `public/.nojekyll` ships with the export. CI
  (lint, prisma generate, tests, Pages build, artifact checks, `tsc`) and
  the Pages deploy workflow run on every push to `main`.

Validation:

- `bun install`, `bunx prisma generate`, `bun run lint`, `bun x tsc
  --noEmit`, `bun test` (28 tests, 35,497 assertions), `bun run build`
  (standalone) and `bun run build:pages` (static export) all pass on a fresh
  clone.
- The static export was served under `/Riftbound/` (scripts/serve-pages.ts)
  and driven in headless Chromium: menu renders, pacts screen, run start,
  WASD movement, melee, fireball, dodge, pause and resume all work with zero
  page errors and zero console errors, with `/Riftbound`-prefixed asset URLs.
- The F3 overlay was exercised on the dev server during live combat; the
  melee sector, player/enemy bodies, and warning areas render as designed.

Outstanding (per the plan): unassisted full runs per weapon with clear-time
and death-cause recording, windup/timing tuning informed by those runs, and
the phase 1 acceptance recording of one unassisted completion per weapon.

## Playable changes

- Combat uses pixel-to-tile ray traversal, short projectile travel steps, a 160 ms melee buffer, active-frame damage, locked swing direction, acceleration and braking. Dodge cancels a swing. Development F3 shows feet, hurtboxes, projectiles and sealed tiles.
- The Pact screen offers a Warden Sword and two permanent weapon unlocks at 12 and 30 accumulated shards. Reach, sweep, damage and cadence differ. Starting weapons persist through continue and restart. Tap 2 to cast Arcane Bolt or hold 650 ms for extra damage and one additional pierce at a six-mana premium. Frost Nova can cash out a burning target's remaining burn.
- Generation rejects disconnected slot graphs, prevents row-wrap edges, joins corridor bends, varies mirrored cover arrangements and can replace a second treasury with a healing sanctuary. Generated enemies, chambers and interaction targets must be reachable. Gates seal movement and line of sight during encounters.
- Champions and the final boss blink onto supported ground inside their arena. Summon caps consider the current room. Boss bolts and spikes respect damage pacts. Enemy gold piles split the rolled base bounty exactly. The original pickup-time gold multiplier still rounds each pile.
- The HUD shows a portrait, objective, remaining encounter enemies and charge progress. The map shows sealed gates and aim direction. It redraws from the existing scene feed. Upgrade cards show the next rank. Save reads share one validator with defaults for older saves. Room timers pause with gameplay. Floor teardown releases decorations and cancels floor events.

## Validation

- Fresh-clone baseline: lint passed after dependency installation. TypeScript required Prisma client generation. Next compiled, but the original shell copy step failed on Windows. The packaging step now uses Node filesystem APIs. Bun ran from the npm cache; project dependencies and the lockfile were preserved.
- Final checks: `bun run lint`, `bun x tsc --noEmit`, `bun run build` passed. `bun test` passed four cases with 35,316 assertions. The independent flood fill checked 128 seeds across three floors, including gates, enemies and interactive targets.
- Headless Chrome production build: UI launch, shard eligibility and weapon selection, movement, melee, charged bolt, dodge, expanded map, pause clock, continue with restored weapon, death and restart. Script-assisted chamber clear, frost/burn damage, coin collection, boss phase two, boss death, final portal and victory all passed with zero uncaught page errors. The test used controlled positioning and damage for encounters. HUD inspected at 1366 x 768; later smoke steps ran at 1920 x 1080.
- Five consecutive seed-42 restarts each ended with 893 Phaser display objects in the final smoke run. This measures display-list growth only. Local CPU generation benchmark: six alternating warm passes of 384 floors, median 202 ms on the original generator and 100.5 ms on the revised generator. Hardware frame pacing, GPU memory and audible mix remain unmeasured.

## Remaining priorities

1. Play full unassisted runs on each weapon, including Fury phase three, and tune enemy windups, navigation around cover, charge trade-offs, boon frequency and shard thresholds.
2. Add authored optional challenges, trap/secret routes, biome-specific room dressing and additional enemy attack patterns. Expand weapon-specific animation and audio using the existing manifests.
3. Finish the shop, inventory and end-screen design pass, keyboard-only traversal and reduced-flash review. Exercise saves from real prior releases and sustained combat on physical GPUs.

Core files: `src/game/scenes/game.ts`, `src/game/entities/`, `src/game/sight.ts`, `src/game/dungeon/`, `src/game/run.ts`, `src/game/config.ts`, `src/lib/gameStore.ts`, `src/components/game/` and `scripts/gameplay.test.ts`.
