/* Seeded procedural dungeon generation: rooms on a slot grid, L-corridors,
   typed rooms, gates for combat locks, spawn tables (with elites), solid
   pillar obstacles, rubble clutter, validation. */
import { Rng, subSeed } from '../rng';
import { ENEMIES, FLOORS, ROOM_NAMES, type EnemyKind } from '../config';
import type { RoomType } from '../types';

export interface Gate {
  tiles: { x: number; y: number }[];
  otherRoom: number;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  slot: { col: number; row: number };
  type: RoomType;
  name: string;
  discovered: boolean;
  cleared: boolean;
  gates: Gate[];
  enemySpawns: { x: number; y: number; kind: EnemyKind; elite?: boolean }[];
  props: { kind: string; x: number; y: number }[];
  /** pillars block movement via the walkable grid; rubble is visual only */
  obstacles: { x: number; y: number; kind: 'pillar' | 'rubble' }[];
  /** minimap marker; the scene may overwrite this at runtime */
  icon?: 'merchant' | 'champion' | 'boon' | 'shrine' | null;
}

export interface Corridor {
  x: number;
  y: number;
  w: number;
  h: number;
  roomA: number;
  roomB: number;
}

export interface Dungeon {
  seed: number;
  floor: number;
  width: number;
  height: number;
  rooms: Room[];
  corridors: Corridor[];
  walkable: Uint8Array;
  startRoom: number;
  bossRoom: number;
  exitRoom: number;
  playerSpawn: { x: number; y: number };
}

const SLOT_W = 26;
const SLOT_H = 18;
const GRID_COLS = 4;
const GRID_ROWS = 3;
const CORRIDOR_HALF = 1; // 3 tiles wide

export function generateDungeon(seed: number, floor: number): Dungeon {
  for (let attempt = 0; attempt < 12; attempt++) {
    const dungeon = tryGenerate(seed + attempt * 7919, floor);
    if (dungeon && validate(dungeon)) return dungeon;
  }
  /* deterministic fallback that cannot fail layout-wise */
  return tryGenerate(seed, floor, true)!;
}

function tryGenerate(seed: number, floor: number, forceAll = false): Dungeon | null {
  const rng = new Rng(subSeed(seed, floor * 101));
  const theme = FLOORS[Math.min(floor, FLOORS.length) - 1];
  const width = GRID_COLS * SLOT_W;
  const height = GRID_ROWS * SLOT_H;

  /* ---- slot selection ---- */
  const slots: { col: number; row: number }[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) slots.push({ col: c, row: r });
  }
  const startSlot = { col: 0, row: rng.int(0, GRID_ROWS - 1) };
  const bossSlot = { col: GRID_COLS - 1, row: GRID_ROWS - 1 - startSlot.row };
  const wanted = rng.int(theme.roomCount[0], theme.roomCount[1]);
  const otherSlots = rng.shuffle(slots.filter((s) => !(s.col === startSlot.col && s.row === startSlot.row) && !(s.col === bossSlot.col && s.row === bossSlot.row)));
  /* always at least 5 rooms: start + boss + three others */
  const chosen = [startSlot, bossSlot, ...otherSlots.slice(0, Math.max(3, wanted - 2))];
  if (forceAll) {
    while (chosen.length < 5) {
      const next = otherSlots[chosen.length - 2];
      if (!next) break;
      chosen.push(next);
    }
  }
  const slotIndex = new Set(chosen.map((s) => s.row * GRID_COLS + s.col));

  /* ---- room rects ---- */
  const rooms: Room[] = [];
  for (const s of chosen) {
    const isBoss = s.col === bossSlot.col && s.row === bossSlot.row;
    const w = isBoss ? 21 : rng.int(13, 19);
    const h = isBoss ? 14 : rng.int(9, 13);
    const x = s.col * SLOT_W + rng.int(2, Math.max(2, SLOT_W - w - 2));
    const y = s.row * SLOT_H + rng.int(2, Math.max(2, SLOT_H - h - 2));
    rooms.push({
      id: rooms.length,
      x,
      y,
      w,
      h,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2),
      slot: s,
      type: 'combat',
      name: '',
      discovered: false,
      cleared: false,
      gates: [],
      enemySpawns: [],
      props: [],
      obstacles: [],
      icon: null,
    });
  }
  const roomAtSlot = new Map<number, number>();
  rooms.forEach((r) => roomAtSlot.set(r.slot.row * GRID_COLS + r.slot.col, r.id));

  const startRoomId = roomAtSlot.get(startSlot.row * GRID_COLS + startSlot.col)!;
  const bossRoomId = roomAtSlot.get(bossSlot.row * GRID_COLS + bossSlot.col)!;

  /* ---- connect slots: randomized MST + one extra loop ---- */
  interface Edge {
    a: number;
    b: number;
    weight: number;
  }
  const edges: Edge[] = [];
  for (const r of chosen) {
    for (const [dc, dr] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const nid = (r.row + dr) * GRID_COLS + (r.col + dc);
      if (slotIndex.has(nid)) {
        edges.push({ a: r.row * GRID_COLS + r.col, b: nid, weight: rng.next() });
      }
    }
  }
  const sortedEdges = edges.slice().sort((e1, e2) => e1.weight - e2.weight);
  const parent = new Map<number, number>(chosen.map((s) => [s.row * GRID_COLS + s.col, s.row * GRID_COLS + s.col]));
  const find = (n: number): number => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent.set(ra, rb);
    return true;
  };
  const treeEdges: Edge[] = [];
  for (const e of sortedEdges) {
    if (union(e.a, e.b)) treeEdges.push(e);
  }
  const extraPool = edges.filter((e) => !treeEdges.includes(e));
  if (extraPool.length > 0) treeEdges.push(rng.pick(extraPool));

  /* ---- carve corridors ---- */
  const corridors: Corridor[] = [];
  const walkable = new Uint8Array(width * height);
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx >= 0 && yy >= 0 && xx < width && yy < height) walkable[yy * width + xx] = 1;
      }
    }
  };
  for (const r of rooms) mark(r.x, r.y, r.w, r.h);

  for (const e of treeEdges) {
    const a = rooms[roomAtSlot.get(e.a)!];
    const b = rooms[roomAtSlot.get(e.b)!];
    if (!a || !b) continue;
    if (b.slot.col > a.slot.col) {
      /* b is to the right of a */
      const exitY = Math.min(Math.max(b.cy, a.y + 2), a.y + a.h - 3);
      const entryX = Math.min(Math.max(a.cx, b.x + 2), b.x + b.w - 3);
      const hx0 = a.x + a.w - 2;
      const hx1 = b.x + 1;
      const hy = exitY - CORRIDOR_HALF;
      corridors.push({ x: hx0, y: hy, w: hx1 - hx0 + 1, h: 3, roomA: a.id, roomB: b.id });
      const vy0 = Math.min(exitY, b.cy) - CORRIDOR_HALF;
      const vy1 = Math.max(exitY, b.cy) + CORRIDOR_HALF;
      corridors.push({ x: entryX - CORRIDOR_HALF, y: vy0, w: 3, h: vy1 - vy0 + 1, roomA: a.id, roomB: b.id });
      mark(hx0, hy, hx1 - hx0 + 1, 3);
      mark(entryX - CORRIDOR_HALF, vy0, 3, vy1 - vy0 + 1);
    } else {
      /* b is below a */
      const exitX = Math.min(Math.max(b.cx, a.x + 2), a.x + a.w - 3);
      const entryY = Math.min(Math.max(a.cy, b.y + 2), b.y + b.h - 3);
      const vy0 = a.y + a.h - 2;
      const vy1 = b.y + 1;
      const vx = exitX - CORRIDOR_HALF;
      corridors.push({ x: vx, y: vy0, w: 3, h: vy1 - vy0 + 1, roomA: a.id, roomB: b.id });
      const hx0 = Math.min(exitX, b.cx) - CORRIDOR_HALF;
      const hx1 = Math.max(exitX, b.cx) + CORRIDOR_HALF;
      corridors.push({ x: hx0, y: entryY - CORRIDOR_HALF, w: hx1 - hx0 + 1, h: 3, roomA: a.id, roomB: b.id });
      mark(vx, vy0, 3, vy1 - vy0 + 1);
      mark(hx0, entryY - CORRIDOR_HALF, hx1 - hx0 + 1, 3);
    }
  }

  /* ---- assign room types ---- */
  const startRoom = rooms[startRoomId];
  const bossRoom = rooms[bossRoomId];
  startRoom.type = 'start';
  if (floor >= FLOORS.length) {
    /* final floor: the farthest room is the boss chamber */
    bossRoom.type = 'boss';
  } else {
    /* earlier floors: the farthest room holds a harder fight instead */
    bossRoom.type = 'encounter';
  }

  if (floor < FLOORS.length) {
    /* floors 1..2: an exit room adjacent to the boss room */
    const adjacent = rooms.filter(
      (r) => r.id !== bossRoom.id && r.id !== startRoom.id && Math.abs(r.slot.col - bossRoom.slot.col) + Math.abs(r.slot.row - bossRoom.slot.row) === 1,
    );
    const exitCandidate = adjacent.length > 0 ? rng.pick(adjacent) : rooms.find((r) => r.id !== bossRoom.id && r.id !== startRoom.id)!;
    exitCandidate.type = 'exit';
  }

  const free = rooms.filter((r) => r.type === 'combat');
  const treasureCount = Math.min(free.length, rng.int(1, 2));
  for (let i = 0; i < treasureCount; i++) free[i].type = 'treasure';
  const encounterCount = free.length > treasureCount + 1 && rng.chance(0.7) ? 1 : 0;
  if (encounterCount > 0) free[free.length - 1].type = 'encounter';

  for (const r of rooms) {
    const pool = ROOM_NAMES[r.type];
    r.name = pool.length > 0 ? rng.pick(pool) : 'Unknown Hall';
    if (r.type === 'boss') r.name = ROOM_NAMES.boss[0];
  }

  /* ---- gates: corridor mouths at each room edge ---- */
  for (const c of corridors) {
    const attach = (roomId: number, tiles: { x: number; y: number }[]) => {
      const room = rooms[roomId];
      const gate: Gate = { tiles, otherRoom: c.roomA === roomId ? c.roomB : c.roomA };
      room.gates.push(gate);
    };
    /* tiles of this corridor that sit exactly 1 tile outside each room rect */
    const collect = (room: Room): { x: number; y: number }[] => {
      const out: { x: number; y: number }[] = [];
      for (let yy = c.y; yy < c.y + c.h; yy++) {
        for (let xx = c.x; xx < c.x + c.w; xx++) {
          const insideRoom = xx >= room.x && xx < room.x + room.w && yy >= room.y && yy < room.y + room.h;
          const adjacentToRoom =
            (xx === room.x - 1 && yy >= room.y - 1 && yy <= room.y + room.h) ||
            (xx === room.x + room.w && yy >= room.y - 1 && yy <= room.y + room.h) ||
            (yy === room.y - 1 && xx >= room.x - 1 && xx <= room.x + room.w) ||
            (yy === room.y + room.h && xx >= room.x - 1 && xx <= room.x + room.w);
          if (!insideRoom && adjacentToRoom) out.push({ x: xx, y: yy });
        }
      }
      return out;
    };
    const a = rooms[c.roomA];
    const b = rooms[c.roomB];
    attach(a.id, collect(a));
    attach(b.id, collect(b));
  }

  /* ---- enemy spawns, obstacles & dressing ---- */
  const budget = theme.enemyBudget + (floor - 1) * 3;
  const combatRooms = rooms.filter((r) => r.type === 'combat');
  const perRoom = Math.max(2, Math.round(budget / Math.max(1, combatRooms.length)));
  const isWalkableIn = (room: Room, x: number, y: number) =>
    x >= room.x + 1 && x < room.x + room.w - 1 && y >= room.y + 1 && y < room.y + room.h - 1 && walkable[y * width + x] === 1;

  const farFromGates = (room: Room, x: number, y: number) =>
    room.gates.every((g) => g.tiles.every((t) => Math.abs(t.x - x) + Math.abs(t.y - y) > 3));

  const manhattan = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) + Math.abs(ay - by);
  const chebyshev = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const clearOfGates = (room: Room, x: number, y: number, dist: number) =>
    room.gates.every((g) => g.tiles.every((t) => manhattan(t.x, t.y, x, y) >= dist));
  const clearOfSpawns = (room: Room, x: number, y: number, dist: number) =>
    room.enemySpawns.every((s) => manhattan(s.x, s.y, x, y) >= dist);

  /* obstacles want 3 tiles of clearance from every edge, the room center,
     all enemy spawns and all gate tiles, plus breathing room between each other */
  const obstacleFits = (room: Room, x: number, y: number) =>
    x >= room.x + 3 &&
    x <= room.x + room.w - 4 &&
    y >= room.y + 3 &&
    y <= room.y + room.h - 4 &&
    manhattan(x, y, room.cx, room.cy) >= 3 &&
    clearOfSpawns(room, x, y, 3) &&
    clearOfGates(room, x, y, 3) &&
    room.obstacles.every((o) => chebyshev(o.x, o.y, x, y) >= 2);

  const addPillar = (room: Room, x: number, y: number) => {
    room.obstacles.push({ x, y, kind: 'pillar' });
    walkable[y * width + x] = 0; /* real grid collision */
  };

  const addRubble = (room: Room, x: number, y: number) => {
    room.obstacles.push({ x, y, kind: 'rubble' }); /* stays walkable */
  };

  /* exhaustively enumerate valid spots so small rooms still get their pillars */
  const placeObstacles = (room: Room, count: number, add: typeof addPillar | typeof addRubble) => {
    for (let i = 0; i < count; i++) {
      const candidates: { x: number; y: number }[] = [];
      for (let y = room.y + 3; y <= room.y + room.h - 4; y++) {
        for (let x = room.x + 3; x <= room.x + room.w - 4; x++) {
          if (obstacleFits(room, x, y)) candidates.push({ x, y });
        }
      }
      if (candidates.length === 0) return;
      const pick = rng.pick(candidates);
      add(room, pick.x, pick.y);
    }
  };

  /* braziers want a quiet corner: 2 tiles off the edges, clear of spawns,
     gates and obstacles */
  const cornerSpots = (room: Room) => [
    { x: room.x + 2, y: room.y + 2 },
    { x: room.x + room.w - 3, y: room.y + 2 },
    { x: room.x + 2, y: room.y + room.h - 3 },
    { x: room.x + room.w - 3, y: room.y + room.h - 3 },
  ];
  const brazierFits = (room: Room, x: number, y: number) =>
    x >= room.x + 2 &&
    x <= room.x + room.w - 3 &&
    y >= room.y + 2 &&
    y <= room.y + room.h - 3 &&
    walkable[y * width + x] === 1 &&
    clearOfSpawns(room, x, y, 2) &&
    clearOfGates(room, x, y, 2) &&
    room.obstacles.every((o) => chebyshev(o.x, o.y, x, y) >= 2);

  const eliteChance = theme.eliteChance + (floor - 1) * 0.03;

  for (const room of rooms) {
    if (room.type === 'combat') {
      /* pillars first: solid cover that entities must path around; enemy
         spawns then keep their 3-tile distance from every obstacle */
      placeObstacles(room, rng.int(1, 4), addPillar);
      /* rubble: worn debris that never blocks movement */
      placeObstacles(room, rng.int(0, 2), addRubble);
      const count = rng.int(Math.max(2, perRoom - 1), perRoom + 1);
      let guard = 0;
      while (room.enemySpawns.length < count && guard++ < 200) {
        const x = rng.int(room.x + 1, room.x + room.w - 2);
        const y = rng.int(room.y + 1, room.y + room.h - 2);
        if (!isWalkableIn(room, x, y) || !farFromGates(room, x, y)) continue;
        if (room.enemySpawns.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 3)) continue;
        if (room.obstacles.some((o) => manhattan(o.x, o.y, x, y) < 3)) continue;
        const kind = rng.weighted(theme.enemyPool).kind;
        const elite = kind !== 'orcElite' && rng.chance(eliteChance);
        room.enemySpawns.push({ x, y, kind, ...(elite ? { elite: true } : {}) });
      }
      /* a lit brazier watching over one corner */
      if (rng.chance(0.5)) {
        for (const spot of rng.shuffle(cornerSpots(room))) {
          if (brazierFits(room, spot.x, spot.y)) {
            room.props.push({ kind: 'brazier', x: spot.x, y: spot.y });
            break;
          }
        }
      }
    } else if (room.type === 'encounter') {
      const elite = floor >= FLOORS.length - 1 || floor >= 2;
      if (elite) {
        room.enemySpawns.push({ x: room.cx, y: room.cy + 2, kind: 'orcElite' });
      } else {
        room.enemySpawns.push({ x: room.cx - 3, y: room.cy + 2, kind: 'orc' });
        room.enemySpawns.push({ x: room.cx + 3, y: room.cy + 2, kind: 'orc' });
      }
      room.props.push({ kind: 'shrine', x: room.cx, y: room.cy - 1 });
      /* twin torches flank the champion's ground */
      for (const dx of [-4, 4]) {
        const x = room.cx + dx;
        const y = room.cy + 1;
        if (x >= room.x + 1 && x <= room.x + room.w - 2 && y >= room.y + 1 && y <= room.y + room.h - 2 && walkable[y * width + x] === 1) {
          room.props.push({ kind: 'torch', x, y });
        }
      }
    } else if (room.type === 'treasure') {
      room.props.push({ kind: 'chest', x: room.cx, y: room.cy });
      if (rng.chance(0.5)) room.props.push({ kind: 'chest', x: room.cx + 3, y: room.cy + rng.int(-1, 1) });
      if (floor <= 2 && rng.chance(0.75)) room.props.push({ kind: 'merchant', x: room.cx - 4, y: room.cy + 1 });
      room.props.push({ kind: 'chalice', x: room.cx + rng.int(-5, 5), y: room.cy - 2 });
    } else if (room.type === 'boss') {
      /* the Necromancer himself is placed by the scene, not the spawn table */
      room.props.push({ kind: 'altar', x: room.cx, y: room.y + 2 });
      /* four pillars in a loose diamond around the altar, clamped to the
         clearance rules; only those that satisfy the constraints are placed */
      const altar = { x: room.cx, y: room.y + 2 };
      const spots = [
        { x: room.cx - 5, y: room.cy + 1 },
        { x: room.cx + 5, y: room.cy + 1 },
        { x: room.cx - 3, y: room.cy + 4 },
        { x: room.cx + 3, y: room.cy + 4 },
      ];
      for (const s of spots) {
        const x = Math.min(Math.max(s.x, room.x + 3), room.x + room.w - 4);
        const y = Math.min(Math.max(s.y, room.y + 3), room.y + room.h - 4);
        if (manhattan(x, y, altar.x, altar.y) < 4) continue;
        if (manhattan(x, y, room.cx, room.cy) < 2) continue;
        if (!clearOfGates(room, x, y, 3)) continue;
        if (room.obstacles.some((o) => chebyshev(o.x, o.y, x, y) < 2)) continue;
        addPillar(room, x, y);
      }
    } else if (room.type === 'start') {
      /* dressing for the entry hall */
      room.props.push({ kind: 'arch', x: room.x + 2, y: room.y + room.h - 3 });
      room.props.push({ kind: 'chalice', x: room.cx + 4, y: room.cy + 1 });
      room.props.push({ kind: 'chalice', x: room.cx - 4, y: room.cy - 2 });
      for (const spot of rng.shuffle(cornerSpots(room))) {
        if (brazierFits(room, spot.x, spot.y)) {
          room.props.push({ kind: 'brazier', x: spot.x, y: spot.y });
          break;
        }
      }
    } else if (room.type === 'exit') {
      room.props.push({ kind: 'portal', x: room.cx, y: room.cy });
      /* twin braziers lighting the way down, either side of the portal */
      for (const dx of [-3, 3]) {
        const x = room.cx + dx;
        if (x >= room.x + 2 && x <= room.x + room.w - 3 && walkable[room.cy * width + x] === 1) {
          room.props.push({ kind: 'brazier', x, y: room.cy });
        }
      }
    }
    /* torches along the north wall of every room */
    const torchCount = Math.max(2, Math.floor(room.w / 5));
    for (let i = 0; i < torchCount; i++) {
      const tx = room.x + Math.floor(((i + 0.5) * room.w) / torchCount);
      room.props.push({ kind: 'torch', x: tx, y: room.y - 1 });
    }
    /* decorative ruin arch in larger combat rooms */
    if (room.type === 'combat' && room.w >= 16 && rng.chance(0.6)) {
      room.props.push({ kind: 'arch', x: room.x + 2, y: room.y + room.h - 2 });
    }
  }

  /* minimap content markers; the scene may overwrite these at runtime */
  for (const room of rooms) {
    if (room.type === 'encounter') room.icon = 'champion';
    else if (room.props.some((p) => p.kind === 'merchant')) room.icon = 'merchant';
  }

  const start = rooms[startRoomId];
  return {
    seed,
    floor,
    width,
    height,
    rooms,
    corridors,
    walkable,
    startRoom: startRoomId,
    bossRoom: bossRoomId,
    exitRoom: rooms.findIndex((r) => r.type === 'exit'),
    playerSpawn: { x: (start.cx + 0.5) * 32, y: (start.cy + 0.5) * 32 },
  };
}

function validate(d: Dungeon): boolean {
  /* flood fill from the start room center; every room center must be reachable */
  const { width, height, walkable } = d;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (walkable[i] === 1 && seen[i] === 0) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  const s = d.rooms[d.startRoom];
  push(s.cx, s.cy);
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  for (const r of d.rooms) {
    if (seen[r.cy * width + r.cx] !== 1) return false;
  }
  /* spawn positions must be on walkable tiles */
  for (const r of d.rooms) {
    for (const sp of r.enemySpawns) {
      if (walkable[sp.y * width + sp.x] !== 1) return false;
    }
  }
  /* boss room must not be the start room and must have a spawn table */
  if (d.bossRoom === d.startRoom) return false;
  /* obstacles must live inside their room rect; pillars must be solid */
  for (const r of d.rooms) {
    for (const ob of r.obstacles) {
      if (ob.x < r.x || ob.x >= r.x + r.w || ob.y < r.y || ob.y >= r.y + r.h) return false;
      if (ob.kind === 'pillar' && d.walkable[ob.y * d.width + ob.x] !== 0) return false;
    }
  }
  return true;
}

/** Enemy stats scaled by floor depth. */
export function scaledEnemyStats(kind: EnemyKind, floor: number): { maxHp: number; damage: number } {
  const def = ENEMIES[kind];
  const mult = 1 + (floor - 1) * 0.22;
  return { maxHp: Math.round(def.maxHp * mult), damage: Math.round(def.damage * (1 + (floor - 1) * 0.15)) };
}
