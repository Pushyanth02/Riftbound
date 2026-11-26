# Art Direction

## Concept

A ruined keep sunk into darkness, its courtyards overgrown, its deeper halls
still humming with the violet energy of the broken seal. Rooms float as
islands of torchlight in a black abyss; corridors thread between them like
veins. Everything reads at roguelike glance: silhouettes first, detail
second.

## Palette

| Role | Color | Usage |
|---|---|---|
| Background ink | `#140E1D` | void, panel bases |
| Dark stone | `#25202F` | UI panels, minimap fills |
| Shadow | `#34243D` | raised UI surfaces |
| Antique gold | `#D9AD62` | trim, borders, currency, XP |
| Ember | `#D95252` | health, danger, boss bar |
| Arcane violet | `#9868E8` | mana, rifts, barriers, magic |
| Mystic cyan | `#65D9D0` | healing, shrines |
| Bone white | `#E8DCC9` | primary text, player accent |

The world canvas sits on `#0E0A14`; per-floor tints darken and cool the
environment as the player descends (courtyard sandstone -> sunken halls ->
violet-tinged seal chamber).

## Rendering rules

- 32px tile grid, nearest-neighbor filtering, camera zoom snapped to 0.25
  steps to avoid subpixel seams.
- Y-sorted entities: depth equals feet position; wall faces sit at their
  tile-bottom depth so the player always renders in front of north walls.
- Character frames are 100x100 with ~30px bodies; sprites anchor at
  (0.5, 0.62); collision uses small feet rectangles decoupled from art.
- Ground shadow ellipses under every character (baked sheet shadows plus a
  generated soft ellipse).
- VFX play at authored pivot points with exact per-frame durations from the
  PVFX manifests; melee arcs rotate to the aim angle (flipped vertically
  past 90 degrees to stay readable).

## Environment assembly

- Floors: sandstone autotiles (491/455/456 base, 492/457 seams, 493/458/494
  cracks/moss), grass overgrowth on the first floor's start/encounter/
  treasure rooms, rubble decals scattered by seed.
- Walls: two-tall assembly - brick face where walkable ground lies below,
  cap stone above the face and along side/bottom edges; mossy variants
  mixed at ~15%; concave corners filled only when they touch an existing
  wall (no floating fragments).
- Props: altars anchor the boss chamber, animated shrines sit in encounter
  rooms, chalices and ruin arches dress treasure and halls, torches line
  the north walls with ember ambience.
- Atmosphere: vignette + grain overlays, drifting motes/fog/embers per
  floor, purple magic accents in the void-facing UI.

## UI language

- Gothic restraint: sharp 2px corner radii, double frames, gold L-brackets.
- Cinzel for display type (letterspaced smallcaps labels), Alegreya serif
  for body, tabular numerals for stats.
- Feedback states everywhere: hover lifts + gold borders, focus-visible
  outlines, disabled dims, cooldown sweeps on ability slots, ghosting HP
  bar, toast stack.
- Reduced-effects mode halves particle counts and disables CSS animation.
- No emoji, no generic dashboard patterns, no gradient text, no blue.
