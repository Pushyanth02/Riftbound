/// <reference types="bun-types" />
/* Deterministic combat tests (phase 1 of the next-phase plan).

   These exercise the same pure primitives the live entities run:
   - src/game/combat.ts (MeleeTimeline, ChargeTracker, sector geometry,
     projectile step planning) is imported by Player and Projectile, so a
     pass here is a pass against the shipping timing policy.
   - The projectile mini-sim below mirrors Projectile.advance() (wall check
     via gridLineOfSight per sub-step, then circle hits with a per-shot hit
     set and pierce accounting) using the shared helpers. */
import { describe, expect, test } from 'bun:test';
import {
  ChargeTracker,
  MeleeTimeline,
  inMeleeSector,
  meleeCadenceFor,
  meleeSectorFor,
  projectileStepCount,
  projectileStepLength,
  wrapAngle,
  type MeleeCadence,
} from '../src/game/combat';
import { MELEE, PLAYER_BASE, TILE, WEAPONS } from '../src/game/config';
import { RunState } from '../src/game/run';
import { gridLineOfSight } from '../src/game/sight';

/* frame interval samples used across the stepping tests (ms): a fast
   monitor, a typical 60 Hz frame, a 30 Hz hiccup and a 20 Hz stall */
const FRAME_INTERVALS = [8, 16, 33, 50];

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** Grid world where the listed "col,row" cells are solid. */
function worldWith(blocked: ReadonlySet<string>) {
  return {
    walkableAtPx: (x: number, y: number) => !blocked.has(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`),
  };
}

/** Drive the timeline in fixed frames; queue/cancel flags act at that
    frame, then the tick advances the machine. Returns the event log. */
function runTimeline(
  tl: MeleeTimeline,
  cadence: MeleeCadence,
  cooldown: number,
  frames: { at: number; aim?: number; queue?: boolean }[],
): string[] {
  const events: string[] = [];
  let lastAim = 0;
  for (const f of frames) {
    if (f.aim !== undefined) lastAim = f.aim;
    if (f.queue && tl.queue(f.at, cadence, cooldown)) events.push(`start@${f.at}`);
    const ev = tl.tick(f.at, cadence, cooldown, lastAim);
    if (ev) events.push(`${ev.type}@${f.at}`);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* cadence + geometry against the shipped configuration                 */
/* ------------------------------------------------------------------ */

describe('weapon cadence and hit areas', () => {
  test('phase durations scale by weapon tempo, buffers do not', () => {
    const sword = meleeCadenceFor('sword');
    const knife = meleeCadenceFor('knife');
    const cleaver = meleeCadenceFor('cleaver');
    expect(sword.windupMs).toBe(MELEE.windupMs);
    expect(sword.activeMs).toBe(MELEE.activeMs);
    expect(sword.recoverMs).toBe(MELEE.recoverMs);
    expect(knife.windupMs).toBeLessThan(sword.windupMs);
    expect(knife.activeMs).toBeLessThan(sword.activeMs);
    expect(cleaver.windupMs).toBeGreaterThan(sword.windupMs);
    expect(cleaver.activeMs).toBeGreaterThan(sword.activeMs);
    /* every weapon shares the same buffer and combo reset */
    for (const c of [sword, knife, cleaver]) {
      expect(c.bufferMs).toBe(PLAYER_BASE.attackBufferMs);
      expect(c.comboResetMs).toBe(PLAYER_BASE.comboResetMs);
    }
  });

  test('cooldown shortens with attack-speed stacks; swing phases do not', () => {
    const plain = new RunState(7);
    const quick = new RunState(7);
    for (let i = 0; i < 4; i++) quick.addUpgrade('atkSpeed');
    expect(quick.stats.meleeCooldown).toBeLessThan(plain.stats.meleeCooldown);
    /* cadence is weapon-driven only - unaffected by the upgrade */
    expect(meleeCadenceFor('knife').windupMs).toBeLessThan(meleeCadenceFor('sword').windupMs);
  });

  test('the finisher reaches wider and further than swings 1-2', () => {
    for (const weapon of ['sword', 'knife', 'cleaver'] as const) {
      const basic = meleeSectorFor(weapon, 1);
      const finisher = meleeSectorFor(weapon, 3);
      expect(finisher.reach).toBeGreaterThan(basic.reach);
      expect(finisher.arcRad).toBeGreaterThan(basic.arcRad);
      /* base shape tracks the weapon profile exactly */
      expect(basic.reach).toBe(PLAYER_BASE.meleeRange * WEAPONS[weapon].reach);
    }
  });
});

/* ------------------------------------------------------------------ */
/* input buffering + cooldown expiry                                    */
/* ------------------------------------------------------------------ */

describe('input buffering and cooldown expiry', () => {
  const cadence = meleeCadenceFor('sword');
  const cooldown = new RunState(1).stats.meleeCooldown; // 480 ms

  test('early buffer: queued input fires on the frame the cooldown expires', () => {
    const tl = new MeleeTimeline();
    /* swing 1 starts at t=0; the cooldown gate reopens at 480 */
    expect(tl.queue(0, cadence, cooldown)).toEqual({ type: 'swing-start', combo: 1 });
    const ev = runTimeline(tl, cadence, cooldown, [
      { at: 70, aim: 0 },     // windup -> active
      { at: 240 },            // active -> recover
      { at: 330 },            // recover -> none (cooldown still holds)
      { at: 400, queue: true }, // early input: buffered until 560
      { at: 470 },            // still cooling: buffered input must not fire
      { at: 484, aim: 0.5 },  // cooldown expired: buffered swing fires
    ]);
    expect(ev).toEqual(['active-start@70', 'recover-start@240', 'swing-end@330', 'swing-start@484']);
    expect(tl.comboIndex).toBe(2);
  });

  test('a buffer placed mid-active expires before the cooldown opens', () => {
    const tl = new MeleeTimeline();
    tl.queue(0, cadence, cooldown);
    const ev = runTimeline(tl, cadence, cooldown, [
      { at: 70, aim: 0 },
      { at: 240, queue: true }, // buffered until 400 - shorter than the cooldown
      { at: 330 },
      { at: 484, aim: 0 },     // buffer already expired: no swing
    ]);
    expect(ev).toEqual(['active-start@70', 'recover-start@240', 'swing-end@330']);
    expect(tl.phase).toBe('none');
  });

  test('a late buffer placed during recovery chains once the cooldown opens', () => {
    const tl = new MeleeTimeline();
    tl.queue(0, cadence, cooldown);
    const ev = runTimeline(tl, cadence, cooldown, [
      { at: 70, aim: 0 },
      { at: 340 },             // active -> recover
      { at: 410, queue: true }, // buffered until 570 - outlives the cooldown
      { at: 500 },             // swing ends this frame...
      { at: 516, aim: 0 },     // ...buffered swing fires on the next frame
    ]);
    expect(ev).toEqual(['active-start@70', 'recover-start@340', 'swing-end@500', 'swing-start@516']);
    expect(tl.comboIndex).toBe(2);
  });

  test('too-early input is dropped and never fires', () => {
    const tl = new MeleeTimeline();
    tl.queue(0, cadence, cooldown);
    const ev = runTimeline(tl, cadence, cooldown, [
      { at: 70, aim: 0 },
      { at: 250, queue: true }, // buffered until 410, cooldown opens at 480
      { at: 411 },              // buffer expired - the input is lost
      { at: 520, queue: true }, // fresh input starts swing 2
    ]);
    expect(ev).toEqual(['active-start@70', 'recover-start@250', 'swing-end@411', 'start@520']);
    expect(tl.comboIndex).toBe(2);
  });

  test('combo index cycles 1-2-3 and resets after the idle window', () => {
    const tl = new MeleeTimeline();
    tl.queue(0, cadence, cooldown); // combo 1
    runTimeline(tl, cadence, cooldown, [
      { at: 70, aim: 0 },
      { at: 360, queue: true },
      { at: 500 },
      { at: 516, aim: 0 }, // buffered swing 2 fires
    ]);
    expect(tl.comboIndex).toBe(2);
    /* swing 2: active [586, 756], recover [760, 850], cooldown until 996 */
    runTimeline(tl, cadence, cooldown, [
      { at: 586, aim: 0 },
      { at: 760 },
      { at: 840, queue: true }, // late input: buffered until 1000, outlives the cooldown
      { at: 856 },
      { at: 1000, aim: 0 }, // buffered swing 3 fires
    ]);
    expect(tl.comboIndex).toBe(3);
    /* swing 3: active [1070, 1240], recover [1240, 1330], cooldown until 1480 */
    runTimeline(tl, cadence, cooldown, [
      { at: 1070, aim: 0 },
      { at: 1240 },
      { at: 1330 },
      { at: 3000, queue: true }, // long idle: combo resets
    ]);
    expect(tl.comboIndex).toBe(1);
  });

  test('cooldown expiry is exact: one frame early buffers, on time starts', () => {
    const fresh = new MeleeTimeline();
    fresh.readyAt = 480;
    expect(fresh.queue(479, cadence, cooldown)).toBeNull();
    expect(fresh.bufferedUntil).toBe(479 + cadence.bufferMs);
    expect(fresh.queue(480, cadence, cooldown)?.type).toBe('swing-start');
    expect(fresh.readyAt).toBe(480 + cooldown);
  });
});

/* ------------------------------------------------------------------ */
/* dodge interactions                                                   */
/* ------------------------------------------------------------------ */

describe('dodge during each swing phase', () => {
  const cadence = meleeCadenceFor('sword');
  const cooldown = new RunState(1).stats.meleeCooldown;

  test('dodging cancels windup, active and recovery, and clears the buffer', () => {
    for (const cancelAt of [40 /* windup */, 120 /* active */, 300 /* recover */]) {
      const tl = new MeleeTimeline();
      tl.queue(0, cadence, cooldown);
      runTimeline(tl, cadence, cooldown, [
        { at: 70, aim: 0 },
        { at: cancelAt - 10, queue: true }, // buffered input mid-swing
      ]);
      expect(tl.phase).not.toBe('none');
      tl.cancel(); // the dodge roll
      expect(tl.phase).toBe('none');
      expect(tl.bufferedUntil).toBe(-1);
      /* no further transitions fire for the canceled swing */
      const ev = runTimeline(tl, cadence, cooldown, [{ at: 400 }, { at: 600 }, { at: 800 }]);
      expect(ev).toEqual([]);
    }
  });

  test('a swing cannot start while dodging even when off cooldown', () => {
    const tl = new MeleeTimeline();
    const dodgeUntil = 400;
    expect(tl.queue(100, cadence, cooldown, dodgeUntil)).toBeNull();
    expect(tl.bufferedUntil).toBe(100 + cadence.bufferMs);
    /* the buffer dies before the dodge ends */
    expect(tl.tick(500, cadence, cooldown, 0, dodgeUntil)).toBeNull();
    expect(tl.phase).toBe('none');
    /* fresh input after the dodge starts immediately */
    expect(tl.queue(500, cadence, cooldown, 0)?.type).toBe('swing-start');
  });

  test('a canceled swing leaves no stale hit registry for the next swing', () => {
    const tl = new MeleeTimeline();
    const a = { id: 'a' };
    tl.queue(0, cadence, cooldown);
    tl.hitSet.add(a);
    tl.cancel(); // dodge mid-swing
    expect(tl.phase).toBe('none');
    tl.queue(500, cadence, cooldown); // fresh swing, cooldown open at 480
    runTimeline(tl, cadence, cooldown, [{ at: 570, aim: 0 }]);
    expect(tl.phase).toBe('active');
    expect(tl.hitSet.has(a)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* charge interruption                                                  */
/* ------------------------------------------------------------------ */

describe('interrupted charging', () => {
  test('progress accumulates with time and completes exactly once', () => {
    const c = new ChargeTracker(PLAYER_BASE.boltChargeMs);
    expect(c.active).toBe(false);
    expect(c.begin(1000)).toBe(true);
    expect(c.progress(1000)).toBe(0);
    expect(c.progress(1000 + PLAYER_BASE.boltChargeMs / 2)).toBeCloseTo(0.5, 5);
    expect(c.fullyCharged(1000 + PLAYER_BASE.boltChargeMs - 1)).toBe(false);
    expect(c.fullyCharged(1000 + PLAYER_BASE.boltChargeMs)).toBe(true);
    expect(c.progress(1000 + PLAYER_BASE.boltChargeMs * 3)).toBe(1);
  });

  test('taking a hit or dodging cancels the charge; re-charging works after', () => {
    const c = new ChargeTracker(PLAYER_BASE.boltChargeMs);
    c.begin(0);
    expect(c.progress(300)).toBeGreaterThan(0);
    c.cancel(); /* takeDamage / dodge path in the player entity */
    expect(c.active).toBe(false);
    expect(c.progress(300)).toBe(0);
    expect(c.begin(500)).toBe(true);
    expect(c.progress(600)).toBeGreaterThan(0);
  });

  test('beginning while already charging is refused (no double charge)', () => {
    const c = new ChargeTracker(PLAYER_BASE.boltChargeMs);
    c.begin(0);
    expect(c.begin(10)).toBe(false);
    expect(c.progress(10)).toBeCloseTo(10 / PLAYER_BASE.boltChargeMs, 5);
  });
});

/* ------------------------------------------------------------------ */
/* slash arc geometry: entering, leaving, hitting once                  */
/* ------------------------------------------------------------------ */

describe('slash arc targets', () => {
  const sector = meleeSectorFor('sword', 1); // 100-degree arc, 58 px reach
  const px = 400;
  const py = 300;

  test('targets inside, outside and behind the arc', () => {
    /* dead ahead */
    expect(inMeleeSector(px, py, 0, sector.reach, sector.arcRad, px + 40, py, 12)).toBe(true);
    /* within the arc width but beyond reach + radius */
    expect(inMeleeSector(px, py, 0, sector.reach, sector.arcRad, px + sector.reach + 12.01, py, 12)).toBe(false);
    /* exactly at reach + radius still counts */
    expect(inMeleeSector(px, py, 0, sector.reach, sector.arcRad, px + sector.reach, py, 12)).toBe(true);
    /* 45 degrees off-axis: inside the 50-degree half-arc */
    expect(inMeleeSector(px, py, 0, sector.reach, sector.arcRad, px + 40 * Math.cos(Math.PI / 4), py + 40 * Math.sin(Math.PI / 4), 12)).toBe(true);
    /* 90 degrees off-axis: outside */
    expect(inMeleeSector(px, py, 0, sector.reach, sector.arcRad, px, py + 40, 12)).toBe(false);
    /* behind the player */
    expect(inMeleeSector(px, py, 0, sector.reach, sector.arcRad, px - 40, py, 12)).toBe(false);
  });

  test('a target entering the arc mid-swing is struck; leaving cannot undo it', () => {
    const tl = new MeleeTimeline();
    tl.queue(0, meleeCadenceFor('sword'), 480);
    runTimeline(tl, meleeCadenceFor('sword'), 480, [{ at: 70, aim: 0 }]);
    expect(tl.phase).toBe('active');
    /* the swing direction locked at active-start */
    expect(tl.swingAngle).toBe(0);

    /* mirrors the live resolver: every active frame re-checks every
       target not yet in the per-swing hit registry */
    const registry = new Set<unknown>();
    const strikeIfInside = (t: { x: number; y: number }): void => {
      if (!registry.has(t) && inMeleeSector(px, py, tl.swingAngle, sector.reach, sector.arcRad, t.x, t.y, 12)) registry.add(t);
    };
    const a = { x: px + 40, y: py };        // inside from the first frame
    const b = { x: px + 40, y: py + 4 };    // enters after stepping in
    strikeIfInside(a);
    expect(registry.has(a)).toBe(true);
    /* B was outside during windup, then steps in mid-active */
    const bOutside = { x: px + 20, y: py + 80 };
    expect(inMeleeSector(px, py, tl.swingAngle, sector.reach, sector.arcRad, bOutside.x, bOutside.y, 12)).toBe(false);
    strikeIfInside(b);
    expect(registry.has(b)).toBe(true);
    /* B dodges back out, then returns: already struck, at most once */
    b.x = bOutside.x;
    b.y = bOutside.y;
    strikeIfInside(b);
    b.x = px + 40;
    b.y = py + 4;
    strikeIfInside(b);
    expect(registry.size).toBe(2);
  });

  test('angle wrap-around: the arc works for any aim direction', () => {
    /* aim left; a target to the left hits, to the right does not */
    expect(inMeleeSector(px, py, Math.PI, sector.reach, sector.arcRad, px - 40, py, 12)).toBe(true);
    expect(inMeleeSector(px, py, Math.PI, sector.reach, sector.arcRad, px + 40, py, 12)).toBe(false);
    expect(wrapAngle(2 * Math.PI)).toBeCloseTo(0, 6);
    expect(wrapAngle(Math.PI / 4)).toBeCloseTo(Math.PI / 4, 6);
    expect(wrapAngle(-Math.PI / 4)).toBeCloseTo(-Math.PI / 4, 6);
    expect(Math.abs(wrapAngle(Math.PI))).toBeCloseTo(Math.PI, 6);
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 6);
  });
});

/* ------------------------------------------------------------------ */
/* projectile stepping                                                  */
/* ------------------------------------------------------------------ */

interface SimTarget {
  x: number;
  y: number;
  radius: number;
  hits: number;
}

/** Deterministic mirror of Projectile.advance(): sub-steps capped at
    TILE/4, wall check per sub-step, circle hits with a per-shot hit set
    and pierce accounting. */
function simulateShot(opts: {
  x: number;
  y: number;
  angle: number;
  speed: number;
  dt: number;
  radius: number;
  pierce?: number;
  targets: SimTarget[];
  blocked: ReadonlySet<string>;
  frames?: number;
}): { x: number; y: number; dead: boolean } {
  let { x, y } = opts;
  let pierce = opts.pierce ?? 0;
  let dead = false;
  const hit = new Set<SimTarget>();
  for (let frame = 0; frame < (opts.frames ?? 90) && !dead; frame++) {
    const travel = (opts.speed * opts.dt) / 1000;
    const steps = projectileStepCount(travel, TILE);
    for (let s = 0; s < steps && !dead; s++) {
      const nx = x + (Math.cos(opts.angle) * travel) / steps;
      const ny = y + (Math.sin(opts.angle) * travel) / steps;
      if (!gridLineOfSight(worldWith(opts.blocked), x, y, nx, ny)) {
        dead = true;
        break;
      }
      x = nx;
      y = ny;
      for (const t of opts.targets) {
        if (hit.has(t)) continue;
        const r = opts.radius + t.radius;
        if ((x - t.x) ** 2 + (y - t.y) ** 2 <= r * r && gridLineOfSight(worldWith(opts.blocked), x, y, t.x, t.y)) {
          hit.add(t);
          t.hits++;
          if (pierce > 0) {
            pierce--;
            continue;
          }
          dead = true;
          break;
        }
      }
    }
  }
  return { x, y, dead };
}

describe('projectile stepping', () => {
  test('sub-steps are capped at TILE/4 so no frame interval can tunnel', () => {
    expect(projectileStepCount(0, TILE)).toBe(1);
    expect(projectileStepCount(7.9, TILE)).toBe(1);
    expect(projectileStepCount(8, TILE)).toBe(1);
    expect(projectileStepCount(8.01, TILE)).toBe(2);
    expect(projectileStepCount(21, TILE)).toBe(3);
    for (const dt of FRAME_INTERVALS) {
      /* bolt speed 420 px/s; even a 50 ms stall steps at most 8 px */
      const travel = (420 * dt) / 1000;
      expect(projectileStepLength(travel, TILE)).toBeLessThanOrEqual(TILE / 4 + 1e-9);
    }
  });

  test('point-blank shots hit on the first sub-step, not after flying past', () => {
    for (const dt of FRAME_INTERVALS) {
      const target: SimTarget = { x: 32, y: 16, radius: 12, hits: 0 };
      const r = simulateShot({ x: 16, y: 16, angle: 0, speed: 420, dt, radius: 9, targets: [target], blocked: new Set() });
      expect(target.hits).toBe(1);
      expect(r.dead).toBe(true);
      /* a target centered right on the spawn point */
      const adjacent: SimTarget = { x: 17, y: 16, radius: 2, hits: 0 };
      simulateShot({ x: 16, y: 16, angle: 0, speed: 420, dt, radius: 9, targets: [adjacent], blocked: new Set() });
      expect(adjacent.hits).toBe(1);
    }
  });

  test('piercing shots cross two enemies; each is hit exactly once', () => {
    for (const dt of FRAME_INTERVALS) {
      const first: SimTarget = { x: 96, y: 16, radius: 12, hits: 0 };
      const second: SimTarget = { x: 160, y: 16, radius: 12, hits: 0 };
      simulateShot({ x: 16, y: 16, angle: 0, speed: 420, dt, radius: 9, pierce: 1, targets: [first, second], blocked: new Set() });
      expect(first.hits).toBe(1);
      expect(second.hits).toBe(1);
      /* without pierce the shot dies on the first target */
      const solo: SimTarget = { x: 96, y: 16, radius: 12, hits: 0 };
      const shielded: SimTarget = { x: 160, y: 16, radius: 12, hits: 0 };
      const r = simulateShot({ x: 16, y: 16, angle: 0, speed: 420, dt, radius: 9, targets: [solo, shielded], blocked: new Set() });
      expect(solo.hits).toBe(1);
      expect(shielded.hits).toBe(0);
      expect(r.dead).toBe(true);
    }
  });

  test('walls stop the shot at the boundary for every frame interval', () => {
    /* solid wall occupying columns 2..3 (x in [64, 128)) */
    const blocked = new Set(['2,0', '2,1', '3,0', '3,1']);
    for (const dt of FRAME_INTERVALS) {
      const r = simulateShot({ x: 16, y: 16, angle: 0, speed: 420, dt, radius: 9, targets: [], blocked });
      expect(r.dead).toBe(true);
      expect(r.x).toBeLessThan(64); /* never inside or beyond the wall */
    }
  });

  test('diagonal corners are respected: a clipped corner blocks the shot', () => {
    /* the diagonal ray from (16,16) to (80,80) crosses exactly between
       cells (1,0)/(0,1) into (1,1) and on to (2,2) */
    expect(gridLineOfSight(worldWith(new Set(['1,1'])), 16, 16, 80, 80)).toBe(false);
    expect(gridLineOfSight(worldWith(new Set(['2,2'])), 16, 16, 80, 80)).toBe(false);
    expect(gridLineOfSight(worldWith(new Set(['1,0'])), 16, 16, 80, 80)).toBe(false);
    /* cells off the ray's path stay harmless */
    expect(gridLineOfSight(worldWith(new Set(['2,3'])), 16, 16, 80, 80)).toBe(true);
    expect(gridLineOfSight(worldWith(new Set()), 16, 16, 80, 80)).toBe(true);
    /* the same policy holds along the stepped path of a fast shot */
    for (const dt of FRAME_INTERVALS) {
      const r = simulateShot({ x: 16, y: 16, angle: Math.PI / 4, speed: 420, dt, radius: 9, targets: [], blocked: new Set(['1,1']) });
      expect(r.dead).toBe(true);
      expect(r.x).toBeLessThan(64);
      expect(r.y).toBeLessThan(64);
    }
  });

  test('temporary seals: a barrier blocks damage from its far side, then clears', () => {
    /* an enemy bolt shooting left at a player standing behind the barrier */
    const enemyBolt = { x: 112, y: 16 };
    const player = { x: 40, y: 16 };
    const sealed = new Set(['2,0', '3,0']); /* x in [64, 128) */
    /* sealed: line of sight - and therefore damage - is blocked */
    expect(gridLineOfSight(worldWith(sealed), enemyBolt.x, enemyBolt.y, player.x, player.y)).toBe(false);
    expect(gridLineOfSight(worldWith(new Set()), enemyBolt.x, enemyBolt.y, player.x, player.y)).toBe(true);
    /* the stepped shot cannot cross the seal at any frame interval, and
       removing the seal lets it reach the player */
    for (const dt of FRAME_INTERVALS) {
      const target: SimTarget = { x: player.x, y: player.y, radius: 12, hits: 0 };
      const blockedShot = simulateShot({ x: enemyBolt.x, y: enemyBolt.y, angle: Math.PI, speed: 185, dt, radius: 10, targets: [target], blocked: sealed });
      expect(blockedShot.dead).toBe(true);
      expect(blockedShot.x).toBeGreaterThan(64);
      expect(target.hits).toBe(0);
      const clearedShot = simulateShot({ x: enemyBolt.x, y: enemyBolt.y, angle: Math.PI, speed: 185, dt, radius: 10, targets: [target], blocked: new Set() });
      expect(clearedShot.dead).toBe(true);
      expect(target.hits).toBe(1);
    }
  });
});
