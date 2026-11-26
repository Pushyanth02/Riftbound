/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import { MAX_FLOOR, TILE } from '../src/game/config';
import { generateDungeon } from '../src/game/dungeon/generator';
import { RunState, parseSave } from '../src/game/run';
import { gridLineOfSight } from '../src/game/sight';

test('diagonal rays follow the segment and respect corners and endpoints', () => {
  const grid = (col: number, row: number) => ({
    walkableAtPx: (x: number, y: number) => Math.floor(x / TILE) !== col || Math.floor(y / TILE) !== row,
  });
  expect(gridLineOfSight(grid(2, 0), 16, 16, 80, 80)).toBe(true);
  for (const [x, y] of [[1, 1], [1, 0], [2, 2]]) {
    expect(gridLineOfSight(grid(x, y), 16, 16, 80, 80)).toBe(false);
    expect(gridLineOfSight(grid(x, y), 80, 80, 16, 16)).toBe(false);
  }
});

test('bounded dodge stacks, legacy saves and malformed checkpoints', () => {
  const run = new RunState(42);
  for (let i = 0; i < 12; i++) run.addUpgrade('dodgeCd');
  expect(run.stacks('dodgeCd')).toBe(4);
  expect(run.stats.dodgeCooldown).toBeGreaterThan(0);
  const data = run.toSave();
  expect(parseSave(JSON.stringify(data))).toEqual(data);
  expect(parseSave(JSON.stringify({ ...data, pacts: undefined, souls: undefined }))?.souls).toBe(0);
  expect(parseSave(JSON.stringify({ ...data, floor: 0 }))).toBeNull();
  expect(parseSave(JSON.stringify({ ...data, upgrades: [['bogus', 1]] }))).toBeNull();
});

test('starting weapons change real combat stats and survive continue', () => {
  const sword = new RunState(1);
  const knife = new RunState(1, [], 'knife');
  const cleaver = new RunState(1, [], 'cleaver');
  expect(knife.stats.meleeCooldown).toBeLessThan(sword.stats.meleeCooldown);
  expect(cleaver.stats.meleeDamage).toBeGreaterThan(sword.stats.meleeDamage);
  expect(RunState.fromSave(parseSave(JSON.stringify(knife.toSave()))!).stats).toEqual(knife.stats);
  expect(parseSave(JSON.stringify({ ...knife.toSave(), weapon: undefined }))?.weapon).toBe('sword');
});

test('128 seeds per floor keep encounters, interactables and gates reachable', () => {
  for (let seed = 0; seed < 128; seed++) {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      const d = generateDungeon(seed, floor);
      const start = d.rooms[d.startRoom];
      const open = [start.cy * d.width + start.cx];
      const seen = new Set(open);
      for (let i = 0; i < open.length; i++) {
        const at = open[i];
        for (const next of [at - 1, at + 1, at - d.width, at + d.width]) {
          if (d.walkable[next] && !seen.has(next)) {
            seen.add(next);
            open.push(next);
          }
        }
      }
      for (const r of d.rooms) {
        const targets = [...r.enemySpawns, ...r.gates.flatMap((g) => g.tiles),
          ...r.props.filter((p) => ['portal', 'shrine', 'chest', 'merchant'].includes(p.kind)),
          { x: r.cx, y: r.cy }];
        for (const p of targets) expect(seen.has(p.y * d.width + p.x)).toBe(true);
      }
      for (const c of d.corridors) {
        const a = d.rooms[c.roomA].slot;
        const b = d.rooms[c.roomB].slot;
        expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
      }
      if (seed === 0) expect(generateDungeon(seed, floor)).toEqual(d);
    }
  }
});
