# Asset Licenses and Attribution

All art in this game comes from the free/demo packs supplied in the uploaded
archives. No paid downloads were bypassed; no assets were fabricated. Sources
were inspected and verified before integration.

## Packs used

### 1. Tiny RPG Character Asset Pack 01 v2.0 (free) — Zerie
- Source: https://zerie.itch.io/tiny-rpg-character-asset-pack
- Used: Soldier (player hero), Orc (Gravewalker enemy, Orc Warchief elite)
- Files: `public/assets/characters/player/*`, `public/assets/characters/orc/*`
- License: free pack (no license file shipped); credit appreciated.

### 2. Tiny RPG Character Asset Pack 02 v1.01 (free) — Zerie
- Source: https://zerie.itch.io/tiny-rpg-character-asset-pack-02
- Used: Demon_A (Rift Adept enemy, The Fallen Necromancer boss), Blood Monster_A (Bloodspawn enemy, boss "echo" summons)
- Files: `public/assets/characters/demon/*`, `public/assets/characters/bloodmon/*`
- License: free pack (no license file shipped); credit appreciated.

### 3. Epic RPG World Pack — Ancient Ruins (free demo) — Rafael Matos
- Source: https://rafaelmatos.itch.io/epic-rpg-world-pack-free-demo-ancient-ruins-asset-tileset
- Used: Tileset-Terrain2 (floors, moss, rubble decals), wall-8 2-tile-tall set (walls),
  altar, shrine/fountain, golden chalice, ruin structure (props), NPC Merchant,
  atmospheric nature particles
- Files: `public/assets/tilesets/*`, `public/assets/props/*`, `public/assets/characters/merchant/*`
- License: free demo pack; credit appreciated.
- Tile dimensions verified against the shipped Tiled `.tsx` files (32x32,
  36 columns for terrain, 10 columns for walls).

### 4. PVFX Foundry v1.2 — nerijs
- Source: https://nerijs.itch.io/pvfx-foundry
- Used: 46 effect families (melee arcs, projectiles, impacts, explosions,
  shadow/arcane/holy/ice families, ambient loops, UI pickups). Exact per-frame
  durations are read from the shipped export manifests.
- Files: `public/assets/effects/*` (grid sheets), metadata in `public/assets/manifests/effects.json`
- License: **CC0 1.0** for the sprite sheets and manifests (per the pack's
  LICENSE.txt). The dedication does not cover the Pixel VFX Studio software.

### 5. 750 Effect and FX Pixel All Free — BDragon1727
- Source: https://bdragon1727.itch.io/750-effect-and-fx-pixel-all
- Used: 6 strips (fire bloom, flame jets, fire sigil, vortex, fire spiral,
  flame dash) for high-impact moments (elite telegraphs, boss abilities).
- Files: `public/assets/fx/*`
- License: free pack; credit appreciated.

### 6. Raven Fantasy Icons (free) — ClockworkRaven
- Source: https://clockworkraven.itch.io/raven-fantasy-icons
- Used: 26 icons (verified against the 32x32 full spritesheet grid:
  separated files map 1:1 to sheet positions). Ability icons, potion icons,
  relic icons, HUD indicators.
- Files: `public/assets/icons/*`
- License: free pack ("Special Note to the Dev.txt" was empty of license
  terms); credit appreciated.

## Generated / procedural elements (not art assets)

- **Main menu key art** (`public/assets/menu/keyart.png`): AI-generated via
  the platform's image-generation tool, prompted for the game's art direction.
- **Ground shadow ellipses**: generated at boot via Phaser Graphics.
- **Rift barriers (combat locks)**: drawn with Phaser Graphics.
- **All audio**: original Web Audio API synthesis (no audio files supplied
  with any pack).

## Notes

- Original artist palettes are preserved; per-floor tinting is applied at
  runtime as scene lighting (non-destructive).
- Nearest-neighbor filtering and snapped camera zoom keep pixels crisp.
- Full per-file provenance (source path, dimensions, frame counts, checksums)
  is recorded in `public/assets/manifests/asset-manifest.json`.
