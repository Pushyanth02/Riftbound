/* RIFTBOUND: ECHOES OF THE FALLEN - shared types (game <-> UI contract) */

export type UiState =
  | 'menu'
  | 'pacts'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'levelup'
  | 'boon'
  | 'inventory'
  | 'shop'
  | 'settings'
  | 'controls'
  | 'credits'
  | 'dead'
  | 'victory';

export type WeaponId = 'sword' | 'knife' | 'cleaver';
export type RoomType = 'start' | 'combat' | 'rest' | 'treasure' | 'encounter' | 'boss' | 'exit';

export type UpgradeId =
  | 'maxhp'
  | 'meleeDmg'
  | 'spellDmg'
  | 'atkSpeed'
  | 'crit'
  | 'moveSpeed'
  | 'dodgeCd'
  | 'maxMana'
  | 'fireSplash'
  | 'extraBolt'
  | 'frostRadius'
  | 'healing'
  | 'lifesteal'
  | 'armor';

export interface UpgradeChoice {
  id: UpgradeId;
  name: string;
  desc: string;
  icon: string; // path under /assets/
  stacks: number;
  maxStacks: number;
}

export interface RelicInfo {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

/* ------------------------------ boons ------------------------------ */

export type PatronId = 'ember' | 'frost' | 'void';
export type BoonRarity = 'common' | 'rare' | 'epic';

export interface BoonInfo {
  id: string;
  name: string;
  desc: string;
  icon: string;
  patron: PatronId;
  rarity: BoonRarity;
}

export interface BoonChoice extends BoonInfo {
  /** already-owned indicator */
  owned: boolean;
}

/* ------------------------------ pacts ------------------------------ */

export type PactId = 'hardened' | 'relentless' | 'swift' | 'frailty' | 'barren' | 'fury';

export interface PactInfo {
  id: PactId;
  name: string;
  desc: string;
  rewardMult: number;
  icon: string;
}

/* ------------------------------ HUD ------------------------------ */

export interface HudState {
  objective: string;
  boltCharge: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  xpNeed: number;
  gold: number;
  floor: number;
  maxFloor: number;
  floorName: string;
  potions: { health: number; mana: number };
  /** remaining cooldown fraction 0..1 keyed by slot */
  cooldowns: {
    melee: number;
    fireball: number;
    frost: number;
    bolt: number;
    whirl: number;
    dodge: number;
  };
  relics: RelicInfo[];
  boons: BoonInfo[];
  souls: number;
  pactCount: number;
}

export interface BossState {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  phase: number;
  phases: number;
  /** true for encounter-room champions (smaller stakes framing) */
  champion?: boolean;
}

export interface MinimapRoom {
  x: number; // tile coords
  y: number;
  w: number;
  h: number;
  type: RoomType;
  discovered: boolean;
  cleared: boolean;
  current: boolean;
  lockedTiles: { x: number; y: number }[];
  /** marker for special contents (only meaningful when discovered) */
  icon?: 'merchant' | 'champion' | 'boon' | 'shrine' | null;
}

export interface MinimapCorridor {
  x: number;
  y: number;
  w: number;
  h: number;
  roomA: number;
  roomB: number;
}

export interface MinimapData {
  rooms: MinimapRoom[];
  corridors: MinimapCorridor[];
  player: { x: number; y: number; heading: number };
  width: number;
  height: number;
}

export interface RunStats {
  seed: number;
  floor: number;
  level: number;
  gold: number;
  kills: number;
  timeMs: number;
  victory: boolean;
  relics: RelicInfo[];
  boons: BoonInfo[];
  upgrades: { id: UpgradeId; name: string; stacks: number }[];
  souls: number;
  shards: number;
  pacts: PactId[];
}

export interface Settings {
  master: number; // 0..1
  music: number;
  sfx: number;
  screenShake: boolean;
  reducedFx: boolean;
}

export interface Toast {
  id: number;
  text: string;
  icon?: string;
}

export interface SaveInfo {
  seed: number;
  floor: number;
  level: number;
  gold: number;
  timeMs: number;
}

export interface ShopWare {
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: number;
  kind: 'potion-h' | 'potion-m' | 'relic' | 'boon';
  sold: boolean;
}

export interface ShopState {
  wares: ShopWare[];
  gold: number;
}

/* ------------------------- bus event map ------------------------- */

export interface BusEvents {
  'boot:progress': { p: number };
  'boot:done': undefined;
  'boot:error': { message: string };
  'run:start': { seed: number; floor: number };
  hud: HudState;
  minimap: MinimapData;
  prompt: { text: string } | null;
  boss: BossState | null;
  levelup: { level: number; choices: UpgradeChoice[] };
  boon: { patron: PatronId; choices: BoonChoice[] };
  toast: Toast;
  room: { name: string; sub?: string };
  floor: { floor: number; name: string };
  gameover: RunStats;
  victory: RunStats;
  'ui:state': { state: UiState };
  'save:exists': { exists: boolean; info?: SaveInfo };
  shop: ShopState | null;
}

export type BusEventKey = keyof BusEvents;

export type Command =
  | { type: 'start'; seed?: number; pacts?: PactId[]; weapon?: WeaponId }
  | { type: 'continue' }
  | { type: 'restart' }
  | { type: 'quit' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'upgrade'; index: number }
  | { type: 'boon'; index: number }
  | { type: 'pacts:back' }
  | { type: 'cast'; slot: 'melee' | 'fireball' | 'frost' | 'bolt' | 'whirl' | 'dodge' }
  | { type: 'potion'; kind: 'health' | 'mana' }
  | { type: 'settings'; settings: Settings }
  | { type: 'inventory'; open: boolean }
  | { type: 'shop:buy'; index: number }
  | { type: 'shop:close' };

export interface BusCommands {
  cmd: Command;
}
