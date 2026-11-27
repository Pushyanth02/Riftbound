# Riftbound development plan after the Descent overhaul

Start from gameplay commit `b67049c`. The highest-value next milestone is an unassisted three-floor descent with each weapon. That exercise will show which deaths come from player decisions, which come from unclear tells, and which rooms break the pace. Use those observations to choose balance changes before adding encounters.

The [development checkpoint](DEVELOPMENT_STATE.md) records the build, automated seed sweep and scripted browser runs already completed. Phases 2-6 were delivered in the phase-2-6 pass (see the checkpoint for evidence); each phase still ends with a playable build and the outstanding manual checks are listed inline. The next session starts with the unassisted baseline runs.

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

**Status: delivered.** Room templates (authored pillar arrangements,
decoration sets, reward anchors) drive combat/challenge/trap/secret
dressing; gate thresholds, the boss landing and interaction approach tiles
are reserved before dressing. One optional timed challenge (fails open),
one telegraphed trap chamber (never locks) and one discoverable secret
branch (cracked wall, dashed map clue, isolated behind solid topology)
generate per floor. Map markers are derived from live room state, the
legend mirrors the map's shapes, and the geometry cache invalidates on
topology changes (door state is part of the minimap fingerprint). The
independent flood-fill test covers 128 seeds per floor with doors closed
and open, approach tiles, entire solid footprints, gate clearance and the
fallback path (`maxAttempts: 0`). Remaining: unassisted pacing reads of the
new rooms.

**Deliverable.** Authored layouts, three optional routes with their budgets, live map markers and the expanded generator tests. Start in `dungeon/generator.ts`, `dungeon/builder.ts`, the scene and `MinimapCanvas.tsx`.

1. Define room-template data for entrances, enemy slots, solid footprints, visual decorations and reward anchors. Reserve gate thresholds, boss landings and interaction approach tiles before dressing a room. Add a small set of recognizable layouts per biome using the existing terrain and prop manifests. *(delivered - `TEMPLATES` + `Reservations` in `dungeon/generator.ts`)*
2. Build one optional timed challenge, one telegraphed trap chamber and one discoverable secret reward branch. Give each an entry cue, an exit condition, a reward budget and a route around it. Keep the main objective reachable if the player skips or fails every optional encounter. *(delivered - `OPTIONAL_ROOMS` config, `TrapPlate`/`CrackedWall` entities, challenge state machine in the scene; the 128-seed test proves the objective stays reachable)*
3. Derive map markers from live room state. Show a reward clue before a route decision, a seal during combat and a consumed marker after interaction. Make the expanded legend match the shapes on the map. Invalidate cached geometry when topology changes and update the player marker independently. *(delivered - hint markers, consumed icons, hidden secret corridors, fingerprint includes door/seal state; player marker emitted per tick)*
4. Extend the existing independent flood-fill test to include interaction approach tiles, entire solid footprints, gate clearance, optional-route bypasses and post-clear exits. Force the retry limit in a fixture to exercise the fallback. *(delivered - `scripts/gameplay.test.ts`)*

**Acceptance.** Run at least 128 seeds on each floor. Print the seed, floor, room and coordinates on failure. Play one example of each new room and confirm the live gate, reward and exit states against the expanded map. *(automated half delivered and green; the unassisted example playthroughs are recorded as outstanding manual checks)*

## 3. Enemy roles, bosses and encounter pacing

**Status: delivered (automated + scripted checks; unassisted boss run outstanding).** Two counters compose into the floor 2/3 pools: the Crypt
Sentinel (frontal 65% damage reduction, committed shield bash, 1.5 s
exposed flank at +50% damage taken) and the Rift Chanter (2.4 s
interruptible cast - any hit staggers and forces a retreat - with a
room-local summon cap that counts every resident, plus a bolt volley at
cap). Bounded path recovery routes enemies around same-axis pillars; room
spawn budgets cap at `ROOM_ENEMY_CAP` and enemies wake in a staggered
cascade; champion/boss delayed volleys and ground hazards now die with the
action that queued them (interrupt, phase change, death), boss bursts are
spread on rings with guaranteed gaps, and phase transitions re-emit the
boss bar immediately.

**Deliverable.** Two readable counters, bounded path recovery, room-local budgets and interrupt-safe boss pacing. Extend the state machines in `entities/enemy.ts` and encounter orchestration in `scenes/game.ts`.

1. Exercise existing rushers, ranged foes and casters around cover first. Add bounded path recovery for a stuck enemy and test enemies approaching a pillar on the same axis. Use room-local spawn budgets and separation so a wave leaves room to dodge. *(delivered - `startDetour`/`moveTowardDetour` in `Hostile`, generator budget clamp, activation cascade)*
2. Introduce two distinct counters first: a shielded guard that exposes its flank after a committed attack, and a summoner with an interruptible cast and a room-local summon cap. Compose these with existing enemies. Scale later floors through combinations, aggression and attack selection. *(delivered - sentinel + chanter in pools; scripted browser checks measured exactly 65% DR, +50% exposure, stagger + 110 px retreat and the cap hold)*
3. Give each champion and each Necromancer phase a recognizable tell, an attack commitment, a recovery window and a legal escape route. Check delayed volleys, ground hazards and transformation events when interrupted, paused, defeated or torn down. Pace overlapping hazard areas so a dodge can reach safe ground. *(delivered - actionSeq guards on every delayed callback, ring-spread bursts, >=430 ms hazard spacing, pre-volley tells; an unassisted Fury phase-3 run remains an outstanding manual check)*

**Acceptance.** Script every boss threshold including Fury phase three; then play that phase unassisted. Observe boss-bar transitions, interrupted summons, room unlock and exactly one final reward. Repeated summons, deaths and restarts must leave no attacks active in the following room. *(interrupted-action behavior is scripted-verified; the unassisted phase-3 playthrough is outstanding)*

## 4. Builds, chamber rewards and the economy

**Status: delivered.** Combat rooms now end in a chamber choice (recovery /
currency / build upgrade, each with a concrete payoff preview and an
explicit exhausted-pool fallback); champion sanctums keep a patron altar.
The merchant keeps stable offers per floor with a limited, visibly priced
reroll and stat-delta previews on every ware. Gold modifiers now apply
exactly once to the rolled bounty before splitting (pure `splitBounty`,
tested under Barren Halls, Grave Bell and both together). Saves are
versioned (`version: 2`, v1 fixtures load with defaults, future versions
refused) and a checkpoint is validated through its own round-trip before
it may replace the last good save. The full upgrade/relic/boon/pact audit
is a deterministic test.

**Deliverable.** The chamber choice, a rerollable preview-driven shop, a single-application gold pipeline and a versioned save format. Work in `config.ts`, `run.ts`, loot entities, the shop and save handling.

1. Audit each upgrade, pact, relic and boon against an observable gameplay effect. Include stacking caps, potion and shrine healing, critical follow-ups and the cost and payoff of quenching a burn. Add focused tests for effects whose descriptions and implementations disagree. *(delivered - the audit test caught `fireSplash` bypassing the derived pipeline; fixed and re-verified)*
2. Offer a chamber choice between immediate recovery, currency and a build upgrade. Add a limited shop reroll with a visible price and stable offers until purchased or rerolled. Preview the actual stat delta or conditional effect. Exhausted reward pools need an explicit fallback. *(delivered - `ChamberChoicePanel`, `SHOP` config, relic/upgrade previews; double-buy and reroll-stock guards scripted-verified)*
3. Apply gold modifiers once to the total bounty before splitting piles. Exercise small rewards under Barren Halls and bonus-gold relics. Check purchase and grant paths for double activation. Compare gold earned, affordable purchases and shard milestones on the baseline seeds before tuning thresholds. *(delivered and tested; the baseline-seed economy comparison is an outstanding manual check)*
4. Preserve the selected weapon and earned progression across continue. If new state changes checkpoint meaning, version the format, supply defaults for older records and validate before writing. Test real prior-release fixtures, missing optional fields, malformed records and reloading immediately after a transaction. *(delivered - `SAVE_VERSION`, v1 fixture, malformed-record and round-trip tests in `scripts/gameplay.test.ts`)*

**Acceptance.** Complete a melee-critical build and an elemental build. Demonstrate the defining effects against live enemies. Verify one purchased upgrade, one reroll, one exhausted offering and one old save end to end, including the resulting balances. *(purchase, reroll and old-save paths are scripted-verified; the two full build playthroughs are outstanding manual checks)*

## 5. Screen design, accessibility, art and audio

**Status: delivered for the overlay layer.** Every choice surface (level-up,
boon, chamber, shop, pause, main menu) is keyboard-traversable (arrows,
number keys, Enter, Esc); the shop shows previews and a priced reroll; the
chamber modal previews each payoff; the HUD carries a live trial countdown;
the minimap legend now draws the same shapes as the map; number shortcuts
cannot cast while a modal is open (the game layer rejects input while
paused). Remaining: the capture review at the three resolutions and the
speaker/headphone audio pass.

| Surface | Work and verification |
|---|---|
| Menu, loading and Pact | Make continue state, weapon eligibility, pact cost and bounty legible. Test first launch, slow asset loading, keyboard selection and returning to the menu. *(keyboard selection delivered; first-launch/slow-load retest outstanding)* |
| HUD, map and inventory | Keep objectives and boss health clear of vitals and the map. Show mana, cooldown, active status and keybinding in readable form. Check long item names, populated builds and expanded-map focus. *(trial countdown added, legend shapes matched; long-name and expanded-map focus review outstanding)* |
| Shop, boon and level-up | Make price, current effect, proposed change, synergy and sold state visible before selection. Keep focus inside dialogs and return it on close. Verify number shortcuts cannot also cast a spell. *(previews + focus + reroll delivered; number-shortcut isolation scripted-verified - casts are blocked while paused)* |
| Pause, settings and summaries | Exercise keyboard-only navigation, saved volume, reduced flashes, screen shake and readable HUD scale. Explain death, victory, shard earnings and newly unlocked weapons in the run summary. *(pause keyboard nav delivered; volume/reduced-flash recheck outstanding)* |
| World presentation | Match feet and shadows to terrain, audit prop depth at doorways, and use existing assets to distinguish attack tells from ambient effects. Listen to cast, impact, recovery and boss transitions on speakers and headphones. *(unchanged from the prior checkpoint; audio pass outstanding)* |

**Acceptance.** Review captures at 1280×720, 1366×768 and 1920×1080. Finish menu → run → upgrade → pause → summary using the keyboard for every overlay. Record clipping, focus, contrast, audio and reduced-effects findings separately from combat balance. *(the keyboard golden path was driven headlessly end to end; the resolution captures and audio pass are outstanding manual checks)*

## 6. Integrated QA and release candidate

**Status: delivered for this build.** `bun test`, `bun run lint`, `bun run
build`, `bun run build:pages` and `bun x tsc --noEmit` all pass; the static
export was served under `/Riftbound/` and driven in headless Chromium
(menu → pact → run → pause → resume, zero console errors) alongside the
development server where the scripted state checks ran (chamber choice,
challenge timer, secret door topology flip, shop reroll stock, guard DR /
exposure, chanter interrupt / cap). Production entry points for the new
features were exercised; profiling on physical integrated graphics and
real prior-release saves on a real browser profile remain outstanding, as
does the unassisted playthrough recording.

1. Run `bun test`, `bun run lint`, `bun run build` and `bun x tsc --noEmit`. Run TypeScript after the build so Next has finished generating its types. Generate the Prisma client on a fresh checkout when required. *(all green on this build)*
2. Exercise production entry points for new run, continue, optional-room failure, shop, boon choice, phase changes, death, victory and restart. Keep controlled-state browser fixtures for edge cases alongside unassisted playthrough records. *(controlled-state checks delivered via the dev-only `__riftbound` QA handle; unassisted records outstanding)*
3. Profile a populated arena, a boss volley and repeated floor transitions on physical integrated graphics. Record hardware, viewport, seed, renderer, median and p95 frame time, live entities, scene objects and listener counts. Compare against the same encounter on the checkpoint build. Report software-rendered browser measurements separately. *(outstanding - no physical GPU in the test environment)*
4. Recheck every critical defect with its original seed or save. Update the development state and quality report with commands, results, measurements and any unexecuted manual checks. *(docs updated; see DEVELOPMENT_STATE.md and QUALITY_REPORT.md)*

**Release decision.** Resolve reproducible crashes, softlocks, unreachable mandatory content, duplicate rewards and lost saves before release. Record any remaining lower-impact defects with reproduction steps. The next session starts with the unassisted baseline runs of phase 1.
