'use client';
/* React-side game store: mirrors game state from the bus and emits commands. */
import { create } from 'zustand';
import { bus } from '@/game/bus';
import type {
  BoonChoice,
  BossState,
  HudState,
  MinimapData,
  PactId,
  PatronId,
  RunStats,
  SaveInfo,
  Settings,
  ShopState,
  Toast,
  UiState,
  UpgradeChoice,
} from '@/game/types';

const SETTINGS_KEY = 'riftbound.settings';
const BEST_KEY = 'riftbound.best';
const SAVE_KEY = 'riftbound.save';
const SHARDS_KEY = 'riftbound.shards';

/** Patron boon offer currently awaiting a choice (mirrors the bus event). */
type BoonPrompt = { patron: PatronId; choices: BoonChoice[] };

export interface BestRecord {
  bestFloor: number;
  bestGold: number;
  runs: number;
  victories: number;
}

const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  screenShake: true,
  reducedFx: false,
};

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* corrupted settings fall back to defaults */
  }
  return DEFAULT_SETTINGS;
}

function loadBest(): BestRecord {
  if (typeof window === 'undefined') return { bestFloor: 0, bestGold: 0, runs: 0, victories: 0 };
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (raw) return { bestFloor: 0, bestGold: 0, runs: 0, victories: 0, ...(JSON.parse(raw) as Partial<BestRecord>) };
  } catch {
    /* ignore */
  }
  return { bestFloor: 0, bestGold: 0, runs: 0, victories: 0 };
}

function loadShards(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(SHARDS_KEY);
    if (raw) {
      const n = Number(JSON.parse(raw));
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  } catch {
    /* corrupted value falls back to zero */
  }
  return 0;
}

export function readSave(): { seed: number; floor: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { seed?: number; floor?: number };
    if (typeof parsed.seed === 'number' && typeof parsed.floor === 'number' && parsed.floor > 0) {
      return { seed: parsed.seed, floor: parsed.floor };
    }
  } catch {
    /* ignore */
  }
  return null;
}

interface GameStore {
  ui: UiState;
  /** where settings/controls/credits panels return to */
  panelReturn: UiState;
  booted: boolean;
  bootProgress: number;
  /** non-null when the game layer failed or stalled; shown in the UI */
  bootError: string | null;
  hud: HudState | null;
  minimap: MinimapData | null;
  boss: BossState | null;
  prompt: string | null;
  roomTitle: { name: string; sub?: string } | null;
  floorCard: { floor: number; name: string } | null;
  levelup: { level: number; choices: UpgradeChoice[] } | null;
  boon: BoonPrompt | null;
  runStats: RunStats | null;
  settings: Settings;
  best: BestRecord;
  saveInfo: SaveInfo | null;
  shop: ShopState | null;
  toasts: Toast[];
  /* meta progression (pact selection is per-run and never persisted) */
  pactSelection: PactId[];
  shards: number;

  setUi: (ui: UiState) => void;
  openPanel: (panel: 'settings' | 'controls' | 'credits') => void;
  closePanel: () => void;
  setBoot: (p: number) => void;
  setBooted: () => void;
  setBootError: (message: string | null) => void;
  setHud: (hud: HudState) => void;
  setMinimap: (m: MinimapData) => void;
  setBoss: (b: BossState | null) => void;
  setPrompt: (t: string | null) => void;
  setRoomTitle: (r: { name: string; sub?: string } | null) => void;
  setFloorCard: (f: { floor: number; name: string } | null) => void;
  setLevelup: (l: { level: number; choices: UpgradeChoice[] } | null) => void;
  setBoon: (b: BoonPrompt | null) => void;
  setRunStats: (s: RunStats) => void;
  pushToast: (t: Toast) => void;
  dropToast: (id: number) => void;
  setSaveInfo: (info: SaveInfo | null) => void;
  setShop: (shop: ShopState | null) => void;
  updateBestFromStats: (s: RunStats) => void;
  togglePact: (id: PactId) => void;
  setPactSelection: (pacts: PactId[]) => void;
  grantShards: (n: number) => void;

  applySettings: (s: Partial<Settings>) => void;

  /* command emitters */
  cmdStart: (seed?: number, pacts?: PactId[]) => void;
  cmdContinue: () => void;
  cmdRestart: () => void;
  cmdQuit: () => void;
  cmdPause: () => void;
  cmdResume: () => void;
  cmdUpgrade: (index: number) => void;
  cmdBoon: (index: number) => void;
  cmdCast: (slot: 'melee' | 'fireball' | 'frost' | 'bolt' | 'whirl' | 'dodge') => void;
  cmdPotion: (kind: 'health' | 'mana') => void;
  cmdInventory: (open: boolean) => void;
  cmdShopBuy: (index: number) => void;
  cmdShopClose: () => void;
  cmdPactsBack: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  ui: 'menu',
  panelReturn: 'menu',
  booted: false,
  bootProgress: 0,
  bootError: null,
  hud: null,
  minimap: null,
  boss: null,
  prompt: null,
  roomTitle: null,
  floorCard: null,
  levelup: null,
  boon: null,
  runStats: null,
  settings: loadSettings(),
  best: loadBest(),
  saveInfo: null,
  shop: null,
  toasts: [],
  pactSelection: [],
  shards: loadShards(),

  setUi: (ui) => set({ ui }),
  openPanel: (panel) => set((st) => ({ ui: panel, panelReturn: st.ui })),
  closePanel: () => set((st) => ({ ui: st.panelReturn })),
  setBoot: (p) => set({ bootProgress: p }),
  setBooted: () => set({ booted: true }),
  setBootError: (bootError) => set({ bootError }),
  setHud: (hud) => set({ hud }),
  setMinimap: (minimap) => set({ minimap }),
  setBoss: (boss) => set({ boss }),
  setPrompt: (prompt) => set({ prompt }),
  setRoomTitle: (roomTitle) => set({ roomTitle }),
  setFloorCard: (floorCard) => set({ floorCard }),
  setLevelup: (levelup) => set({ levelup }),
  setBoon: (boon) => set({ boon }),
  setRunStats: (runStats) => set({ runStats }),
  pushToast: (t) =>
    set((st) => ({
      toasts: [...st.toasts.slice(-4), t],
    })),
  dropToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setSaveInfo: (saveInfo) => set({ saveInfo }),
  setShop: (shop) => set({ shop }),

  updateBestFromStats: (s) => {
    const prev = get().best;
    const next: BestRecord = {
      bestFloor: Math.max(prev.bestFloor, s.floor),
      bestGold: Math.max(prev.bestGold, s.gold),
      runs: prev.runs + 1,
      victories: prev.victories + (s.victory ? 1 : 0),
    };
    try {
      window.localStorage.setItem(BEST_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    set({ best: next });
  },

  togglePact: (id) =>
    set((st) => ({
      pactSelection: st.pactSelection.includes(id)
        ? st.pactSelection.filter((p) => p !== id)
        : [...st.pactSelection, id],
    })),
  setPactSelection: (pactSelection) => set({ pactSelection }),
  grantShards: (n) => {
    if (!Number.isFinite(n) || n <= 0) return;
    const shards = get().shards + Math.floor(n);
    try {
      window.localStorage.setItem(SHARDS_KEY, JSON.stringify(shards));
    } catch {
      /* storage unavailable */
    }
    set({ shards });
  },

  applySettings: (partial) => {
    const settings = { ...get().settings, ...partial };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    set({ settings });
    bus.command({ type: 'settings', settings });
  },

  cmdStart: (seed, pacts) => {
    /* a fresh run begins unsworn; the command carries the chosen oaths */
    set({ pactSelection: [] });
    bus.command({ type: 'start', seed, pacts });
  },
  cmdContinue: () => bus.command({ type: 'continue' }),
  cmdRestart: () => bus.command({ type: 'restart' }),
  cmdQuit: () => bus.command({ type: 'quit' }),
  cmdPause: () => bus.command({ type: 'pause' }),
  cmdResume: () => bus.command({ type: 'resume' }),
  cmdUpgrade: (index) => bus.command({ type: 'upgrade', index }),
  cmdBoon: (index) => bus.command({ type: 'boon', index }),
  cmdCast: (slot) => bus.command({ type: 'cast', slot }),
  cmdPotion: (kind) => bus.command({ type: 'potion', kind }),
  cmdInventory: (open) => bus.command({ type: 'inventory', open }),
  cmdShopBuy: (index) => bus.command({ type: 'shop:buy', index }),
  cmdShopClose: () => bus.command({ type: 'shop:close' }),
  cmdPactsBack: () => bus.command({ type: 'pacts:back' }),
}));

/* ------------------------------------------------------------------ */
/* Bus -> store bridge. Call initBusBridge() once from the client.    */
/* ------------------------------------------------------------------ */

let bridged = false;

export function initBusBridge(): void {
  if (bridged) return;
  bridged = true;
  const s = useGameStore;

  bus.on('boot:progress', ({ p }) => s.getState().setBoot(p));
  bus.on('boot:done', () => {
    s.getState().setBootError(null);
    s.getState().setBooted();
  });
  bus.on('boot:error', ({ message }) => s.getState().setBootError(message));
  bus.on('hud', (hud) => s.getState().setHud(hud));
  bus.on('minimap', (m) => s.getState().setMinimap(m));
  bus.on('boss', (b) => s.getState().setBoss(b));
  bus.on('prompt', (p) => s.getState().setPrompt(p ? p.text : null));
  bus.on('room', (r) => {
    s.getState().setRoomTitle(r);
    window.setTimeout(() => {
      /* clear only if not replaced by a newer card */
      if (s.getState().roomTitle === r) s.getState().setRoomTitle(null);
    }, 2600);
  });
  bus.on('floor', (f) => {
    s.getState().setFloorCard(f);
    window.setTimeout(() => {
      if (s.getState().floorCard === f) s.getState().setFloorCard(null);
    }, 3200);
  });
  bus.on('levelup', (l) => {
    s.getState().setLevelup(l);
    s.getState().setUi('levelup');
  });
  bus.on('boon', (b) => {
    s.getState().setBoon(b);
    s.getState().setUi('boon');
  });
  bus.on('toast', (t) => {
    s.getState().pushToast(t);
    window.setTimeout(() => s.getState().dropToast(t.id), 3600);
  });
  bus.on('gameover', (stats) => {
    s.getState().setRunStats(stats);
    s.getState().setUi('dead');
    s.getState().updateBestFromStats(stats);
    s.getState().grantShards(stats.shards);
  });
  bus.on('victory', (stats) => {
    s.getState().setRunStats(stats);
    s.getState().setUi('victory');
    s.getState().updateBestFromStats(stats);
    s.getState().grantShards(stats.shards);
  });
  bus.on('ui:state', ({ state }) => s.getState().setUi(state));
  bus.on('shop', (shop) => {
    s.getState().setShop(shop);
    s.getState().setUi(shop ? 'shop' : 'playing');
  });
  bus.on('save:exists', ({ exists, info }) => s.getState().setSaveInfo(info ?? null));

  const save = readSave();
  if (save) {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveInfo;
        bus.emit('save:exists', { exists: true, info: parsed });
      }
    } catch {
      /* ignore */
    }
  } else {
    bus.emit('save:exists', { exists: false });
  }
}
