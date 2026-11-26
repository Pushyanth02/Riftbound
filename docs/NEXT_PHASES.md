# Riftbound development plan after the Descent overhaul

Start from gameplay commit `b67049c`. The highest-value next milestone is an unassisted three-floor descent with each weapon. That exercise will show which deaths come from player decisions, which come from unclear tells, and which rooms break the pace. Use those observations to choose balance changes before adding encounters.

The [development checkpoint](DEVELOPMENT_STATE.md) records the build, automated seed sweep and scripted browser runs already completed. All work below is planned. Each phase ends with a playable build and a short checkpoint recording the seeds, changes, evidence and outstanding defects.

## 1. Combat feel and an unassisted baseline

**Status: tooling delivered, unassisted baseline outstanding.** The
deterministic combat core (`src/game/combat.ts`) is extracted and shared by
the entities and `scripts/combat.test.ts` (24 tests: buffering, cooldown
expiry, dodge cancels per swing phase, interrupted charging, arc
entry/exit, one-hit-per-swing, point-blank and piercing shots, corner and
seal checks across frame intervals). F3 draws the melee sector, projectile
sweep and enemy warning areas, and melee timings/hit areas now live in the
typed `MELEE` config block. Remaining for acceptance: the unassisted
weapon playthroughs below, the damage/crit frequency measurements, and any
resulting tuning changes - the defaults are unchanged until those runs
justify a change.

**Deliverable.** A reproducible combat test set and a tuned sword, knife and cleaver. Start in `entities/player.ts`, `entities/objects.ts`, `sight.ts` and `config.ts` under `src/game`.

1. Pick reproducible seeds containing a narrow doorway, a pillar fight, a champion and the final arena. Play each weapon on a shared seed without teleporting, granting resources or changing enemy HP. Repeat the hardest encounter with Fury enabled. Record clear times, damage taken, missed inputs, mana starvation and the cause of each death.
2. Add deterministic tests around early and late input buffering, cooldown expiry, dodge during each swing phase, interrupted charging, and a target entering or leaving the slash arc. Exercise point-blank shots, piercing shots crossing two enemies, diagonal wall corners and temporary seals at multiple frame intervals. *(delivered - see `scripts/combat.test.ts`)*
3. Extend F3 to draw the active melee sector, projectile sweep and enemy warning area. Compare the first damaging frame with the sprite, sound and effect. Tune timings and hit areas in typed configuration. Measure damage and critical-effect frequency over a complete combo before changing weapon multipliers. *(overlay + typed config delivered; measurements and tuning pending the playthroughs)*

**Acceptance.** One swing hits each target at most once. A visible barrier blocks damage from its far side. Dodge and pause have predictable effects on charge, recovery and queued inputs. Record one unassisted completion per weapon or preserve a reproducible blocker for the next tuning pass. *(the first two sentences are now covered by automated tests; the unassisted completions are not)*

## 2. Room placement, optional routes and the map

**Depends on phase 1.** Keep the slot graph, seeded RNG, builder and walkability grid. Work in `dungeon/generator.ts`, `dungeon/builder.ts`, the scene and `MinimapCanvas.tsx`.

1. Define room-template data for entrances, enemy slots, solid footprints, visual decorations and reward anchors. Reserve gate thresholds, boss landings and interaction approach tiles before dressing a room. Add a small set of recognizable layouts per biome using the existing terrain and prop manifests.
2. Build one optional timed challenge, one telegraphed trap chamber and one discoverable secret reward branch. Give each an entry cue, an exit condition, a reward budget and a route around it. Keep the main objective reachable if the player skips or fails every optional encounter.
3. Derive map markers from live room state. Show a reward clue before a route decision, a seal during combat and a consumed marker after interaction. Make the expanded legend match the shapes on the map. Invalidate cached geometry when topology changes and update the player marker independently.
4. Extend the existing independent flood-fill test to include interaction approach tiles, entire solid footprints, gate clearance, optional-route bypasses and post-clear exits. Force the retry limit in a fixture to exercise the fallback.

**Acceptance.** Run at least 128 seeds on each floor. Print the seed, floor, room and coordinates on failure. Play one example of each new room and confirm the live gate, reward and exit states against the expanded map.

## 3. Enemy roles, bosses and encounter pacing

**Depends on phase 2** for stable placement and arena boundaries. Extend the state machines in `entities/enemy.ts` and encounter orchestration in `scenes/game.ts`.

1. Exercise existing rushers, ranged foes and casters around cover first. Add bounded path recovery for a stuck enemy and test enemies approaching a pillar on the same axis. Use room-local spawn budgets and separation so a wave leaves room to dodge.
2. Introduce two distinct counters first: a shielded guard that exposes its flank after a committed attack, and a summoner with an interruptible cast and a room-local summon cap. Compose these with existing enemies. Scale later floors through combinations, aggression and attack selection.
3. Give each champion and each Necromancer phase a recognizable tell, an attack commitment, a recovery window and a legal escape route. Check delayed volleys, ground hazards and transformation events when interrupted, paused, defeated or torn down. Pace overlapping hazard areas so a dodge can reach safe ground.

**Acceptance.** Script every boss threshold including Fury phase three; then play that phase unassisted. Observe boss-bar transitions, interrupted summons, room unlock and exactly one final reward. Repeated summons, deaths and restarts must leave no attacks active in the following room.

## 4. Builds, chamber rewards and the economy

**Depends on phases 1–3** for weapon cadence, room difficulty and realistic clear times. Work in `config.ts`, `run.ts`, loot entities, the shop and save handling.

1. Audit each upgrade, pact, relic and boon against an observable gameplay effect. Include stacking caps, potion and shrine healing, critical follow-ups and the cost and payoff of quenching a burn. Add focused tests for effects whose descriptions and implementations disagree.
2. Offer a chamber choice between immediate recovery, currency and a build upgrade. Add a limited shop reroll with a visible price and stable offers until purchased or rerolled. Preview the actual stat delta or conditional effect. Exhausted reward pools need an explicit fallback.
3. Apply gold modifiers once to the total bounty before splitting piles. Exercise small rewards under Barren Halls and bonus-gold relics. Check purchase and grant paths for double activation. Compare gold earned, affordable purchases and shard milestones on the baseline seeds before tuning thresholds.
4. Preserve the selected weapon and earned progression across continue. If new state changes checkpoint meaning, version the format, supply defaults for older records and validate before writing. Test real prior-release fixtures, missing optional fields, malformed records and reloading immediately after a transaction.

**Acceptance.** Complete a melee-critical build and an elemental build. Demonstrate the defining effects against live enemies. Verify one purchased upgrade, one reroll, one exhausted offering and one old save end to end, including the resulting balances.

## 5. Screen design, accessibility, art and audio

**Depends on phase 4** for final costs, rewards and stat descriptions. Use the existing overlays, art-direction guide, nearest-neighbor rendering and licensed manifests.

| Surface | Work and verification |
|---|---|
| Menu, loading and Pact | Make continue state, weapon eligibility, pact cost and bounty legible. Test first launch, slow asset loading, keyboard selection and returning to the menu. |
| HUD, map and inventory | Keep objectives and boss health clear of vitals and the map. Show mana, cooldown, active status and keybinding in readable form. Check long item names, populated builds and expanded-map focus. |
| Shop, boon and level-up | Make price, current effect, proposed change, synergy and sold state visible before selection. Keep focus inside dialogs and return it on close. Verify number shortcuts cannot also cast a spell. |
| Pause, settings and summaries | Exercise keyboard-only navigation, saved volume, reduced flashes, screen shake and readable HUD scale. Explain death, victory, shard earnings and newly unlocked weapons in the run summary. |
| World presentation | Match feet and shadows to terrain, audit prop depth at doorways, and use existing assets to distinguish attack tells from ambient effects. Listen to cast, impact, recovery and boss transitions on speakers and headphones. |

**Acceptance.** Review captures at 1280×720, 1366×768 and 1920×1080. Finish menu → run → upgrade → pause → summary using the keyboard for every overlay. Record clipping, focus, contrast, audio and reduced-effects findings separately from combat balance.

## 6. Integrated QA and release candidate

1. Run `bun test`, `bun run lint`, `bun run build` and `bun x tsc --noEmit`. Run TypeScript after the build so Next has finished generating its types. Generate the Prisma client on a fresh checkout when required.
2. Exercise production entry points for new run, continue, optional-room failure, shop, boon choice, phase changes, death, victory and restart. Keep controlled-state browser fixtures for edge cases alongside unassisted playthrough records.
3. Profile a populated arena, a boss volley and repeated floor transitions on physical integrated graphics. Record hardware, viewport, seed, renderer, median and p95 frame time, live entities, scene objects and listener counts. Compare against the same encounter on the checkpoint build. Report software-rendered browser measurements separately.
4. Recheck every critical defect with its original seed or save. Update the development state and quality report with commands, results, measurements and any unexecuted manual checks.

**Release decision.** Resolve reproducible crashes, softlocks, unreachable mandatory content, duplicate rewards and lost saves before release. Record any remaining lower-impact defects with reproduction steps. The next session starts with phase 1.
