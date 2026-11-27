/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import { BOONS, MAX_FLOOR, PACTS, RELICS, TILE, UPGRADES } from '../src/game/config';
import { generateDungeon, walkableWithDoorsOpen, type Dungeon } from '../src/game/dungeon/generator';
import { RunState, SAVE_VERSION, parseSave, splitBounty } from '../src/game/run';
import { gridLineOfSight } from '../src/game/sight';

/* ------------------------------------------------------------------ */
/* sight                                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* flood fill helpers mirroring the generator validation               */
/* ------------------------------------------------------------------ */

function fillFrom(d: Dungeon, walkable: Uint8Array): Set<number> {
  const start = d.rooms[d.startRoom];
  const open = [start.cy * d.width + start.cx];
  const seen = new Set(open);
  for (let i = 0; i < open.length; i++) {
    const at = open[i];
    for (const next of [at - 1, at + 1, at - d.width, at + d.width]) {
      if (next >= 0 && next < d.width * d.height && walkable[next] && !seen.has(next)) {
        seen.add(next);
        open.push(next);
      }
    }
  }
  return seen;
}

const INTERACTABLE_PROPS = ['portal', 'shrine', 'chest', 'merchant', 'boonshrine', 'totem', 'soulpile'];

/* ------------------------------------------------------------------ */
/* dungeon topology: main objective, optional routes, secrets          */
/* ------------------------------------------------------------------ */

test('128 seeds per floor: objective reachable with doors closed, secrets open, approach tiles walkable', () => {
  for (let seed = 0; seed < 128; seed++) {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      const d = generateDungeon(seed, floor);
      /* doors closed: the main objective never depends on optional rooms */
      const closed = fillFrom(d, d.walkable);
      /* doors open: the secret branch becomes reachable (post-open exits) */
      const open = fillFrom(d, walkableWithDoorsOpen(d));

      for (const r of d.rooms) {
        const seen = r.type === 'secret' ? open : closed;
        /* room centers */
        expect(seen.has(r.cy * d.width + r.cx)).toBe(true);
        /* enemies, interactables and their approach tiles */
        for (const p of [...r.enemySpawns, ...r.trapPlates]) {
          expect(seen.has(p.y * d.width + p.x)).toBe(true);
        }
        for (const prop of r.props) {
          if (INTERACTABLE_PROPS.includes(prop.kind)) {
            expect(seen.has(prop.y * d.width + prop.x)).toBe(true);
            const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
            expect(neighbors.some(([dx, dy]) => seen.has((prop.y + dy) * d.width + (prop.x + dx)))).toBe(true);
          }
        }
        /* gate clearance: every gate tile reachable except along the secret
           branch - door tiles are solid, the rest is merely cut off until
           the cracked wall opens */
        for (const g of r.gates) {
          const involvesSecret = d.rooms[g.otherRoom]?.type === 'secret' || r.type === 'secret';
          for (const t of g.tiles) {
            if (involvesSecret) {
              expect(closed.has(t.y * d.width + t.x)).toBe(false);
              expect(open.has(t.y * d.width + t.x)).toBe(true);
            } else {
              expect(closed.has(t.y * d.width + t.x)).toBe(true);
            }
          }
        }
        /* the cracked door itself is solid in the static grid */
        for (const door of d.secretDoors) {
          for (const t of door.tiles) expect(d.walkable[t.y * d.width + t.x]).toBe(0);
        }
        /* entire solid footprints: pillars are solid and stay inside rooms */
        for (const ob of r.obstacles) {
          expect(ob.x >= r.x && ob.x < r.x + r.w && ob.y >= r.y && ob.y < r.y + r.h).toBe(true);
          if (ob.kind === 'pillar') expect(d.walkable[ob.y * d.width + ob.x]).toBe(0);
        }
      }
      /* corridors connect orthogonal slot neighbors */
      for (const c of d.corridors) {
        const a = d.rooms[c.roomA].slot;
        const b = d.rooms[c.roomB].slot;
        expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
      }
      /* determinism on the very first seed */
      if (seed === 0) expect(generateDungeon(seed, floor)).toEqual(d);
    }
  }
});

test('the retry-limit fallback still produces a valid, fully connected layout', () => {
  /* maxAttempts: 0 skips straight to the deterministic fallback */
  for (const seed of [0, 1, 7, 42, 999, 123456]) {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      const d = generateDungeon(seed, floor, { maxAttempts: 0 });
      const seen = fillFrom(d, d.walkable);
      for (const r of d.rooms) {
        if (r.type === 'secret') continue;
        expect(seen.has(r.cy * d.width + r.cx)).toBe(true);
      }
      expect(d.rooms.length).toBeGreaterThanOrEqual(5);
    }
  }
});

test('optional routes actually generate: challenges, trap chambers and secret branches', () => {
  let challenges = 0;
  let traps = 0;
  let secrets = 0;
  let trapPlates = 0;
  for (let seed = 0; seed < 64; seed++) {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      const d = generateDungeon(seed, floor);
      for (const r of d.rooms) {
        if (r.type === 'challenge') challenges++;
        if (r.type === 'trap') {
          traps++;
          trapPlates += r.trapPlates.length;
        }
        if (r.type === 'secret') {
          secrets++;
          /* the door is hinted (reward clue) and hidden until opened */
          expect(r.hinted).toBe(true);
          expect(r.discovered).toBe(false);
        }
      }
      /* secret doors stay sealed in the static grid */
      for (const door of d.secretDoors) {
        expect(door.opened).toBe(false);
        for (const t of door.tiles) expect(d.walkable[t.y * d.width + t.x]).toBe(0);
        expect(d.rooms[door.secretRoom].type).toBe('secret');
      }
    }
  }
  expect(challenges).toBeGreaterThan(0);
  expect(traps).toBeGreaterThan(0);
  expect(trapPlates).toBeGreaterThan(0);
  expect(secrets).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ */
/* economy: gold modifiers apply once, before splitting                */
/* ------------------------------------------------------------------ */

test('gold modifiers apply exactly once to the total bounty before splitting', () => {
  /* no modifiers: split preserves the total */
  expect(splitBounty(9, 3, 1)).toEqual([3, 3, 3]);
  expect(splitBounty(5, 3, 1)).toEqual([2, 2, 1]);
  /* Barren Halls halves the rolled bounty once, then splits */
  expect(splitBounty(6, 2, 0.5)).toEqual([2, 1]);
  expect(splitBounty(6, 4, 0.5)).toEqual([1, 1, 1]);
  /* a tiny reward under Barren still pays exactly one coin */
  expect(splitBounty(2, 3, 0.5)).toEqual([1]);
  /* Grave Bell lifts the total by 25% once */
  expect(splitBounty(8, 2, 1.25)).toEqual([5, 5]);
  /* both together compound exactly once (0.5 * 1.25) */
  expect(splitBounty(16, 2, 0.625)).toEqual([5, 5]);
  /* invariants for a spread of inputs */
  for (const base of [1, 3, 7, 12, 25, 60, 90]) {
    for (const mult of [0.5, 1, 1.25, 1.5625]) {
      for (const piles of [1, 3, 6, 8]) {
        const values = splitBounty(base, piles, mult);
        const total = Math.max(1, Math.round(base * mult));
        expect(values.reduce((a, b) => a + b, 0)).toBe(total);
        for (const v of values) expect(v).toBeGreaterThanOrEqual(1);
        expect(values.length).toBeLessThanOrEqual(piles);
      }
    }
  }
  /* the derived pipeline: Barren + Grave Bell = 0.625 on the run */
  const barren = new RunState(1, ['barren']);
  expect(barren.stats.goldMult).toBe(0.5);
  barren.addRelic('grave_bell');
  expect(barren.stats.goldMult).toBeCloseTo(0.625);
});

/* ------------------------------------------------------------------ */
/* audits: every upgrade, relic, boon and pact does something          */
/* ------------------------------------------------------------------ */

test('every upgrade, relic, boon and pact has an observable gameplay effect', () => {
  const baseline = new RunState(7);
  const snapshot = { ...baseline.stats };

  /* upgrades: each stack must move at least one derived stat */
  for (const def of UPGRADES) {
    const run = new RunState(7);
    run.addUpgrade(def.id);
    expect(run.stacks(def.id)).toBe(1);
    const moved = (Object.keys(snapshot) as (keyof typeof snapshot)[]).some((key) => run.stats[key] !== snapshot[key]);
    expect(moved).toBe(true);
  }

  /* relics: each grant must move at least one derived stat */
  for (const def of RELICS) {
    const run = new RunState(7);
    expect(run.addRelic(def.id)).not.toBeNull();
    const moved = (Object.keys(snapshot) as (keyof typeof snapshot)[]).some((key) => run.stats[key] !== snapshot[key]);
    expect(moved).toBe(true);
    /* double grants are refused */
    expect(run.addRelic(def.id)).toBeNull();
    expect(run.relics.length).toBe(1);
  }

  /* boons: each grant must move at least one derived stat */
  for (const def of BOONS) {
    const run = new RunState(7);
    expect(run.addBoon(def.id)).not.toBeNull();
    const moved = (Object.keys(snapshot) as (keyof typeof snapshot)[]).some((key) => run.stats[key] !== snapshot[key]);
    expect(moved).toBe(true);
    expect(run.addBoon(def.id)).toBeNull();
  }

  /* pacts: each pact moves its multiplier(s) or the boss phase count */
  for (const def of PACTS) {
    const run = new RunState(7, [def.id]);
    const multsMoved =
      run.pactMult('enemyHpMult') !== 1 ||
      run.pactMult('enemyDmgMult') !== 1 ||
      run.pactMult('enemySpeedMult') !== 1 ||
      run.pactMult('goldMult') !== 1 ||
      run.pactMult('healMult') !== 1 ||
      run.pactMult('playerHpMult') !== 1;
    const observable = multsMoved || run.bossFury || run.shardReward > baseline.shardReward;
    expect(observable).toBe(true);
    /* stacking pacts compounds multiplicatively */
    const stacked = new RunState(7, ['hardened', 'relentless']);
    expect(stacked.pactMult('enemyHpMult')).toBeCloseTo(1.35);
    expect(stacked.pactMult('enemyDmgMult')).toBeCloseTo(1.25);
  }
});

/* ------------------------------------------------------------------ */
/* save versioning and malformed records                               */
/* ------------------------------------------------------------------ */

/** Real prior-release fixture: the pre-chamber format with no version
    field, no weapon, no pacts/boons/souls. */
const V1_FIXTURE = JSON.stringify({
  seed: 4242,
  floor: 2,
  level: 5,
  xp: 31,
  gold: 140,
  kills: 22,
  timeMs: 511000,
  upgrades: [['meleeDmg', 2], ['crit', 1]],
  relicIds: ['grave_bell'],
  potions: { health: 2, mana: 1 },
  hp: 61,
  mana: 44,
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

test('save versioning: v1 fixture loads with defaults, current round-trips, future refused', () => {
  /* v1 fixture: defaults fill the newer optional fields */
  const v1 = parseSave(V1_FIXTURE);
  expect(v1).not.toBeNull();
  expect(v1?.version).toBeUndefined();
  expect(v1?.weapon).toBe('sword');
  expect(v1?.pacts).toEqual([]);
  expect(v1?.boonIds).toEqual([]);
  expect(v1?.souls).toBe(0);
  const restored = RunState.fromSave(v1!);
  expect(restored.floor).toBe(2);
  expect(restored.stacks('meleeDmg')).toBe(2);
  expect(restored.relics.map((r) => r.id)).toEqual(['grave_bell']);

  /* current writes carry the version; reloading immediately after the
     transaction preserves the record exactly */
  const fresh = new RunState(99, ['barren'], 'cleaver');
  fresh.addUpgrade('maxhp');
  fresh.addBoon('ember_burn');
  fresh.souls = 7;
  const json = JSON.stringify(fresh.toSave());
  expect(fresh.toSave().version).toBe(SAVE_VERSION);
  const reloaded = RunState.fromSave(parseSave(json)!);
  expect(JSON.stringify(reloaded.toSave())).toBe(json);
  expect(reloaded.weapon).toBe('cleaver');
  expect(reloaded.pacts).toEqual(['barren']);

  /* a record from a newer format version is refused, not half-loaded */
  expect(parseSave(JSON.stringify({ ...fresh.toSave(), version: SAVE_VERSION + 1 }))).toBeNull();
  /* malformed records are refused outright */
  expect(parseSave('{not json')).toBeNull();
  expect(parseSave(JSON.stringify({ ...fresh.toSave(), hp: -5 }))).toBeNull();
  expect(parseSave(JSON.stringify({ ...fresh.toSave(), potions: { health: -1, mana: 0 } }))).toBeNull();
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
