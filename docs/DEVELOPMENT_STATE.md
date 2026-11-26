# Gameplay overhaul checkpoint

Gameplay checkpoint `b67049c`, based on `588a48f`. The game builds and runs. The [next-phase plan](NEXT_PHASES.md) gives the implementation order and acceptance checks for the remaining work.

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
