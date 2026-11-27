# Changelog

All notable changes to RIFTBOUND are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to semantic versioning for its tagged releases.

## [1.2.0] - Phases 2-6: Optional Routes, Counters & Economy

### Added

- **Room templates with reserved zones** - authored layouts (twin aisles,
  staggered cover, broken colonnade, watch pillar, sanctum, trial ring,
  spike gallery, vault, reliquary) drive room dressing; gate thresholds,
  the boss landing and interaction approach tiles are reserved before any
  prop, pillar or spawn is placed (`TEMPLATES` + `Reservations` in
  `dungeon/generator.ts`).
- **Timed challenge rooms** - the trial seals the gates, starts a 32 s
  countdown (HUD chip + objective line), fails open with no reward when
  the sand runs out and pays a guaranteed relic + gold + souls on an
  in-time clear (`OPTIONAL_ROOMS.challenge`).
- **Trap chambers** - 4-6 telegraphed floor plates cycle warn 850 ms ->
  fire 300 ms -> cool 1.5 s while the player is inside; the room never
  locks and a guarded chest waits at the far end (`TrapPlate`).
- **Secret branches** - a cracked-wall mouth in a free slot hides a boon
  shrine, bounty and souls behind solid topology; the map shows a dashed
  `?` clue until the wall breaks, then reveals the hidden corridor
  (`CrackedWall`, `SecretDoor`).
- **Live map markers** - challenge hourglass, trap spikes, secret `?` and
  cache diamond markers derive from live room state and are consumed on
  looting; the expanded legend draws the same shapes as the map; the
  minimap fingerprint includes seal count, hints and door state so cached
  geometry invalidates on topology changes.
- **Crypt Sentinel** - a shielded guard counter: 65% frontal damage
  reduction, a committed shield bash, and a 1.5 s exposed flank window at
  +50% damage taken (`GUARD` config).
- **Rift Chanter** - an interruptible summoner counter: a 2.4 s cast that
  any hit staggers and retreats from, a room-local summon cap counting
  every resident, and a 3-bolt volley at cap (`CHANTER` config).
- **Chamber reward choice** - combat clears offer recovery, currency or a
  build upgrade with concrete payoff previews and an explicit
  exhausted-pool fallback (`ChamberChoicePanel`); champion sanctums keep a
  patron altar.
- **Shop rerolls** - the merchant keeps stable per-floor offers with a
  limited, visibly priced reroll (2 stock, 12 + 8 gold per step) and
  stat-delta previews on every ware (`SHOP` config).
- **Save versioning** - checkpoints carry `version: 2`; version-less v1
  records load with defaults, newer versions are refused, and a record
  must survive its own round-trip before replacing the last good save.
- **Bounded path recovery** - enemies route around same-axis pillars with
  time-limited detours instead of grinding into them.

### Changed

- Gold modifiers now apply exactly once to the rolled bounty before
  splitting piles (`splitBounty`), replacing the per-pile multiplier;
  Barren Halls and bonus-gold relics no longer compound per coin.
- Enemies wake in a staggered activation cascade (~340 ms apart) and rooms
  cap at `ROOM_ENEMY_CAP = 8` residents including summons.
- Champion and boss delayed volleys/ground hazards die with the action
  that queued them: interrupts, phase changes and death bump an action
  sequence id every callback checks.
- Boss bursts spread on rings with guaranteed safe ground, rings fire
  >= 650 ms apart, volleys gain a pre-cast tell, and phase transitions
  re-emit the boss bar immediately.
- Champion sanctums (encounter rooms) now leave a boon shrine as the
  post-fight reward instead of the removed post-clear random roll.
- Every choice overlay (menu, pause, level-up, boon, chamber, shop) is
  keyboard-traversable: arrows walk the options, number keys select, Enter
  confirms, Esc closes.
- The audit pipeline moved `fireSplash` into `DerivedStats`
  (`fireSplashMult`); the upgrade previously bypassed the derived stats.

### Fixed

- Slot-index wrap-around could connect a secret branch to a non-adjacent
  host room with a map-spanning corridor; neighbor candidates are now
  bounds-checked and the doors-closed isolation is validated.
- The Cinder Blast upgrade bypassed the derived-stats pipeline (raw stack
  reads in the player); caught by the new deterministic audit test.
- Trap-chamber wardens never activated (the activation cascade previously
  ran only for gate-locking rooms).

## [1.1.0] - Combat Baseline & GitHub Pages

### Added

- **Play in the browser** - the game is published as a fully static export
  to GitHub Pages (https://pushyanth02.github.io/Riftbound/), rebuilt on
  every push to `main` by the deploy workflow.
- **CI pipeline** - lint, typecheck, deterministic tests and the Pages
  export build run on every push and pull request
  (`.github/workflows/ci.yml`).
- **Deterministic combat core** (`src/game/combat.ts`) - the melee phase
  machine, input buffering, combo counting, per-swing hit registry, bolt
  charge state and projectile step planning extracted into a pure
  TypeScript module shared by the entities and the test suite.
- **24 deterministic combat tests** (`scripts/combat.test.ts`) - early/late/
  expired input buffering, exact cooldown expiry, dodge cancels in every
  swing phase, interrupted charging, combo cycling and reset, slash-arc
  entry/exit with one-hit-per-swing, point-blank and piercing projectile
  shots, wall/corner tunneling checks at multiple frame intervals, and
  barrier far-side damage blocking through temporary seals.
- **Extended F3 debug overlay** - draws the live melee sector (gold during
  windup, red while active, dim in recovery), the per-frame projectile
  sweep capsule, and enemy windup warning areas with a windup-progress
  ring, so combat timing can be compared against sprite/sound/effect on
  the same frame.
- **Typed melee tuning config** (`MELEE` in `config.ts`) - windup/active/
  recover durations, lunges and finisher multipliers are now a documented,
  single tuning surface instead of inline magic numbers.

### Changed

- Player melee/charge state now delegates to the shared `MeleeTimeline`
  and `ChargeTracker` primitives; behavior is unchanged, but the timing
  policy is testable and frame-exact.
- Projectile stepping uses the shared `projectileStepCount` helper.
- All React overlay icons and the Phaser loader resolve public assets
  through a deployment base path, enabling sub-path static hosting.
- `package.json` renamed to `riftbound` with `test`, `build:static` and
  `build:pages` scripts.

### Removed

- Unused placeholder API route (incompatible with static export).

## [1.0.0] - The Descent Update

### Added

- **The Descent Pact** - six stackable pre-run difficulty pacts (Hardened
  Foes, Relentless Foes, Quickened Horrors, Frail Descent, Barren Halls,
  Boss Fury) that scale enemy pressure and the soul-shard harvest.
- **Third boss phase** - Boss Fury pact unlocks a terrifying final phase of
  the Necromancer fight.
- **Champion encounters** - two named minibosses with dedicated AI patterns
  and boss health bars.
- **Boon shrines and patrons** - Ember, Frost and Void boon offerings in
  three rarities, rerolled per run.
- **Relic system** - 15+ run-modifying relics from chests, champions and the
  merchant.
- **Merchant and shop** - persistent shop panel with ware rotation.
- **Minimap** - live room discovery map with hold-to-enlarge (Tab) and a
  pulsing player marker.
- **Run persistence** - save/continue via localStorage, with run summary on
  death and victory.
- **Fully synthesized audio** - Web Audio soundtrack (explore / boss / menu
  modes) and ~24 SFX cues generated at runtime, zero audio assets.
- **Reduced-FX mode** and a full settings panel (master/music/sfx mix,
  reduced effects, screen shake).
- **Loading watchdog** - a boot timeout that surfaces engine failures with a
  retry path instead of an infinite loader.

### Changed

- **Performance pass** (see [docs/PERFORMANCE.md](docs/PERFORMANCE.md)):
  - React shell subscribes to a boolean HUD flag instead of the full HUD
    payload, eliminating ten full-tree re-renders per second.
  - Zero per-frame array allocation in the update loop (in-place
    compaction for enemies, projectiles and pickups).
  - Scratch-vector reuse in entity movement, separation steering and
    targeting hot paths.
  - Redundant depth-sort writes are skipped, cutting display-list
    re-sorts while idle.
  - HUD relic/boon lists and minimap room/corridor arrays are cached and
    rebuilt only on real changes.
  - Shared white-noise AudioBuffer for SFX instead of per-play generation.
  - Dead asset keys removed from the boot manifest (~300 KB less to load).
  - Frame-rate independent pickup friction (exponential decay).
  - `powerPreference: high-performance` GPU hint for dual-GPU laptops.
- **UI pass** - realigned HUD clusters, ability bar and minimap; consistent
  iconography; ARIA labelling across overlays.

### Fixed

- Infinite loading screen on engine boot failure (now surfaces an error
  with retry).
- Leaked Phaser Container per floor rebuild.
- Music interval ticking in hidden tabs.
- Pickup scatter decaying at different speeds on high-refresh displays.
- Level-up modal soft-lock when opening during a shop/inventory pause.
