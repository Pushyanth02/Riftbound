/* Renders a generated dungeon: floor tilemap, wall sprites with per-tile
   depth for Y-sorting, pillar obstacles, rubble decals, props, torches.
   Collision stays grid-based. */
import * as Phaser from 'phaser';
import { TILE } from '../config';
import type { Dungeon, Room } from './generator';

/* Terrain tileset (36 cols): verified ids from the inspected sheet. */
const FLOOR_STONE = [491, 455, 456, 492, 457, 493, 458, 494];
const FLOOR_STONE_WEAR = [493, 458, 494, 495, 459];
const FLOOR_GRASS = [234, 198, 199, 270, 271, 200];
const DECALS = [451, 452, 453, 454, 53];

/* Wall tileset (10 cols): cap over face assembly per the inspected sheet. */
const W_FACE = 21;
const W_FACE_END_L = 20;
const W_FACE_END_R = 22;
const W_FACE_VAR = [21, 26, 51];
const W_CAP = 11;
const W_CAP_END_L = 10;
const W_CAP_END_R = 12;
const W_CAP_VAR = [11, 16];

export interface BuiltDungeon {
  floorLayer: Phaser.Tilemaps.TilemapLayer;
  wallImages: Phaser.GameObjects.Image[];
  decals: Phaser.GameObjects.Image[];
}

export function buildDungeon(scene: Phaser.Scene, dungeon: Dungeon): BuiltDungeon {
  const { width, height, walkable } = dungeon;
  const rng = new Phaser.Math.RandomDataGenerator([String(dungeon.seed ^ (dungeon.floor * 7717))]);

  /* ---------------- floor tilemap ---------------- */
  const data: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(-1);
    }
    data.push(row);
  }
  const roomOf = new Int16Array(width * height).fill(-1);
  for (const room of dungeon.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        roomOf[y * width + x] = room.id;
      }
    }
  }

  const theme = dungeon.floor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (walkable[y * width + x] !== 1) continue;
      const roomId = roomOf[y * width + x];
      const inRoom = roomId >= 0;
      const room = inRoom ? dungeon.rooms[roomId] : null;
      let tile: number;
      const roll = rng.frac();
      if (inRoom && room && room.type === 'start' && theme === 1 && roll < 0.22) {
        tile = FLOOR_GRASS[rng.between(0, FLOOR_GRASS.length - 1)];
      } else if (inRoom && room && (room.type === 'encounter' || room.type === 'treasure') && roll < 0.12) {
        tile = FLOOR_GRASS[rng.between(0, FLOOR_GRASS.length - 1)];
      } else if (roll < (theme >= 2 ? 0.18 : 0.1)) {
        tile = FLOOR_STONE_WEAR[rng.between(0, FLOOR_STONE_WEAR.length - 1)];
      } else if (roll < 0.28) {
        tile = FLOOR_STONE[rng.between(3, 5)];
      } else {
        tile = FLOOR_STONE[rng.between(0, 2)];
      }
      data[y][x] = tile;
    }
  }
  const map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage('terrain', 'tiles_terrain', TILE, TILE, 0, 0);
  if (!tileset) throw new Error('terrain tileset failed to register');
  const floorLayer = map.createLayer(0, tileset, 0, 0)!;
  floorLayer.setDepth(-100);

  /* ---------------- wall sprites ---------------- */
  const decals: Phaser.GameObjects.Image[] = [];
  const wallImages: Phaser.GameObjects.Image[] = [];
  const wallFrames = new Map<number, number>();
  /* pillar bases (and the stacked cap tile above them) are rendered by the
     obstacle pass below; keep the wall passes from double-drawing them */
  const pillarTiles = new Set<number>();
  for (const room of dungeon.rooms) {
    for (const ob of room.obstacles) {
      if (ob.kind !== 'pillar') continue;
      pillarTiles.add(ob.y * width + ob.x);
      pillarTiles.add((ob.y - 1) * width + ob.x);
    }
  }
  const isWalk = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && walkable[y * width + x] === 1;

  const placeWall = (x: number, y: number, frame: number): void => {
    const key = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (pillarTiles.has(key)) return;
    if (wallFrames.has(key)) return;
    wallFrames.set(key, frame);
    const img = scene.add.image((x + 0.5) * TILE, (y + 0.5) * TILE, 'tiles_walls', frame);
    img.setDepth((y + 1) * TILE - 1);
    wallImages.push(img);
  };

  /* pass 1: tiles with an orthogonal walkable neighbor */
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isWalk(x, y)) continue;
      const walkBelow = isWalk(x, y + 1);
      const walkAbove = isWalk(x, y - 1);
      const walkLeft = isWalk(x - 1, y);
      const walkRight = isWalk(x + 1, y);
      if (!walkBelow && !walkAbove && !walkLeft && !walkRight) continue;

      if (walkBelow) {
        /* visible face with a cap stone stacked above it */
        if (walkLeft && !walkRight) placeWall(x, y, W_FACE_END_R);
        else if (walkRight && !walkLeft) placeWall(x, y, W_FACE_END_L);
        else placeWall(x, y, rng.frac() < 0.82 ? W_FACE : W_FACE_VAR[rng.between(0, W_FACE_VAR.length - 1)]);
        if (!isWalk(x, y - 1)) {
          placeWall(x, y - 1, rng.frac() < 0.85 ? W_CAP : W_CAP_VAR[rng.between(0, W_CAP_VAR.length - 1)]);
        }
      } else {
        /* cap surface */
        if (walkLeft && !walkRight) placeWall(x, y, W_CAP_END_R);
        else if (walkRight && !walkLeft) placeWall(x, y, W_CAP_END_L);
        else placeWall(x, y, rng.frac() < 0.85 ? W_CAP : W_CAP_VAR[rng.between(0, W_CAP_VAR.length - 1)]);
      }
    }
  }

  /* pass 2: fill concave corners (diagonal-only adjacency) when they
     touch an existing wall piece, so no floating fragments spawn */
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isWalk(x, y) || wallFrames.has(y * width + x) || pillarTiles.has(y * width + x)) continue;
      const diag = isWalk(x - 1, y - 1) || isWalk(x + 1, y - 1) || isWalk(x - 1, y + 1) || isWalk(x + 1, y + 1);
      if (!diag) continue;
      const touchesWall =
        wallFrames.has((y - 1) * width + x) ||
        wallFrames.has((y + 1) * width + x) ||
        wallFrames.has(y * width + x - 1) ||
        wallFrames.has(y * width + x + 1);
      if (touchesWall) {
        placeWall(x, y, rng.frac() < 0.85 ? W_CAP : W_CAP_VAR[rng.between(0, W_CAP_VAR.length - 1)]);
      }
    }
  }

  /* ---------------- room obstacles ---------------- */
  for (const room of dungeon.rooms) {
    for (const ob of room.obstacles) {
      if (ob.kind === 'pillar') {
        /* two-tile-tall pillar: capped base plus a stacked cap above it */
        const base = scene.add.image((ob.x + 0.5) * TILE, (ob.y + 0.5) * TILE, 'tiles_walls', W_CAP);
        base.setDepth((ob.y + 1) * TILE - 1);
        const topFrame = rng.frac() < 0.7 ? W_CAP : W_CAP_VAR[rng.between(0, W_CAP_VAR.length - 1)];
        const top = scene.add.image((ob.x + 0.5) * TILE, (ob.y - 0.5) * TILE, 'tiles_walls', topFrame);
        top.setDepth(ob.y * TILE - 1);
        if (rng.frac() < 0.5) {
          base.setTint(0xf2e6d8);
          top.setTint(0xf2e6d8);
        }
        wallImages.push(base, top);
      } else {
        /* rubble: a ground decal, never a barrier */
        const img = scene.add.image((ob.x + 0.5) * TILE, (ob.y + 0.5) * TILE, 'tiles_terrain', DECALS[rng.between(0, DECALS.length - 1)]);
        decals.push(img);
        img.setDepth(-90);
        img.setAlpha(0.85);
      }
    }
  }

  /* ---------------- floor decals (rubble) ---------------- */
  for (const room of dungeon.rooms) {
    if (room.type === 'start' || room.type === 'boss') continue;
    const decalCount = Math.floor((room.w * room.h) / 20);
    for (let i = 0; i < decalCount; i++) {
      const x = rng.between(room.x + 1, room.x + room.w - 2);
      const y = rng.between(room.y + 1, room.y + room.h - 2);
      if (walkable[y * width + x] !== 1) continue;
      /* keep decal tiles clear of prop/spawn hot spots by luck of the draw */
      const frame = DECALS[rng.between(0, DECALS.length - 1)];
      const img = scene.add.image((x + 0.5) * TILE, (y + 0.5) * TILE, 'tiles_terrain', frame);
      decals.push(img);
      img.setDepth(-90);
      img.setAlpha(0.92);
    }
  }

  return { floorLayer, wallImages, decals };
}

/** Room display helper: center pixel position of a room. */
export function roomCenter(room: Room): { x: number; y: number } {
  return { x: (room.cx + 0.5) * TILE, y: (room.cy + 0.5) * TILE };
}
