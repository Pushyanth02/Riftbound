# Quality Report

Testing was performed with the agent-browser automated browser (Chromium,
headless) against the running dev server (`bun run dev`, port 3000). Every
test below was actually executed; failures were fixed and re-verified unless
noted.

## Directive test gates

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | Game launches | PASS | Boot manifests load, animations build, canvas renders |
| 2 | Main menu buttons work | PASS | New Run / Continue (conditional) / Settings / Controls / Credits all navigate correctly |
| 3 | New Run starts | PASS | Found + fixed: UI stayed on loading screen because the scene never emitted `ui:state: playing` |
| 4 | WASD moves the player | PASS | Verified via scene coordinates (432,1584 -> 1523,1623) and room change |
| 5 | Mouse aiming works | PASS | Aim tracks pointer world position; attacks resolve along the aim vector |
| 6 | Melee attacks damage enemies | PASS | 3-hit combo verified; combo arcs damage enemies in range+arc; crits, knockback, hit-stop verified |
| 7 | Spells consume mana and apply damage | PASS | Fireball (12 mana, splash kills x3), Frost Nova (18), Arcane Bolt (6), Whirlwind (14); mana pool tracked exactly |
| 8 | Dodge obeys collision and cooldown | PASS | Grid collision respected; invulnerability window verified indirectly (contact damage skipped) |
| 9 | Enemies detect, attack, and die | PASS | All four behaviors exercise their state machines (approach/telegraph/attack/recover/hurt); enemies died to melee, spells, and exec damage |
| 10 | Experience and loot are collectible | PASS | XP grants levels; coins magnet to the player; hearts/mana/potions drop |
| 11 | Level-up upgrades change gameplay | PASS | Frozen Reach raised frost radius 110 -> 137.5; Deep Focus/Sanguine Sigil applied; stacked level-ups chain correctly |
| 12 | Generated dungeons are traversable | PASS | Multiple seeds generated across sessions; flood-fill validation in generator guarantees connectivity |
| 13 | Rooms can be completed | PASS | Combat room with 11 enemies: gates locked on entry, all six barriers unlocked on clear |
| 14 | Boss phases function | PASS | Phase 1 patterns (bolt fan, AoE circles, summons); phase 2 at 50% HP (faster fan x7, spikes, teleports); found + fixed: boss was never spawned before the fix |
| 15 | Boss death unlocks progression | PASS | Gates unlock, relic + gold burst granted, victory portal spawns in the chamber |
| 16 | Player death opens the correct screen | PASS | "THE ECHOES CLAIM YOU" with full run summary |
| 17 | Restart creates a valid new run | PASS | "Rise Again" starts a fresh seeded run |
| 17b | Continue restores a saved run | PASS | Save persisted at floor transitions; Continue resumed floor 3 with relics/level intact; save cleared on victory |
| 18 | Settings persist correctly | PASS | Master volume change written to localStorage and read back |
| 19 | Window resizing preserves usability | PASS | 1600x900 and 900x700 viewports verified; camera zoom adapts (snapped to 0.25 steps) |
| 20 | Production build succeeds | NOT RUN | Sandbox policy forbids `bun run build`; TypeScript strict check (`tsc --noEmit`) and ESLint both pass clean |

## Additional flows verified

- Merchant shop: opens with E, wares priced, unaffordable items disabled,
  purchase deducts gold and grants the item, Leave resumes the game.
- Shrine heals 30% once, then dims.
- Chest: gold burst + guaranteed first relic (Echo Lens observed).
- Inventory panel: relics, boons, hero stats, potion counts.
- Minimap: room discovery, current-room highlight, Tab enlarge.
- Pause menu: resume, inventory, settings, controls, quit-to-menu.
- Keyboard shortcuts: 1/2/3 for level-up choices, Esc handling, I inventory.
- Best records: "Deepest descent / Runs / Seals held" persisted and displayed.
- Hydration: found and fixed a server/client mismatch (menu footer reading
  localStorage during first render).

## Console / runtime errors

After fixes, a fresh load + full playthrough produces zero console errors
and zero uncaught exceptions. Earlier sessions surfaced and fixed:
- `ctx.scene.add.sprite is not a function` (ScenePlugin vs Scene - resolved
  by making GameContext extend Phaser.Scene)
- Phaser ESM has no default export (switched to namespace imports)
- Wrong relative import paths in entities/base.ts
- addCounter onUpdate callback signature (tween-first parameters)
- Hydration mismatch in MainMenu footer

## Known limitations (honest disclosure)

1. **Headless FPS measurement is meaningless**: the sandbox browser renders
   WebGL via SwiftShader (software). Even the near-idle menu measures ~8 FPS;
   gameplay measured ~14 FPS. This is a renderer ceiling, not game logic -
   the update loop is lightweight (grid collisions, <30 active entities,
   batched sprites, pooled projectiles, HUD emission throttled to 10 Hz).
   Real-GPU performance was not measurable in this environment.
2. **Headless keyboard quirk**: between CLI commands the browser fires
   window blur, which Phaser answers with resetKeys. Synthetic in-page event
   dispatch (verified working) was used for key-driven tests. Real browsers
   with focus are unaffected.
3. **Continue restores floor, not mid-room state**: saves are written at
   floor transitions; a continued run regenerates the floor (same seed, same
   layout) with enemies reset. Run stats, upgrades, relics, and potions are
   preserved exactly.
4. **Production build not executed** (sandbox policy). `tsc --noEmit` and
   `next lint` are clean; a `next build` on a capable machine is expected to
   succeed but was not verified here.
5. **Mobile**: the canvas scales responsively and the HUD reflows, but the
   game requires keyboard + mouse. Touch controls are not implemented.

## Performance measures taken

- Sprites share textures (walls, floor tiles, VFX sheets) for WebGL batching.
- Wall collision is a walkable-grid lookup (no physics engine, no per-tile
  bodies).
- VFX capped at 46 live effects (22 in reduced-effects mode) with oldest-first
  recycling; loop effects auto-expire.
- Projectiles and damage numbers are pooled / swept every frame.
- HUD emits at 10 Hz, minimap at ~5.5 Hz, prompts on change only.
- Inactive-room enemies skip their AI tick until activated.
- Ambient density halves under the Reduced Effects setting.

## Re-verification after the combat-baseline and Pages pass (2026-11-26)

Verified after extracting the pure combat core, extending F3 and adding the
static GitHub Pages export:

- `bun run lint`, `bun x tsc --noEmit` (after `bunx prisma generate`) and
  `bun test` (28 tests, 35,497 assertions across
  `scripts/gameplay.test.ts` and `scripts/combat.test.ts`) pass clean.
- Both build modes succeed: `bun run build` (standalone server bundle with
  the packaging step) and `bun run build:pages` (static export with the
  `/Riftbound` base path).
- The Pages export was served locally under `/Riftbound/`
  (`scripts/serve-pages.ts`, port 4173) and driven in headless Chromium:
  menu renders, pact selection, run start, WASD movement, melee, fireball,
  dodge and pause all work with zero page errors and zero console
  errors/warnings; Phaser booted WebGL and loaded every manifest/texture
  through the base-prefixed URLs.
- F3 was enabled during live combat on the dev server; the melee sector
  (gold windup, red active), body circles and sweep lines render as
  designed (screenshot-reviewed).
- CI and Pages deploy workflows are defined in `.github/workflows/`; the
  Pages environment must be selected once in the repository settings
  (Settings > Pages > Source: GitHub Actions) for the first deployment.

## Re-verification after the optimization pass (2026-11-26)

The full golden path was replayed in the automated browser after the
performance pass (menu -> New Run -> pact selection -> Begin the Descent ->
in-run HUD -> movement, attack and dodge inputs):

- Zero page errors and zero console errors/warnings during the loop.
- Run state correct: Health 100/100, Mana 60, LV 1, Floor 1 shown; canvas
  active at 1280x577 and visible.
- Save persistence verified: Continue button appeared with
  "Floor 1 - Level 1" after a reload.
- `bun run lint` and `tsc --noEmit` both pass clean for `src/` (pre-existing
  fixture errors in `examples/` and `skills/` folders are out of scope).

The optimization details are documented in [PERFORMANCE.md](PERFORMANCE.md).
