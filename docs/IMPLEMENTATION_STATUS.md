# Implementation Status

## Complete (verified in browser)

### Core
- Phaser 3.90 game inside Next.js 16 app shell; single `/` route
- Manifest-driven asset pipeline with per-frame animation timing
- Seeded dungeon generation: 6-8 rooms per floor, MST + loop corridors,
  connectivity validation, deterministic per seed
- Three floors with escalating enemy budgets and per-floor tints/ambience
- Grid-based collision (no physics engine), Y-sorted rendering, camera
  follow with deadzone, adaptive snapped zoom

### Player
- WASD movement (normalized), mouse aim, sprite facing
- 3-hit melee combo with windup/active/recover phases, arc hits, crits,
  knockback, hit-stop, camera shake
- Fireball (projectile + splash), Frost Nova (AoE + slow), Arcane Bolt
  (multi-projectile with Splitting Bolt upgrade), Whirlwind (360 AoE)
- Dodge roll with i-frames and trail
- Health/mana/XP/level, mana regen, i-frame blinking, hurt/death states
- Potions (Q/F), interaction (E), inventory (I), pause (Esc), Tab minimap

### Enemies (four behaviors, explicit state machines)
- Gravewalker (Orc): melee approacher
- Bloodspawn (Blood Monster): lunging ambusher
- Rift Adept (Demon): ranged kiter with line-of-sight checks
- Orc Warchief (elite): heavy telegraphed slams, knockback resistance
- Telegraph flashes, stuck-detection sidestepping, per-enemy contact damage
  cooldowns, hurt/stun interrupts

### Boss: The Fallen Necromancer
- Cinematic intro (camera pan, roar, boss bar)
- Phase 1: bolt fans, chasing AoE circles, echo summons
- Phase 2 (at 50%): faster fans, shadow spikes, teleports, more summons
- Death: explosion sequence, relic + gold rewards, victory portal

### Roguelike systems
- Room types: start, combat, treasure, encounter, boss, exit
- Rift barriers lock combat/boss rooms until cleared
- XP curve, level-up with 3 meaningful choices, 14 upgrades (all verified
  to modify real gameplay values)
- 8 relics with gameplay effects; chests, guaranteed first relic
- Gold economy with a wandering merchant (potions + relic)
- Healing shrines in encounter rooms
- Minimap with discovery; Tab enlargement
- LocalStorage: settings, best records, mid-run saves (Continue), reset

### Late additions (post-audit pass)
- **The Descent Pact**: six stackable pre-run difficulty pacts that scale
  enemy HP/damage/speed, player frailty, economy and the shard harvest
- **Boon system**: three patrons (Ember, Frost, Void) with common/rare/epic
  offerings at boon shrines; boon effects feed the derived stats pipeline
- **Champion encounters**: two named minibosses with dedicated AI patterns
  and boss health bars
- **Third boss phase** under the Boss Fury pact
- **Shop panel**, inventory panel and run-summary end screens (death and
  victory) with full relic/boon/upgrade accounting
- **Loading watchdog**: a boot timeout surfaces engine failures with retry
  and back-to-menu paths (no more infinite loader)
- **Souls and soul shards**: per-run soul pickups and persistent shard
  rewards scaled by pact difficulty

### Combat baseline + deployment pass (2026-11-26)

- **Pure combat core** (`src/game/combat.ts`): `MeleeTimeline`,
  `ChargeTracker`, weapon cadence/hit-area helpers and projectile step
  planning, consumed by the live entities and exercised by 24 deterministic
  tests (`scripts/combat.test.ts`).
- **Typed melee tuning surface**: the `MELEE` config block (windup/active/
  recover, lunges, finisher multipliers) replaces inline magic numbers.
- **Extended F3 overlay**: melee sector with locked swing angle, projectile
  sweep capsules, enemy telegraph warning areas with progress rings.
- **Static GitHub Pages export** (`bun run build:pages`) with `/Riftbound`
  base-path resolution in both the Phaser loader and every React overlay
  icon (`src/lib/assetPath.ts`); `public/.nojekyll` ships with the export.
- **CI + Pages deploy workflows** (`.github/workflows/`): lint, prisma
  generate, tests, Pages build, artifact checks and `tsc --noEmit` on every
  push/PR; deploy on `main`.

### Phases 2-6 pass (this build)

- **Room templates with reservations** (phase 2): authored layouts and a
  reserved-zone pass (gate thresholds, boss landing, interaction approach
  tiles) in the generator; every room records the template it used.
- **Optional routes** (phase 2): timed challenge rooms (fail-open trial,
  guaranteed relic on success), trap chambers (telegraphed cycling floor
  plates, guarded chest, never locks) and secret branches (cracked-wall
  door, isolated topology, boon shrine + bounty, dashed map clue).
- **Live map markers** (phase 2): challenge/trap/secret/cache icons derived
  from room state and consumed on looting; hidden secret corridors; hint
  outlines; shape-matching legend; topology-aware minimap cache.
- **Enemy counters** (phase 3): Crypt Sentinel (frontal 65% DR, committed
  bash, +50% exposed flank window) and Rift Chanter (interruptible cast,
  stagger + retreat, room-local summon cap, volley at cap) in the floor 2/3
  pools.
- **Path recovery & pacing** (phase 3): bounded detours, room enemy cap,
  staggered activation cascades, action-sequence guards that cancel pending
  boss/champion volleys on interrupt/phase/death, ring-spread bursts with
  safe ground, immediate boss-bar re-emits on phase changes.
- **Chamber rewards & shop** (phase 4): post-clear choice modal with payoff
  previews and exhausted-pool fallback; stable per-floor merchant offers
  with limited priced rerolls and stat-delta previews.
- **Single-application gold pipeline** (phase 4): `splitBounty` applies
  modifiers once to the rolled bounty before splitting piles.
- **Versioned saves** (phase 4): `SAVE_VERSION` 2 with v1 fixture support,
  future-version refusal and validate-before-write round-trips.
- **Keyboard-driven overlays** (phase 5): arrows/numbers/Enter/Esc across
  the menu, pause, level-up, boon, chamber and shop surfaces; HUD trial
  countdown timer.

### Performance pass (verified 2026-11-26)
- Zero per-frame array allocation in the update loop (in-place compaction)
- Scratch-vector reuse in movement, separation and targeting hot paths
- Redundant depth-sort writes skipped; display list stays clean at idle
- React shell subscribes to a boolean HUD flag (no 10 Hz full-tree renders)
- HUD relic/boon arrays and minimap structure cached by fingerprint
- Shared white-noise AudioBuffer for SFX; music ticks skip hidden tabs
- Dead textures removed from boot (~300 KB); frame-rate independent
  pickup friction; high-performance GPU hint
- See [PERFORMANCE.md](PERFORMANCE.md) for the full write-up

### UI (HTML/CSS overlays)
- Main menu (key art, conditional Continue, records)
- Loading screen with real progress + tips
- HUD: HP ghost bar, mana, XP/level, gold, floor, minimap, boss bar,
  ability bar with cooldown sweeps, potion slots, prompts, room/floor
  cards, toasts
- Pause, settings (volumes, screen shake, reduced effects, reset),
  controls, credits, level-up modal, inventory, shop, death and victory
  screens with run summaries

### Audio
- 24 synthesized cues (Web Audio API), autoplay-safe unlock
- Exploring/boss/menu music modes, volume routing (master/music/sfx)

### Art direction
- Dark fantasy palette from the directive; gothic panel styling, Cinzel
  display type, gold-trimmed frames, no blue/indigo, no emoji
- Vignette + grain overlays, per-floor tint, ground shadows, wall torches,
  ambient particles, rubble dressing, moss/grass overgrowth on floor 1

## Partial / documented limitations

- **Continue** restores the floor from its seed with enemies reset (run
  state preserved). Mid-room state is not snapshotted.
- **Second boss**: not implemented (directive marks it optional).
- **Animated water tiles** (animated.png) are processed but not placed.
- **Luck creature** asset processed but unused.
- **Mobile touch controls**: not implemented; desktop input only.

## Not implemented

- Nothing from the directive's mandatory feature list. All P0/P1 systems
  listed under "Complete" above are implemented and browser-verified.
