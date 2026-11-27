# Gameplay overhaul checkpoint

Gameplay checkpoint `b67049c`, based on `588a48f`. The game builds and runs. The [next-phase plan](NEXT_PHASES.md) gives the implementation order and acceptance checks for the remaining work.

## Phases 2-6 checkpoint (this build)

The phase 2-6 pass landed room templates with reserved thresholds, the
three optional routes, live map markers, the two enemy counters, the
chamber-reward economy, the versioned save format and the keyboard-driven
overlay layer. All validation below ran on this build.

Changes:

- **Room templates & reservations** (`dungeon/generator.ts`): authored
  `TEMPLATES` (twin aisles, staggered cover, broken colonnade, watch pillar,
  sanctum, trial ring, spike gallery, vault, reliquary) drive per-room
  dressing; gate thresholds (gate tiles + 1-tile ring), the boss landing
  zone and interaction approach tiles are reserved before any prop, pillar
  or spawn is placed.
- **Optional routes** (phase 2): the timed challenge room (gate seals,
  32 s trial, fails open with no reward so the route always continues,
  guaranteed relic + gold + souls on success), the trap chamber (4-6
  telegraphed floor plates on a warn 850 ms -> fire 300 ms -> cool 1.5 s
  cycle, never locks, guarded chest) and the secret branch (cracked wall
  mouth in a free slot, isolated behind solid topology until broken, boon
  shrine + bounty + souls inside, dashed `?` map clue beforehand).
- **Map** (phase 2): icons derived from live room state (challenge
  hourglass, trap spikes, secret `?`, cache diamond; consumed after
  looting), hidden secret corridors, hint outlines, and a minimap
  fingerprint that includes seal count, hints and door state so topology
  changes invalidate the cached geometry; the player marker still emits
  every tick. The legend now draws the same shapes as the map.
- **Enemy counters** (phase 3): the Crypt Sentinel (`GUARD` config - 65%
  frontal damage reduction, committed bash with decaying momentum, 1.5 s
  exposed flank at +50% damage taken) and the Rift Chanter (`CHANTER`
  config - 2.4 s interruptible cast, any hit staggers 620 ms and forces a
  110 px retreat, room-local summon cap counting every resident, 3-bolt
  volley at cap). Both join the floor 2/3 pools.
- **Path recovery & pacing** (phase 3): bounded 900 ms detours around
  same-axis pillars; room spawn budget capped at `ROOM_ENEMY_CAP = 8`;
  staggered activation cascade (~340 ms per enemy); champion/boss delayed
  volleys and hazards guarded by an action sequence id so interrupts,
  phase changes and deaths cancel them; boss bursts spread on rings with
  guaranteed safe ground; phase transitions re-emit the boss bar on the
  frame they happen.
- **Economy** (phase 4): combat clears end in the chamber choice
  (recovery / currency / build, concrete payoff previews, explicit
  exhausted-pool fallback) while champion sanctums keep a patron altar;
  merchant offers are stable per floor with a limited reroll (2 stock,
  12 + 8/step gold, visible price) and stat-delta previews; `splitBounty`
  applies gold modifiers exactly once to the rolled bounty before
  splitting (Barren Halls / Grave Bell / both tested).
- **Saves** (phase 4): `SAVE_VERSION = 2`; version-less v1 records load
  with defaults, newer versions are refused; a checkpoint must survive its
  own `parseSave` round-trip before it may replace the last good save.
- **Overlays** (phase 5): every choice surface is keyboard-traversable
  (arrows / numbers / Enter / Esc); the HUD carries a live trial countdown
  with a `role="timer"` chip; the shop exposes previews and the priced
  reroll.

Validation:

- `bun run lint`, `bun x tsc --noEmit`, `bun test scripts/` (33 tests,
  60,889 assertions), `bun run build` and `bun run build:pages` all pass
  on a fresh clone after `bun install` + `bunx prisma generate`.
- The generator test suite now covers: 128 seeds per floor with secret
  doors closed (main objective reachable) and open (branch reachable),
  interaction approach tiles, entire solid footprints, gate clearance, the
  deterministic fallback (`maxAttempts: 0`), optional-room generation
  rates, the gold split invariants, the full upgrade/relic/boon/pact audit
  and the save-versioning fixtures (v1 fixture, future refusal, malformed
  records, round-trip).
- The test-driven audit caught one real defect: `fireSplash` was read
  from raw stacks in the player instead of the derived-stats pipeline;
  `fireSplashMult` now lives in `DerivedStats`.
- The generation isolation invariant caught a second real defect during
  development: a slot-index wrap-around could connect the secret branch to
  a non-adjacent host with a map-spanning corridor; neighbor candidates
  are now bounds-checked and the closed-fill isolation is validated.
- Static export (`bun run build:pages`) served under `/Riftbound/`
  (scripts/serve-pages.ts) and driven in headless Chromium: menu renders,
  pact screen, run start, HUD, pause and resume, zero console errors.
- Scripted state checks on the dev server (dev-only `window.__riftbound`
  handle): chamber choice opens on combat clear and pays out via the
  number keys; the challenge room seals, counts down on the HUD and pays
  on an in-time clear; the trap chamber arms plates only while the player
  is inside (and they damage a stationary player); the cracked wall
  prompt, interaction and walkable-grid flip all work (tiles 0 -> 1,
  corridor revealed, branch discovered); the shop reroll twice then
  reports stock exhausted; the sentinel measured exactly 65% frontal DR,
  +50% exposure damage after its bash; the chanter's cast staggered and
  retreated 110 px on an 8-damage interrupt and its summons held the
  room-local cap; restart teardown leaves no enemies behind (25 -> 0 ->
  fresh spawns observed).

Outstanding (per the plan): unassisted full runs per weapon with clear-time
and death-cause recording (phase 1 acceptance), unassisted pacing reads of
the new optional rooms, the unassisted Fury phase-3 playthrough, the
baseline-seed economy comparison, the two full build playthroughs, the
1280×720 / 1366×768 / 1920×1080 capture review and the speaker/headphone
audio pass, plus profiling on physical integrated graphics.

## Combat baseline checkpoint

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
