# Performance Notes

RIFTBOUND targets a locked 60 fps on ordinary laptops with integrated
graphics. This document records the budgets, the passes already done, and
the patterns future changes are expected to follow.

## Budgets

| Budget | Target |
|---|---|
| Boot payload (`public/assets`) | < 3 MB total, ~110 textures |
| Time-to-menu after cache | < 2 s on broadband |
| Steady-state GC churn in combat | ~0 minor GCs per 10 s |
| HUD store emissions | 10 Hz numeric, event-driven structural |
| Minimap emissions | 5.5 Hz positional, structural only on change |

## Pass 1 - frame loop and allocation hygiene

The update loop now performs **zero array allocations**:

- Dead enemies, spent projectiles and collected pickups are compacted
  in place with a write index (`game.ts`) instead of `.filter()`, which
  allocated three fresh arrays every frame.
- `moveGrid`, enemy separation and enemy targeting return **module-scratch
  vectors** (`base.ts`, `enemy.ts`). Every call site consumes the values
  immediately; retaining a scratch result is a bug.
- The anim-state guard uses a precomputed `Set` instead of building an
  array literal per enemy per frame.

## Pass 2 - render-side pressure

- `Entity.setPos` skips redundant `setDepth` writes. Phaser marks the
  display list dirty on every `setDepth` call, which re-sorts ~1000
  children (walls + entities). Skipping same-value writes keeps idle
  frames clean.
- The Phaser config requests `powerPreference: 'high-performance'`, which
  matters on dual-GPU laptops.
- Static walls remain individual images (y-sorted for the pseudo-3D look).
  Baking them into a RenderTexture per floor is the next big win if the
  scene ever needs it - measured, not yet needed at current entity counts.

## Pass 3 - React re-render reduction

- `GameShell` subscribes to `hud !== null` (a boolean) instead of the HUD
  object. The HUD payload is rebuilt at 10 Hz, so the old selector
  re-rendered the entire overlay tree ten times a second for a whole run.
- HUD relic/boon arrays are cached; both lists are append-only during a
  run, so the mapped arrays keep a stable identity between ticks and row
  components skip re-rendering unless something was actually gained.
- Minimap rooms/corridors are cached behind a fingerprint of
  discovery/clear/current-room state; the 180 ms emission only rebuilds
  the structural arrays when that fingerprint changes. The player marker
  still updates every tick.

## Pass 4 - boot payload and audio

- Dead texture keys removed from the load list: `ice_cast`, `slowed`,
  `dust_motes`, `bd_flame_jets`, `prop_particles` (~300 KB never used).
- SFX noise cues share one lazily built 2-second white-noise buffer with a
  random slice offset per play, instead of allocating and filling a fresh
  `AudioBuffer` for every hit/coin/swing (up to ~25 plays per second in
  heavy combat).
- The music interval skips ticks in hidden tabs, where throttled timers
  would otherwise desync the arpeggio.

## Pass 5 - correctness under load

- Pickup scatter friction uses exponential decay
  (`v *= 0.0022 ** dt`), identical at 60 and 144 Hz.
- Delta is clamped to 50 ms; hit-stop and cooldown timestamps use the
  scene clock, not wall time.

## Known costs, deliberately kept

- Boss FX textures (~730 KB) load at boot rather than lazily before floor
  3 - the pause for a lazy load mid-descent was judged worse than the
  boot cost.
- The minimap runs its own rAF pulse loop for the player marker; it draws
  at ~4.5 Hz, cheap for a 2D canvas.

## Profiling method

Chrome DevTools -> Performance, 6x CPU throttle, 30 s of courtyard combat
with two elite packs. Watch the minor GC markers and the scripting slice;
a regression is anything that reintroduces per-frame sawtooth allocation
or pushes scripting past ~40% of a throttled frame.
