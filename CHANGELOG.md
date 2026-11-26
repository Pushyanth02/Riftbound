# Changelog

All notable changes to RIFTBOUND are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to semantic versioning for its tagged releases.

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
