/* Combat primitives: the pure, deterministic core of melee timing, input
   buffering, bolt charging, sector geometry and projectile stepping.

   This module is shared by the live entities (Player, Projectile) and the
   gameplay tests, so the timing policies exercised by the tests are the same
   code the game runs. It must stay free of Phaser imports. */
import { MELEE, PLAYER_BASE, TILE, WEAPONS } from './config';
import type { WeaponId } from './types';

/* ------------------------------------------------------------------ */
/* angle helpers                                                        */
/* ------------------------------------------------------------------ */

/** Wrap an angle in radians to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = (angle + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return a - Math.PI;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/* ------------------------------------------------------------------ */
/* melee cadence + hit-area geometry                                    */
/* ------------------------------------------------------------------ */

export type MeleePhase = 'none' | 'windup' | 'active' | 'recover';

export interface MeleeCadence {
  /** input to first damaging frame */
  windupMs: number;
  /** how long the arc keeps accepting newly entered targets */
  activeMs: number;
  /** locked recovery before the next swing may start */
  recoverMs: number;
  /** how long a queued input stays buffered */
  bufferMs: number;
  /** idle time after a swing before the combo index resets */
  comboResetMs: number;
}

/** Weapon cadence: phase durations scale by the weapon tempo. */
export function meleeCadenceFor(weapon: WeaponId): MeleeCadence {
  const tempo = WEAPONS[weapon].tempo;
  return {
    windupMs: MELEE.windupMs * tempo,
    activeMs: MELEE.activeMs * tempo,
    recoverMs: MELEE.recoverMs * tempo,
    bufferMs: PLAYER_BASE.attackBufferMs,
    comboResetMs: PLAYER_BASE.comboResetMs,
  };
}

export interface MeleeSector {
  /** maximum distance from the body center to the far edge of a target */
  reach: number;
  /** full arc width in radians */
  arcRad: number;
}

/** Hit-area shape for the given weapon and combo index (1-3). */
export function meleeSectorFor(weapon: WeaponId, comboIndex: number): MeleeSector {
  const isThird = comboIndex === 3;
  return {
    reach: PLAYER_BASE.meleeRange * WEAPONS[weapon].reach * (isThird ? MELEE.finisherReachMult : 1),
    arcRad: degToRad(PLAYER_BASE.meleeArcDeg * WEAPONS[weapon].arc * (isThird ? MELEE.finisherArcMult : 1)),
  };
}

/** True when a target circle overlaps the melee sector. Distance uses
    `reach + target radius` (matching the live hit resolution), and the
    target center must sit within half the arc width of the aim angle. */
export function inMeleeSector(
  px: number,
  py: number,
  aimAngle: number,
  reach: number,
  arcRad: number,
  tx: number,
  ty: number,
  targetRadius: number,
): boolean {
  const dx = tx - px;
  const dy = ty - py;
  const d = Math.hypot(dx, dy);
  if (d > reach + targetRadius) return false;
  const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - aimAngle));
  return diff <= arcRad / 2;
}

/* ------------------------------------------------------------------ */
/* melee timeline (phases, buffering, combo, hit registry)              */
/* ------------------------------------------------------------------ */

export type MeleeSwingEvent =
  | { type: 'swing-start'; combo: number }
  | { type: 'active-start'; angle: number }
  | { type: 'recover-start' }
  | { type: 'swing-end' };

/**
 * Deterministic melee state machine: phase transitions, the input buffer,
 * the combo counter and the per-swing hit registry.
 *
 * - `queue()` starts a swing when free, otherwise buffers the input for
 *   `bufferMs`; inputs buffered earlier than that window expire unused.
 * - `tick()` advances phases each frame and reports the transition, so the
 *   caller can fire lunge/VFX/damage side effects at the right frame.
 * - The swing direction locks when the active window opens (the aim angle
 *   captured at `active-start`), matching the in-game feel.
 * - `hitSet` guarantees one hit per target per swing; the live resolver
 *   re-checks it every active frame, so a target that enters the sector
 *   mid-swing is still struck once.
 */
export class MeleeTimeline {
  phase: MeleePhase = 'none';
  phaseUntil = 0;
  comboIndex = 0;
  /** cooldown gate set at swing start (now + meleeCooldown) */
  readyAt = 0;
  bufferedUntil = -1;
  /** locked swing direction (captured at active-start) */
  swingAngle = 0;
  readonly hitSet = new Set<unknown>();

  /** A swing may start only when idle, off cooldown and not dodging. */
  canSwing(now: number, busyUntil = 0): boolean {
    return this.phase === 'none' && now >= Math.max(this.readyAt, busyUntil);
  }

  /** Player input: start immediately when able, otherwise buffer it. */
  queue(now: number, cadence: MeleeCadence, cooldownMs: number, busyUntil = 0): MeleeSwingEvent | null {
    if (this.canSwing(now, busyUntil)) {
      this.startSwing(now, cadence, cooldownMs);
      return { type: 'swing-start', combo: this.comboIndex };
    }
    this.bufferedUntil = now + cadence.bufferMs;
    return null;
  }

  private startSwing(now: number, cadence: MeleeCadence, cooldownMs: number): void {
    if (now > this.readyAt + cadence.comboResetMs) this.comboIndex = 0;
    this.bufferedUntil = -1;
    this.comboIndex = (this.comboIndex % 3) + 1;
    this.phase = 'windup';
    this.phaseUntil = now + cadence.windupMs;
    this.hitSet.clear();
    this.readyAt = now + cooldownMs;
  }

  /**
   * Advance the state machine for this frame. Returns the transition that
   * happened, or null. Order of operations matches the live update loop:
   * buffered inputs fire while idle, in-flight swings advance on expiry,
   * and hits are resolved by the caller while `phase === 'active'` and
   * `now < phaseUntil`.
   */
  tick(now: number, cadence: MeleeCadence, cooldownMs: number, aimAngle: number, busyUntil = 0): MeleeSwingEvent | null {
    if (this.phase === 'none') {
      if (this.bufferedUntil >= now && this.canSwing(now, busyUntil)) {
        this.startSwing(now, cadence, cooldownMs);
        return { type: 'swing-start', combo: this.comboIndex };
      }
      return null;
    }
    if (now < this.phaseUntil) return null;
    if (this.phase === 'windup') {
      this.phase = 'active';
      this.phaseUntil = now + cadence.activeMs;
      this.swingAngle = aimAngle;
      return { type: 'active-start', angle: aimAngle };
    }
    if (this.phase === 'active') {
      this.phase = 'recover';
      this.phaseUntil = now + cadence.recoverMs;
      return { type: 'recover-start' };
    }
    this.phase = 'none';
    return { type: 'swing-end' };
  }

  /** Dodge roll (or any hard interrupt): drop the swing and the buffer. */
  cancel(): void {
    this.phase = 'none';
    this.bufferedUntil = -1;
  }
}

/* ------------------------------------------------------------------ */
/* bolt charging                                                        */
/* ------------------------------------------------------------------ */

/**
 * Deterministic charge state for the held Arcane Bolt. The owning entity
 * guards cast-readiness and mana; the tracker only owns progress and
 * interruption semantics (damage taken or dodging cancels the charge).
 */
export class ChargeTracker {
  private startAt: number | null = null;

  constructor(readonly chargeMs: number) {}

  get active(): boolean {
    return this.startAt !== null;
  }

  begin(now: number): boolean {
    if (this.startAt !== null) return false;
    this.startAt = now;
    return true;
  }

  /** 0 when idle, otherwise 0..1 charge progress. */
  progress(now: number): number {
    if (this.startAt === null) return 0;
    return Math.min(1, (now - this.startAt) / this.chargeMs);
  }

  cancel(): void {
    this.startAt = null;
  }

  /** True when the full hold completed. */
  fullyCharged(now: number): boolean {
    return this.progress(now) >= 1;
  }
}

/* ------------------------------------------------------------------ */
/* projectile stepping                                                  */
/* ------------------------------------------------------------------ */

/**
 * Number of collision sub-steps for one frame of projectile travel.
 * Steps are capped at TILE/4 px so a projectile can never tunnel through
 * a wall corner or skip past a target between checks, at any frame rate.
 */
export function projectileStepCount(travelPx: number, tile: number): number {
  return Math.max(1, Math.ceil(travelPx / (tile / 4)));
}

/** Per-sub-step travel distance in pixels. */
export function projectileStepLength(travelPx: number, tile: number): number {
  return travelPx / projectileStepCount(travelPx, tile);
}

/** Re-exported so tests can drive the same TILE the game uses. */
export const STEP_TILE = TILE;
