# Pull Request

## What changes

<!-- One-paragraph summary. Reference the issue number if one exists. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Balance / tuning
- [ ] Performance
- [ ] Refactor (no behavior change)
- [ ] Docs / assets

## Verification

- [ ] `bun run lint` passes
- [ ] `bunx tsc --noEmit` passes
- [ ] Golden path played: menu -> new run -> pact -> clear a room -> loot ->
      level up -> pause/resume -> die or descend, with no console errors
- [ ] New game->UI events are typed in `src/game/types.ts` and mirrored in
      `src/lib/gameStore.ts`
- [ ] No per-frame allocations added to `update()` paths (see
      docs/PERFORMANCE.md if unsure)

## Screenshots / clip

<!-- For anything visual. -->
