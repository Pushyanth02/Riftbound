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
- **Production build**: blocked by sandbox policy; types and lint are clean.

## Not implemented

- Nothing from the directive's mandatory feature list. All P0/P1 systems
  listed under "Complete" above are implemented and browser-verified.
