/* Run state (progression, upgrades, relics, boons, pacts, souls, derived
   stats) and helpers the scene/entities use. */
import { PLAYER_BASE, RELICS, UPGRADES, xpForLevel, BOONS, PACT_MAP, pactRewardMult, type BoonDef, type RelicDef } from './config';
import type { PactId, UpgradeId } from './types';

export interface DerivedStats {
  maxHp: number;
  maxMana: number;
  moveSpeed: number;
  meleeDamage: number;
  meleeCooldown: number;
  critChance: number;
  critMult: number;
  fireballDamage: number;
  fireballCooldown: number;
  fireballMana: number;
  frostDamage: number;
  frostMana: number;
  frostCooldown: number;
  frostRadius: number;
  boltDamage: number;
  boltMana: number;
  boltCooldown: number;
  boltCount: number;
  boltPierce: number;
  whirlDamage: number;
  whirlMana: number;
  whirlCooldown: number;
  whirlRadius: number;
  dodgeCooldown: number;
  invulnMs: number;
  manaRegen: number;
  healPotionPct: number;
  manaPotionPct: number;
  lifesteal: number;
  armor: number;
  goldMult: number;
  bossDmgMult: number;
  xpMult: number;
  /* boon effects (0 / 1 defaults when unowned) */
  fireBurnDps: number;
  fireExtraProj: number;
  critBlastPct: number;
  lowHpDamageCut: number;
  frostFreezeMs: number;
  frostManaRefund: number;
  dodgeChillMs: number;
  postHitArmor: number;
  postHitArmorMs: number;
  killHeal: number;
  chainLightningPct: number;
  soulMult: number;
}

export interface SaveData {
  seed: number;
  floor: number;
  level: number;
  xp: number;
  gold: number;
  kills: number;
  timeMs: number;
  upgrades: [UpgradeId, number][];
  relicIds: string[];
  boonIds: string[];
  pacts: PactId[];
  souls: number;
  potions: { health: number; mana: number };
  hp: number;
  mana: number;
}

export class RunState {
  seed: number;
  floor = 1;
  level = 1;
  xp = 0;
  xpNeed = xpForLevel(1);
  gold = 0;
  kills = 0;
  timeMs = 0;
  pendingLevelUps = 0;
  upgrades = new Map<UpgradeId, number>();
  relics: RelicDef[] = [];
  boons: BoonDef[] = [];
  pacts: PactId[] = [];
  souls = 0;
  potions = { health: 1, mana: 1 };
  hp = PLAYER_BASE.maxHp;
  mana = PLAYER_BASE.maxMana;
  stats: DerivedStats;

  constructor(seed: number, pacts: PactId[] = []) {
    this.seed = seed;
    this.pacts = pacts.slice();
    this.stats = computeStats(this);
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
  }

  stacks(id: UpgradeId): number {
    return this.upgrades.get(id) ?? 0;
  }

  hasPact(id: PactId): boolean {
    return this.pacts.includes(id);
  }

  hasBoon(id: string): boolean {
    return this.boons.some((b) => b.id === id);
  }

  /** Combined pact effect multiplier helpers (1 when no pacts apply). */
  pactMult(key: 'enemyHpMult' | 'enemyDmgMult' | 'enemySpeedMult' | 'goldMult' | 'healMult' | 'playerHpMult'): number {
    let mult = 1;
    for (const id of this.pacts) {
      const eff = PACT_MAP[id]?.effect;
      if (eff && eff[key] !== undefined) mult *= eff[key] as number;
    }
    return mult;
  }

  get bossFury(): boolean {
    return this.pacts.includes('fury');
  }

  /** Souls earned so far (elites/champions/bosses drop soul pickups). */
  get shardReward(): number {
    const base = this.souls + this.floor * 3 + Math.floor(this.kills / 4);
    return Math.round(base * pactRewardMult(this.pacts));
  }

  addUpgrade(id: UpgradeId): void {
    this.upgrades.set(id, this.stacks(id) + 1);
    this.stats = computeStats(this);
    if (id === 'maxhp') this.hp = Math.min(this.stats.maxHp, this.hp + 20);
    if (id === 'maxMana') this.mana = Math.min(this.stats.maxMana, this.mana + 20);
  }

  addRelic(id: string): RelicDef | null {
    const owned = this.relics.some((r) => r.id === id);
    if (owned) return null;
    const def = RELICS.find((r) => r.id === id);
    if (!def) return null;
    this.relics.push(def);
    this.stats = computeStats(this);
    return def;
  }

  /** Boons stack by upgrading rarity-of-effect: owning the same boon again is
      refused by the offering pools; returns the boon when acquired. */
  addBoon(id: string): BoonDef | null {
    const owned = this.boons.some((b) => b.id === id);
    if (owned) return null;
    const def = BOONS.find((b) => b.id === id);
    if (!def) return null;
    this.boons.push(def);
    this.stats = computeStats(this);
    return def;
  }

  addXp(amount: number): void {
    this.xp += Math.round(amount * this.stats.xpMult);
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = xpForLevel(this.level);
      this.pendingLevelUps++;
    }
  }

  toSave(): SaveData {
    return {
      seed: this.seed,
      floor: this.floor,
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      kills: this.kills,
      timeMs: this.timeMs,
      upgrades: Array.from(this.upgrades.entries()),
      relicIds: this.relics.map((r) => r.id),
      boonIds: this.boons.map((b) => b.id),
      pacts: this.pacts.slice(),
      souls: this.souls,
      potions: { ...this.potions },
      hp: this.hp,
      mana: this.mana,
    };
  }

  static fromSave(data: SaveData): RunState {
    const run = new RunState(data.seed, data.pacts ?? []);
    run.floor = data.floor;
    run.level = data.level;
    run.xp = data.xp;
    run.xpNeed = xpForLevel(run.level);
    run.gold = data.gold;
    run.kills = data.kills;
    run.timeMs = data.timeMs;
    run.upgrades = new Map(data.upgrades);
    for (const id of data.relicIds) run.addRelic(id);
    for (const id of data.boonIds ?? []) run.addBoon(id);
    run.souls = data.souls ?? 0;
    run.potions = { ...data.potions };
    run.stats = computeStats(run);
    run.hp = Math.min(data.hp, run.stats.maxHp);
    run.mana = Math.min(data.mana, run.stats.maxMana);
    return run;
  }
}

function computeStats(run: RunState): DerivedStats {
  const s = run.stacks.bind(run);
  const goldMult = run.relics.reduce((acc, r) => acc * (r.effect.goldMult ?? 1), 1) * run.pactMult('goldMult');
  const bossDmgMult = run.relics.reduce((acc, r) => acc * (r.effect.bossDmgMult ?? 1), 1);
  const xpMult = run.relics.reduce((acc, r) => acc * (r.effect.xpMult ?? 1), 1);
  const hpMult = run.relics.reduce((acc, r) => acc * (r.effect.hpMult ?? 1), 1) * run.pactMult('playerHpMult');
  const healMult = run.pactMult('healMult');
  const boons = run.boons;
  const boon = (key: keyof BoonDef['effect']): number => boons.reduce((acc, b) => acc + ((b.effect[key] as number | undefined) ?? 0), 0);

  return {
    maxHp: Math.round((PLAYER_BASE.maxHp + 20 * s('maxhp')) * hpMult),
    maxMana: PLAYER_BASE.maxMana + 20 * s('maxMana'),
    moveSpeed: PLAYER_BASE.moveSpeed * (1 + 0.1 * s('moveSpeed')),
    meleeDamage: PLAYER_BASE.meleeDamage * (1 + 0.15 * s('meleeDmg')),
    meleeCooldown: PLAYER_BASE.meleeCooldown / (1 + 0.12 * s('atkSpeed')),
    critChance: PLAYER_BASE.critChance + 0.08 * s('crit') + run.relics.reduce((a, r) => a + (r.effect.critAdd ?? 0), 0),
    critMult: PLAYER_BASE.critMult,
    fireballDamage: PLAYER_BASE.fireballDamage * (1 + 0.2 * s('spellDmg')),
    fireballCooldown: PLAYER_BASE.fireballCooldown / (1 + 0.12 * s('atkSpeed') * 0.5),
    fireballMana: PLAYER_BASE.fireballMana,
    frostDamage: PLAYER_BASE.frostDamage * (1 + 0.2 * s('spellDmg')),
    frostMana: PLAYER_BASE.frostMana,
    frostCooldown: PLAYER_BASE.frostCooldown,
    frostRadius: PLAYER_BASE.frostRadius * (1 + 0.25 * s('frostRadius')) * Math.max(1, boon('frostRadiusMult')),
    boltDamage: PLAYER_BASE.boltDamage * (1 + 0.2 * s('spellDmg')) * Math.max(1, boon('boltDmgMult')),
    boltMana: PLAYER_BASE.boltMana,
    boltCooldown: PLAYER_BASE.boltCooldown / (1 + 0.12 * s('atkSpeed') * 0.5),
    boltCount: 1 + s('extraBolt'),
    boltPierce: boon('boltPierce'),
    whirlDamage: PLAYER_BASE.whirlDamage * (1 + 0.15 * s('meleeDmg')),
    whirlMana: PLAYER_BASE.whirlMana,
    whirlCooldown: PLAYER_BASE.whirlCooldown,
    whirlRadius: PLAYER_BASE.whirlRadius,
    dodgeCooldown:
      PLAYER_BASE.dodgeCooldown *
      (1 - 0.25 * s('dodgeCd')) *
      (1 - run.relics.reduce((a, r) => a + (r.effect.dodgeCharge ?? 0), 0)) *
      (boon('dodgeCdMult') > 0 ? boon('dodgeCdMult') : 1),
    invulnMs: PLAYER_BASE.invulnMs,
    manaRegen: PLAYER_BASE.manaRegen + run.relics.reduce((a, r) => a + (r.effect.manaRegenAdd ?? 0), 0),
    healPotionPct: PLAYER_BASE.healPotionPct * (1 + 0.3 * s('healing')) * healMult,
    manaPotionPct: PLAYER_BASE.manaPotionPct,
    lifesteal: 0.06 * s('lifesteal'),
    armor: 2 * s('armor') + run.relics.reduce((a, r) => a + (r.effect.armorAdd ?? 0), 0),
    goldMult,
    bossDmgMult,
    xpMult,
    /* boons */
    fireBurnDps: boon('fireBurnDps'),
    fireExtraProj: boon('fireExtraProj'),
    critBlastPct: boon('critBlastPct'),
    lowHpDamageCut: boon('lowHpDamageCut'),
    frostFreezeMs: boon('frostFreezeMs'),
    frostManaRefund: boon('frostManaRefund'),
    dodgeChillMs: boon('dodgeChillMs'),
    postHitArmor: boon('postHitArmor'),
    postHitArmorMs: boon('postHitArmorMs'),
    killHeal: boon('killHeal'),
    chainLightningPct: boon('chainLightningPct'),
    soulMult: boon('soulMult') > 0 ? boon('soulMult') : 1,
  };
}

/** Upgrade defs left that can still be offered. */
export function availableUpgrades(run: RunState): typeof UPGRADES {
  return UPGRADES.filter((u) => run.stacks(u.id) < u.maxStacks);
}

/** Boon offering pool: unowned boons, weighted toward one patron per shrine. */
export function boonOffering(run: RunState, patronWeight: import('./types').PatronId, count = 3): BoonDef[] {
  const others = BOONS.filter((b) => b.patron !== patronWeight && !run.hasBoon(b.id));
  const favored = BOONS.filter((b) => b.patron === patronWeight && !run.hasBoon(b.id));
  const rarityWeight = (r: string): number => (r === 'common' ? 5 : r === 'rare' ? 3 : 1);
  const pool: BoonDef[] = [];
  const takeWeighted = (list: BoonDef[]): BoonDef | null => {
    if (list.length === 0) return null;
    const total = list.reduce((a, b) => a + rarityWeight(b.rarity), 0);
    let roll = Math.random() * total;
    for (const b of list) {
      roll -= rarityWeight(b.rarity);
      if (roll <= 0) return b;
    }
    return list[list.length - 1];
  };
  const remaining = () => BOONS.filter((b) => !run.hasBoon(b.id) && !pool.includes(b));
  /* at least one favored option when available */
  if (favored.length > 0) pool.push(takeWeighted(favored)!);
  while (pool.length < count && remaining().length > 0) {
    const rest = remaining();
    const fromFavored = favored.filter((b) => !pool.includes(b));
    /* 65% favored patron fills remaining slots first */
    const list = fromFavored.length > 0 && Math.random() < 0.65 ? fromFavored : rest;
    const pick = takeWeighted(list);
    if (pick) pool.push(pick);
  }
  return pool.slice(0, count);
}
