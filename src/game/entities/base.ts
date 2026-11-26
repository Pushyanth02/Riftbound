/* Entity base + grid collision helpers shared by all world entities. */
import * as Phaser from 'phaser';
import type { Dungeon } from '../dungeon/generator';
import { TILE } from '../config';

export interface GridWorld {
  dungeon: Dungeon;
  walkableAtPx(x: number, y: number): boolean;
}

/** True when the whole feet-rect (centered on x, y) stands on walkable tiles. */
export function feetWalkable(world: GridWorld, x: number, y: number, halfW: number, halfH: number): boolean {
  return (
    world.walkableAtPx(x - halfW, y - halfH) &&
    world.walkableAtPx(x + halfW, y - halfH) &&
    world.walkableAtPx(x - halfW, y + halfH) &&
    world.walkableAtPx(x + halfW, y + halfH)
  );
}

/** Shared scratch result for moveGrid. Every caller consumes the result
    immediately (setPos(moved.x, moved.y)), so one reusable object avoids a
    fresh allocation per entity per frame. */
const moveGridScratch = { x: 0, y: 0 };

/** Axis-separated movement against the walkable grid. Returns final position
    (a shared scratch object - copy the values out, do not retain it). */
export function moveGrid(
  world: GridWorld,
  x: number,
  y: number,
  dx: number,
  dy: number,
  halfW: number,
  halfH: number,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (dx !== 0) {
    const tryX = x + dx;
    if (feetWalkable(world, tryX, y, halfW, halfH)) nx = tryX;
  }
  if (dy !== 0) {
    const tryY = y + dy;
    if (feetWalkable(world, nx, tryY, halfW, halfH)) ny = tryY;
  }
  moveGridScratch.x = nx;
  moveGridScratch.y = ny;
  return moveGridScratch;
}

/** Bresenham line-of-sight over the walkable grid (pixel coordinates). */
export function gridLineOfSight(world: GridWorld, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = world.dungeon;
  let tx = Math.floor(x0 / TILE);
  let ty = Math.floor(y0 / TILE);
  const ex = Math.floor(x1 / TILE);
  const ey = Math.floor(y1 / TILE);
  let count = 0;
  while ((tx !== ex || ty !== ey) && count++ < 80) {
    if (tx !== ex) tx += Math.sign(ex - tx);
    else if (ty !== ey) ty += Math.sign(ey - ty);
    if (tx === ex && ty === ey) break;
    if (d.walkable[ty * d.width + tx] !== 1) return false;
  }
  return true;
}

export type EntityState = 'idle' | 'active' | 'dead';

export abstract class Entity {
  sprite: Phaser.GameObjects.Sprite;
  x = 0;
  y = 0;
  radius = 12;
  state: EntityState = 'idle';
  dead = false;
  protected shadow: Phaser.GameObjects.Image | null = null;

  constructor(sprite: Phaser.GameObjects.Sprite) {
    this.sprite = sprite;
  }

  get pos(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Ground ellipse that keeps characters visually planted. */
  protected attachShadow(w: number, h: number, alpha = 0.34): void {
    if (this.shadow || !this.sprite.scene) return;
    this.shadow = this.sprite.scene.add.image(this.x, this.y, 'entity_shadow');
    this.shadow.setDisplaySize(w, h);
    this.shadow.setAlpha(alpha);
    this.shadow.setTint(0x0e0a14);
    this.shadow.setDepth(this.y - 2);
  }

  setPos(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sprite.setPosition(x, y);
    /* skip redundant depth writes: setDepth dirties the display list and
       forces a full re-sort of every child, so only mark it when the
       Y-ordering actually changed */
    if (this.sprite.depth !== y) this.sprite.setDepth(y);
    if (this.shadow) {
      this.shadow.setPosition(x, y + 1);
      if (this.shadow.depth !== y - 2) this.shadow.setDepth(y - 2);
    }
  }

  abstract update(dt: number): void;

  destroy(): void {
    this.shadow?.destroy();
    this.shadow = null;
    this.sprite.destroy();
  }
}

/** Distance helper without allocations. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
