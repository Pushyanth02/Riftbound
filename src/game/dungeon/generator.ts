/* Seeded procedural dungeon generation: rooms on a slot grid, L-corridors,
   typed rooms (including the authored optional routes: timed challenge,
   trap chamber and secret branch), gates for combat locks, spawn tables
   (with elites and the two phase-3 counters), solid pillar obstacles,
   rubble clutter, room templates with reserved thresholds and validation.

   Everything here is pure data + math (no Phaser) so the test suite can
   exercise it directly. */
import { Rng, subSeed } from '../rng';
import { ENEMIES, FLOORS, OPTIONAL_ROOMS, ROOM_ENEMY_CAP, ROOM_NAMES, type EnemyKind } from '../config';
import type { RoomType } from '../types';

export interface Gate {
  tiles: { x: number; y: number }[];
  otherRoom: number;
}

/** A cracked-wall secret door: its tiles start solid and open on demand,
    changing dungeon topology at runtime. */
export interface SecretDoor {
  id: number;
  /** solid tiles forming the door (all become walkable when opened) */
  tiles: { x: number; y: number }[];
  /** room the corridor leads away from (the publicly reachable side) */
  fromRoom: number;
  /** hidden room behind the wall */
  secretRoom: number;
  /** corridor index connecting fromRoom -> secretRoom */
  corridor: number;
  opened: boolean;
}

export interface TrapPlate {
  x: number;
  y: number;
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
  /** telegraphed floor plates in trap chambers */
  trapPlates: TrapPlate[];
  /** minimap marker; the scene may overwrite this at runtime */
  icon?: 'merchant' | 'champion' | 'boon' | 'shrine' | 'challenge' | 'trap' | 'secret' | 'chest' | null;
  /** reward clue: dashed outline on the map before the room is opened */
  hinted: boolean;
  /** template id used to dress this room (audit/debugging aid) */
  template: string;
}

export interface Corridor {
  x: number;
  y: number;
  w: number;
  h: number;
  roomA: number;
  roomB: number;
  /** true while the corridor passes through a still-sealed secret door */
  hidden?: boolean;
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
  secretDoors: SecretDoor[];
}

const SLOT_W = 26;
const SLOT_H = 18;
const GRID_COLS = 4;
const GRID_ROWS = 3;
const CORRIDOR_HALF = 1; // 3 tiles wide

/* ------------------------------------------------------------------ */
/* Room templates (phase 2)                                           */
/* ------------------------------------------------------------------ */

/** Authored layout descriptors. Each template declares the solid footprint
    (pillar offsets from the room center), the decoration prop offsets, the
    reward anchor (where interactables land) and which rooms it fits.
    Gate thresholds, the boss landing and interaction approach tiles are
    reserved before dressing: templates may only add, never take. */
export interface RoomTemplate {
  id: string;
  fits: (room: { w: number; h: number }) => boolean;
  pillars: [number, number][];
  decorations: { kind: string; dx: number; dy: number }[];
  /** category for biome-aware selection */
  mood: 'arena' | 'vault' | 'trial' | 'shrine' | 'entry';
}

const TEMPLATES: RoomTemplate[] = [
  /* twin aisles: classic read, leaves a center lane to dodge through */
  { id: 'twin-aisles', fits: (r) => r.w >= 13 && r.h >= 9, mood: 'arena',
    pillars: [[-4, 0], [4, 0]], decorations: [] },
  /* staggered cover: forces diagonal approaches around pillars */
  { id: 'staggered-cover', fits: (r) => r.w >= 14 && r.h >= 10, mood: 'arena',
    pillars: [[-3, -2], [3, 2]], decorations: [] },
  /* broken colonnade: four posts, big rooms only */
  { id: 'broken-colonnade', fits: (r) => r.w >= 16 && r.h >= 11, mood: 'arena',
    pillars: [[-4, -2], [-4, 2], [4, -2], [4, 2]], decorations: [] },
  /* single watch pillar for cramped halls */
  { id: 'watch-pillar', fits: () => true, mood: 'arena', pillars: [[0, 0]], decorations: [] },
  /* champion sanctum: torches flanking a shrine approach */
  { id: 'sanctum', fits: (r) => r.w >= 13, mood: 'shrine',
    pillars: [], decorations: [{ kind: 'torch', dx: -4, dy: 1 }, { kind: 'torch', dx: 4, dy: 1 }] },
  /* trial ring for timed challenges: pillars ring the arena edge */
  { id: 'trial-ring', fits: (r) => r.w >= 14 && r.h >= 10, mood: 'trial',
    pillars: [[-5, -2], [5, -2], [-5, 2], [5, 2]], decorations: [] },
  /* spike gallery approach: plates live on the center line (placed by
     dedicated logic), rubble marks the run-up */
  { id: 'spike-gallery', fits: () => true, mood: 'trial',
    pillars: [], decorations: [{ kind: 'arch', dx: -3, dy: 0 }] },
  /* vault: twin braziers guard the reward anchor */
  { id: 'vault', fits: (r) => r.w >= 12, mood: 'vault',
    pillars: [], decorations: [{ kind: 'brazier', dx: -3, dy: 0 }, { kind: 'brazier', dx: 3, dy: 0 }] },
  /* secret reliquary: quiet, unguarded dressing */
  { id: 'reliquary', fits: () => true, mood: 'vault', pillars: [], decorations: [] },
];

const templatesFor = (room: { w: number; h: number }, mood: RoomTemplate['mood']): RoomTemplate[] =>
  TEMPLATES.filter((t) => t.mood === mood && t.fits(room));

/** Reserved-zone helper: gate thresholds, boss landings and interaction
    approach tiles must stay clear of every prop, pillar and spawn. */
interface Reservations {
  has(x: number, y: number): boolean;
  addRect(x: number, y: number, w: number, h: number): void;
  addCross(x: number, y: number, r: number): void;
}

function makeReservations(): Reservations {
  const set = new Set<number>();
  return {
    has: (x, y) => set.has(y * 4096 + x),
    addRect: (x, y, w, h) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set.add(yy * 4096 + xx);
    },
    addCross: (x, y, r) => {
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) set.add(yy * 4096 + xx);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  /** layout attempts before the deterministic fallback kicks in
      (tests pass 0 to exercise the fallback directly) */
  maxAttempts?: number;
}

export function generateDungeon(seed: number, floor: number, opts: GenerateOptions = {}): Dungeon {
  const maxAttempts = opts.maxAttempts ?? 12;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
  const chosen = forceAll ? [startSlot, bossSlot, ...otherSlots] :
    [startSlot, bossSlot, ...otherSlots.slice(0, Math.max(3, wanted - 2))];
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
      trapPlates: [],
      icon: null,
      hinted: false,
      template: '',
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
      if (r.col + dc >= GRID_COLS || r.row + dr >= GRID_ROWS) continue;
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
  if (treeEdges.length !== chosen.length - 1) return null;
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

  const carve = (a: Room, b: Room): number => {
    if (b.slot.col > a.slot.col) {
      /* b is to the right of a */
      const exitY = Math.min(Math.max(b.cy, a.y + 2), a.y + a.h - 3);
      const entryX = Math.min(Math.max(a.cx, b.x + 2), b.x + b.w - 3);
      const hx0 = a.x + a.w - 2;
      const hx1 = entryX;
      const hy = exitY - CORRIDOR_HALF;
      corridors.push({ x: hx0, y: hy, w: hx1 - hx0 + 1, h: 3, roomA: a.id, roomB: b.id });
      const vy0 = Math.min(exitY, b.cy) - CORRIDOR_HALF;
      const vy1 = Math.max(exitY, b.cy) + CORRIDOR_HALF;
      corridors.push({ x: entryX - CORRIDOR_HALF, y: vy0, w: 3, h: vy1 - vy0 + 1, roomA: a.id, roomB: b.id });
      mark(hx0, hy, hx1 - hx0 + 1, 3);
      mark(entryX - CORRIDOR_HALF, vy0, 3, vy1 - vy0 + 1);
      return corridors.length - 2;
    }
    /* b is below a */
    const exitX = Math.min(Math.max(b.cx, a.x + 2), a.x + a.w - 3);
    const entryY = Math.min(Math.max(a.cy, b.y + 2), b.y + b.h - 3);
    const vy0 = a.y + a.h - 2;
    const vy1 = entryY;
    const vx = exitX - CORRIDOR_HALF;
    corridors.push({ x: vx, y: vy0, w: 3, h: vy1 - vy0 + 1, roomA: a.id, roomB: b.id });
    const hx0 = Math.min(exitX, b.cx) - CORRIDOR_HALF;
    const hx1 = Math.max(exitX, b.cx) + CORRIDOR_HALF;
    corridors.push({ x: hx0, y: entryY - CORRIDOR_HALF, w: hx1 - hx0 + 1, h: 3, roomA: a.id, roomB: b.id });
    mark(vx, vy0, 3, vy1 - vy0 + 1);
    mark(hx0, entryY - CORRIDOR_HALF, hx1 - hx0 + 1, 3);
    return corridors.length - 2;
  };

  for (const e of treeEdges) {
    const a = rooms[roomAtSlot.get(e.a)!];
    const b = rooms[roomAtSlot.get(e.b)!];
    if (!a || !b) continue;
    carve(a, b);
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
  if (treasureCount === 2 && rng.chance(0.65)) free[1].type = 'rest';
  const encounterCount = free.length > treasureCount + 1 && rng.chance(0.7) ? 1 : 0;
  if (encounterCount > 0) free[free.length - 1].type = 'encounter';

  /* ---- optional routes (phase 2): convert combat rooms into the timed
     challenge and trap chamber, then append a secret branch when a free
     slot borders an existing room. The main path never depends on them:
     the challenge always fails open, the trap room never locks and the
     secret branch is a dead end. ---- */
  const optionalPool = free.filter((r) => r.type === 'combat' && r !== free[treasureCount] && r !== free[free.length - 1]);
  if (optionalPool.length > 0 && rng.chance(0.8)) {
    const pick = optionalPool[0];
    pick.type = 'challenge';
    pick.name = '';
  }
  const trapPool = free.filter((r) => r.type === 'combat' && r.id !== (optionalPool[0]?.id ?? -1));
  if (trapPool.length > 0 && rng.chance(0.8)) {
    const pick = trapPool[0];
    pick.type = 'trap';
  }

  /* secret branch: one new room in a free slot, connected behind a
     cracked wall so it stays off the critical path entirely. The forced
     fallback layout skips it entirely (no secrets on the retry floor). */
  const secretDoors: SecretDoor[] = [];
  const usedSlots = new Set(rooms.map((r) => r.slot.row * GRID_COLS + r.slot.col));
  if (!forceAll && rng.chance(0.85)) {
    const candidates = rng.shuffle(
      slots.filter((s) => !usedSlots.has(s.row * GRID_COLS + s.col)),
    );
    let branchFailed = false;
    outer: for (const cand of candidates) {
      const neighborDirs: [number, number][] = rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      for (const [dc, dr] of neighborDirs) {
        const nc = cand.col + dc;
        const nr = cand.row + dr;
        /* bounds-check the slot index: a wrapped-around col/row would
           otherwise connect non-adjacent rooms with a map-spanning corridor */
        if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
        const hostId = roomAtSlot.get(nr * GRID_COLS + nc);
        if (hostId === undefined) continue;
        const host = rooms[hostId];
        if (host.type === 'boss' || host.type === 'exit') continue;
        /* small, quiet chamber */
        const w = rng.int(11, 13);
        const h = rng.int(9, 11);
        const x = cand.col * SLOT_W + rng.int(2, Math.max(2, SLOT_W - w - 2));
        const y = cand.row * SLOT_H + rng.int(2, Math.max(2, SLOT_H - h - 2));
        const secret: Room = {
          id: rooms.length,
          x, y, w, h,
          cx: Math.floor(x + w / 2),
          cy: Math.floor(y + h / 2),
          slot: cand,
          type: 'secret',
          name: '',
          discovered: false,
          cleared: true,
          gates: [],
          enemySpawns: [],
          props: [],
          obstacles: [],
          trapPlates: [],
          icon: 'secret',
          hinted: true,
          template: 'reliquary',
        };
        rooms.push(secret);
        roomAtSlot.set(cand.row * GRID_COLS + cand.col, secret.id);
        mark(x, y, w, h);
        /* corridor from host toward the secret room; carve() expects the
           up/left room first */
        const hostFirst = host.slot.col < cand.col || host.slot.row < cand.row;
        const first = hostFirst ? host : secret;
        const second = hostFirst ? secret : host;
        const corridorIndex = carve(first, second);
        /* the corridor mouth at the host side becomes the cracked door:
           solid until the player breaks it open */
        const mouth: { x: number; y: number }[] = [];
        for (const seg of [corridors[corridorIndex], corridors[corridorIndex + 1]]) {
          if (!seg) continue;
          for (let yy = seg.y; yy < seg.y + seg.h; yy++) {
            for (let xx = seg.x; xx < seg.x + seg.w; xx++) {
              const insideHost = xx >= host.x && xx < host.x + host.w && yy >= host.y && yy < host.y + host.h;
              const adjacentToHost =
                (xx === host.x - 1 && yy >= host.y - 1 && yy <= host.y + host.h) ||
                (xx === host.x + host.w && yy >= host.y - 1 && yy <= host.y + host.h) ||
                (yy === host.y - 1 && xx >= host.x - 1 && xx <= host.x + host.w) ||
                (yy === host.y + host.h && xx >= host.x - 1 && xx <= host.x + host.w);
              if (!insideHost && adjacentToHost && !mouth.some((m) => m.x === xx && m.y === yy)) mouth.push({ x: xx, y: yy });
            }
          }
        }
        if (mouth.length === 0) {
          /* geometry did not line up: reject this layout entirely */
          branchFailed = true;
          break outer;
        }
        const door: SecretDoor = {
          id: secretDoors.length,
          tiles: mouth,
          fromRoom: host.id,
          secretRoom: secret.id,
          corridor: corridorIndex,
          opened: false,
        };
        secretDoors.push(door);
        /* seal the door tiles solid + the corridor is hidden on the map */
        for (const t of door.tiles) walkable[t.y * width + t.x] = 0;
        for (const c of corridors) {
          if (c.roomA === host.id && c.roomB === secret.id) c.hidden = true;
        }
        break outer;
      }
    }
    if (branchFailed) return null;
  }

  for (const r of rooms) {
    const pool = ROOM_NAMES[r.type];
    r.name = pool.length > 0 ? rng.pick(pool) : 'Unknown Hall';
    if (r.type === 'boss') r.name = ROOM_NAMES.boss[0];
  }

  /* ---- gates: corridor mouths at each room edge ---- */
  const attachGates = () => {
    for (const c of corridors) {
      const attach = (roomId: number, tiles: { x: number; y: number }[]) => {
        if (!tiles.length) return;
        const room = rooms[roomId];
        if (room.gates.some((g) => g.otherRoom === (c.roomA === roomId ? c.roomB : c.roomA))) return;
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
  };
  attachGates();

  /* ---- enemy spawns, obstacles, templates & dressing ---- */
  const budget = theme.enemyBudget + (floor - 1) * 3;
  const combatRooms = rooms.filter((r) => r.type === 'combat' || r.type === 'challenge');
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
     all enemy spawns, all gate tiles and every reserved tile, plus
     breathing room between each other */
  const obstacleFits = (room: Room, x: number, y: number, reserved: Reservations) =>
    x >= room.x + 3 &&
    x <= room.x + room.w - 4 &&
    y >= room.y + 3 &&
    y <= room.y + room.h - 4 &&
    manhattan(x, y, room.cx, room.cy) >= 3 &&
    clearOfSpawns(room, x, y, 3) &&
    clearOfGates(room, x, y, 3) &&
    !reserved.has(x, y) &&
    room.obstacles.every((o) => chebyshev(o.x, o.y, x, y) >= 2);

  const addPillar = (room: Room, x: number, y: number) => {
    room.obstacles.push({ x, y, kind: 'pillar' });
    walkable[y * width + x] = 0; /* real grid collision */
  };

  const addRubble = (room: Room, x: number, y: number) => {
    room.obstacles.push({ x, y, kind: 'rubble' }); /* stays walkable */
  };

  /* exhaustively enumerate valid spots so small rooms still get their pillars */
  const placeObstacles = (room: Room, count: number, add: typeof addPillar | typeof addRubble, reserved: Reservations) => {
    for (let i = 0; i < count; i++) {
      const candidates: { x: number; y: number }[] = [];
      for (let y = room.y + 3; y <= room.y + room.h - 4; y++) {
        for (let x = room.x + 3; x <= room.x + room.w - 4; x++) {
          if (obstacleFits(room, x, y, reserved)) candidates.push({ x, y });
        }
      }
      if (candidates.length === 0) return;
      const pick = rng.pick(candidates);
      add(room, pick.x, pick.y);
    }
  };

  /* braziers want a quiet corner: 2 tiles off the edges, clear of spawns,
     gates, obstacles and reserved approach tiles */
  const cornerSpots = (room: Room) => [
    { x: room.x + 2, y: room.y + 2 },
    { x: room.x + room.w - 3, y: room.y + 2 },
    { x: room.x + 2, y: room.y + room.h - 3 },
    { x: room.x + room.w - 3, y: room.y + room.h - 3 },
  ];
  const brazierFits = (room: Room, x: number, y: number, reserved: Reservations) =>
    x >= room.x + 2 &&
    x <= room.x + room.w - 3 &&
    y >= room.y + 2 &&
    y <= room.y + room.h - 3 &&
    walkable[y * width + x] === 1 &&
    clearOfSpawns(room, x, y, 2) &&
    clearOfGates(room, x, y, 2) &&
    !reserved.has(x, y) &&
    room.obstacles.every((o) => chebyshev(o.x, o.y, x, y) >= 2);

  const eliteChance = theme.eliteChance + (floor - 1) * 0.03;

  /* reserve the interaction approach ring (1 tile) around a prop anchor */
  const reserveAnchor = (reserved: Reservations, x: number, y: number) => {
    reserved.addCross(x, y, 1);
  };

  for (const room of rooms) {
    /* reservations: gate thresholds (gate tiles + a 1-tile ring), the boss
       landing zone and - added below - every interaction anchor */
    const reserved = makeReservations();
    for (const gate of room.gates) {
      for (const t of gate.tiles) reserved.addCross(t.x, t.y, 1);
    }
    if (room.type === 'boss') {
      /* the Necromancer lands here: keep the whole staging area clear */
      reserved.addRect(room.cx - 2, room.y + 4, 5, 4);
    }

    const spawnEnemyAt = (x: number, y: number, kind: EnemyKind, elite = false) => {
      room.enemySpawns.push({ x, y, kind, ...(elite ? { elite: true } : {}) });
    };

    if (room.type === 'combat' || room.type === 'challenge') {
      const isChallenge = room.type === 'challenge';
      /* pick a template first so reservations account for its anchors */
      const mood: RoomTemplate['mood'] = isChallenge ? 'trial' : 'arena';
      const pool = templatesFor(room, mood);
      const template = pool.length > 0 ? rng.pick(pool) : TEMPLATES[3];
      room.template = template.id;
      /* challenge reward anchor: the trial totem at the far end */
      if (isChallenge) {
        room.props.push({ kind: 'totem', x: room.cx, y: room.y + 2 });
        reserveAnchor(reserved, room.cx, room.y + 2);
      }
      /* pillars first: solid cover that entities must path around; enemy
         spawns then keep their 3-tile distance from every obstacle */
      const mirror = rng.chance(0.5) ? 1 : -1;
      let placedAny = false;
      for (const [dx, dy] of template.pillars) {
        const x = room.cx + dx * mirror;
        const y = room.cy + dy;
        if (obstacleFits(room, x, y, reserved)) {
          addPillar(room, x, y);
          placedAny = true;
        }
      }
      if (!room.obstacles.length && !placedAny) placeObstacles(room, 1, addPillar, reserved);
      /* template decorations */
      for (const d of template.decorations) {
        const x = room.cx + d.dx * mirror;
        const y = room.cy + d.dy;
        if (d.kind === 'torch') {
          if (x >= room.x + 1 && x <= room.x + room.w - 2 && y >= room.y + 1 && y <= room.y + room.h - 2 && walkable[y * width + x] === 1) {
            room.props.push({ kind: 'torch', x, y });
          }
        } else if (d.kind === 'arch') {
          room.props.push({ kind: 'arch', x: room.x + 2, y: room.y + room.h - 2 });
        } else if (d.kind === 'brazier') {
          if (brazierFits(room, x, y, reserved)) room.props.push({ kind: 'brazier', x, y });
        }
      }
      /* rubble: worn debris that never blocks movement */
      placeObstacles(room, rng.int(0, 2), addRubble, reserved);
      const count = rng.int(Math.max(2, perRoom - 1), perRoom + 1) + (isChallenge ? OPTIONAL_ROOMS.challenge.extraEnemies : 0);
      const capped = Math.min(count, ROOM_ENEMY_CAP);
      let guard = 0;
      while (room.enemySpawns.length < capped && guard++ < 240) {
        const x = rng.int(room.x + 1, room.x + room.w - 2);
        const y = rng.int(room.y + 1, room.y + room.h - 2);
        if (!isWalkableIn(room, x, y) || !farFromGates(room, x, y)) continue;
        if (room.enemySpawns.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 3)) continue;
        if (room.obstacles.some((o) => manhattan(o.x, o.y, x, y) < 3)) continue;
        const kind = rng.weighted(theme.enemyPool).kind;
        const elite = kind !== 'orcElite' && kind !== 'sentinel' && rng.chance(eliteChance);
        spawnEnemyAt(x, y, kind, elite);
      }
      /* a lit brazier watching over one corner */
      if (rng.chance(0.5)) {
        for (const spot of rng.shuffle(cornerSpots(room))) {
          if (brazierFits(room, spot.x, spot.y, reserved)) {
            room.props.push({ kind: 'brazier', x: spot.x, y: spot.y });
            break;
          }
        }
      }
    } else if (room.type === 'trap') {
      room.template = 'spike-gallery';
      /* the trap chest anchor sits at the far end; plates form a gauntlet
         along the center line between the room entry and the anchor */
      const chestX = room.cx;
      const chestY = room.y + 2;
      room.props.push({ kind: 'chest', x: chestX, y: chestY });
      reserveAnchor(reserved, chestX, chestY);
      const plateCount = rng.int(...plateCountRange(floor));
      const spanY0 = room.y + 3;
      const spanY1 = room.y + room.h - 2;
      const step = Math.max(1, Math.floor((spanY1 - spanY0) / (plateCount + 1)));
      for (let i = 1; i <= plateCount; i++) {
        const y = spanY0 + i * step;
        const x = room.cx + (rng.chance(0.5) ? -2 : 2);
        if (isWalkableIn(room, x, y) && !reserved.has(x, y)) room.trapPlates.push({ x, y });
      }
      /* one or two wardens prowling the gauntlet */
      const wardens = OPTIONAL_ROOMS.trap.enemies;
      for (let i = 0; i < wardens; i++) {
        let guard = 0;
        while (guard++ < 120) {
          const x = rng.int(room.x + 1, room.x + room.w - 2);
          const y = rng.int(room.y + 1, room.y + room.h - 2);
          if (!isWalkableIn(room, x, y) || !farFromGates(room, x, y)) continue;
          if (room.enemySpawns.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 3)) continue;
          const kind = rng.weighted(theme.enemyPool).kind;
          spawnEnemyAt(x, y, kind, false);
          break;
        }
      }
      if (rng.chance(0.5)) {
        for (const spot of rng.shuffle(cornerSpots(room))) {
          if (brazierFits(room, spot.x, spot.y, reserved)) {
            room.props.push({ kind: 'brazier', x: spot.x, y: spot.y });
            break;
          }
        }
      }
    } else if (room.type === 'secret') {
      room.template = 'reliquary';
      /* patron shrine + bounty behind the cracked wall */
      room.props.push({ kind: 'boonshrine', x: room.cx, y: room.cy });
      reserveAnchor(reserved, room.cx, room.cy);
      const [goldLo, goldHi] = OPTIONAL_ROOMS.secret.gold;
      room.props.push({ kind: 'chest', x: room.cx - 3, y: room.cy + 1 });
      room.props.push({ kind: 'chalice', x: room.cx + 3, y: room.cy - 1 });
      void goldLo;
      void goldHi;
      for (let i = 0; i < OPTIONAL_ROOMS.secret.souls; i++) {
        room.props.push({ kind: 'soulpile', x: room.cx + rng.int(-3, 3), y: room.cy + rng.int(-2, 2) });
      }
    } else if (room.type === 'encounter') {
      room.template = 'sanctum';
      const elite = floor >= FLOORS.length - 1 || floor >= 2;
      if (elite) {
        room.enemySpawns.push({ x: room.cx, y: room.cy + 2, kind: 'orcElite' });
      } else {
        room.enemySpawns.push({ x: room.cx - 3, y: room.cy + 2, kind: 'orc' });
        room.enemySpawns.push({ x: room.cx + 3, y: room.cy + 2, kind: 'orc' });
      }
      room.props.push({ kind: 'shrine', x: room.cx, y: room.cy - 1 });
      reserveAnchor(reserved, room.cx, room.cy - 1);
      /* twin torches flank the champion's ground */
      for (const dx of [-4, 4]) {
        const x = room.cx + dx;
        const y = room.cy + 1;
        if (x >= room.x + 1 && x <= room.x + room.w - 2 && y >= room.y + 1 && y <= room.y + room.h - 2 && walkable[y * width + x] === 1) {
          room.props.push({ kind: 'torch', x, y });
        }
      }
    } else if (room.type === 'rest') {
      room.template = 'vault';
      room.props.push({ kind: 'shrine', x: room.cx, y: room.cy });
      reserveAnchor(reserved, room.cx, room.cy);
      room.props.push({ kind: 'brazier', x: room.cx - 3, y: room.cy });
      room.props.push({ kind: 'brazier', x: room.cx + 3, y: room.cy });
    } else if (room.type === 'treasure') {
      room.template = 'vault';
      room.props.push({ kind: 'chest', x: room.cx, y: room.cy });
      reserveAnchor(reserved, room.cx, room.cy);
      if (rng.chance(0.5)) room.props.push({ kind: 'chest', x: room.cx + 3, y: room.cy + rng.int(-1, 1) });
      if (floor <= 2 && rng.chance(0.75)) {
        room.props.push({ kind: 'merchant', x: room.cx - 4, y: room.cy + 1 });
        reserveAnchor(reserved, room.cx - 4, room.cy + 1);
      }
      room.props.push({ kind: 'chalice', x: room.cx + rng.int(-5, 5), y: room.cy - 2 });
    } else if (room.type === 'boss') {
      /* the Necromancer himself is placed by the scene, not the spawn table */
      room.template = 'sanctum';
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
        if (reserved.has(x, y)) continue;
        if (room.obstacles.some((o) => chebyshev(o.x, o.y, x, y) < 2)) continue;
        addPillar(room, x, y);
      }
    } else if (room.type === 'start') {
      room.template = 'entry';
      /* dressing for the entry hall */
      room.props.push({ kind: 'arch', x: room.x + 2, y: room.y + room.h - 3 });
      room.props.push({ kind: 'chalice', x: room.cx + 4, y: room.cy + 1 });
      room.props.push({ kind: 'chalice', x: room.cx - 4, y: room.cy - 2 });
      for (const spot of rng.shuffle(cornerSpots(room))) {
        if (brazierFits(room, spot.x, spot.y, reserved)) {
          room.props.push({ kind: 'brazier', x: spot.x, y: spot.y });
          break;
        }
      }
    } else if (room.type === 'exit') {
      room.template = 'vault';
      room.props.push({ kind: 'portal', x: room.cx, y: room.cy });
      reserveAnchor(reserved, room.cx, room.cy);
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
    else if (room.type === 'challenge') room.icon = 'challenge';
    else if (room.type === 'trap') room.icon = 'trap';
    else if (room.type === 'secret') room.icon = 'secret';
    else if (room.props.some((p) => p.kind === 'merchant')) room.icon = 'merchant';
    else if (room.type === 'treasure') room.icon = 'chest';
  }
  /* secret reward clue: once the host room is discovered the map shows a
     dashed outline + marker on the hidden branch (before any decision) */
  for (const door of secretDoors) {
    rooms[door.secretRoom].hinted = true;
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
    secretDoors,
  };
}

/** Plate-count range for the trap chamber (scales mildly with depth). */
function plateCountRange(floor: number): [number, number] {
  const base = OPTIONAL_ROOMS.trap.plates;
  const add = floor >= 3 ? 1 : 0;
  return [Math.min(base[0] + add, base[1]), base[1]];
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Flood fill from a start tile over a given walkable grid. */
function floodFill(d: { width: number; height: number; walkable: Uint8Array }, sx: number, sy: number, walkable: Uint8Array): Set<number> {
  const { width, height } = d;
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
  push(sx, sy);
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const reachable = new Set<number>();
  for (let i = 0; i < seen.length; i++) if (seen[i] === 1) reachable.add(i);
  return reachable;
}

/** A copy of the walkable grid with the secret doors opened (post-open
    topology: used to verify the hidden branch becomes reachable). */
export function walkableWithDoorsOpen(d: Dungeon): Uint8Array {
  const grid = d.walkable.slice();
  for (const door of d.secretDoors) {
    for (const t of door.tiles) grid[t.y * d.width + t.x] = 1;
  }
  return grid;
}

function validate(d: Dungeon): boolean {
  const { width, walkable } = d;
  const s = d.rooms[d.startRoom];

  /* 1. doors closed: the main objective must be reachable even if the
     player skips or fails every optional encounter */
  const seen = floodFill(d, s.cx, s.cy, walkable);
  for (const r of d.rooms) {
    if (r.type === 'secret') continue;
    if (!seen.has(r.cy * width + r.cx)) return false;
  }
  /* spawn positions, interaction anchors and their approach tiles must be
     on reachable walkable tiles */
  for (const r of d.rooms) {
    const grid = r.type === 'secret' ? walkableWithDoorsOpen(d) : walkable;
    const reach = r.type === 'secret' ? floodFill(d, s.cx, s.cy, grid) : seen;
    for (const prop of r.props) {
      if (['chest', 'shrine', 'merchant', 'portal', 'boonshrine', 'totem', 'soulpile'].includes(prop.kind)) {
        if (!reach.has(prop.y * width + prop.x)) return false;
        /* interaction approach tiles: at least one orthogonal neighbor of
           every interactable must be reachable walkable ground */
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
        if (!neighbors.some(([dx, dy]) => reach.has((prop.y + dy) * width + (prop.x + dx)))) return false;
      }
    }
    for (const sp of r.enemySpawns) {
      if (!reach.has(sp.y * width + sp.x)) return false;
    }
    for (const plate of r.trapPlates) {
      if (!reach.has(plate.y * width + plate.x)) return false;
    }
  }
  /* gate clearance: every gate tile of every non-secret room is reachable;
     the gate toward a secret room is the cracked wall itself (still solid) */
  for (const r of d.rooms) {
    if (r.type === 'secret') continue;
    for (const g of r.gates) {
      if (d.rooms[g.otherRoom]?.type === 'secret') continue;
      for (const t of g.tiles) {
        if (!seen.has(t.y * width + t.x)) return false;
      }
    }
  }
  /* 2. doors open: the secret branch and its contents are reachable */
  if (d.secretDoors.length > 0) {
    const openGrid = walkableWithDoorsOpen(d);
    const openSeen = floodFill(d, s.cx, s.cy, openGrid);
    for (const door of d.secretDoors) {
      const secret = d.rooms[door.secretRoom];
      /* isolation invariant while closed: the branch is unreachable until
         the cracked wall breaks (no corridor bleed from the main network) */
      if (seen.has(secret.cy * width + secret.cx)) return false;
      if (!openSeen.has(secret.cy * width + secret.cx)) return false;
      for (const prop of secret.props) {
        if (['chest', 'shrine', 'merchant', 'portal', 'boonshrine', 'soulpile'].includes(prop.kind)) {
          if (!openSeen.has(prop.y * width + prop.x)) return false;
        }
      }
    }
  }
  /* boss room must not be the start room */
  if (d.bossRoom === d.startRoom) return false;
  /* obstacles must live inside their room rect; pillars must be solid;
     entire solid footprints never sit on a gate tile or interactable */
  for (const r of d.rooms) {
    for (const ob of r.obstacles) {
      if (ob.x < r.x || ob.x >= r.x + r.w || ob.y < r.y || ob.y >= r.y + r.h) return false;
      if (ob.kind === 'pillar' && d.walkable[ob.y * d.width + ob.x] !== 0) return false;
      if (ob.kind === 'pillar') {
        for (const g of r.gates) {
          if (g.tiles.some((t) => t.x === ob.x && t.y === ob.y)) return false;
        }
        for (const p of r.props) {
          if (['chest', 'shrine', 'merchant', 'portal', 'boonshrine', 'totem'].includes(p.kind) && p.x === ob.x && p.y === ob.y) return false;
        }
      }
    }
  }
  /* secret door tiles must currently be solid and inside the map */
  for (const door of d.secretDoors) {
    for (const t of door.tiles) {
      if (t.x < 0 || t.y < 0 || t.x >= d.width || t.y >= d.height) return false;
      if (d.walkable[t.y * width + t.x] !== 0) return false;
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
