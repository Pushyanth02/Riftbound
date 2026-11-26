/* RIFTBOUND - centralized, data-driven game configuration. */
import type { BoonInfo, PactId, PactInfo, RelicInfo, UpgradeChoice, UpgradeId } from './types';

export const TILE = 32;
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 3.2;

export const PALETTE = {
  ink: 0x140e1d,
  stone: 0x25202f,
  shadow: 0x34243d,
  gold: 0xd9ad62,
  ember: 0xd95252,
  violet: 0x9868e8,
  cyan: 0x65d9d0,
  bone: 0xe8dcc9,
};

/* ------------------------------ player ------------------------------ */

export const PLAYER_BASE = {
  maxHp: 100,
  maxMana: 60,
  moveSpeed: 150, // px/s world space
  meleeDamage: 12,
  meleeCooldown: 480, // ms
  meleeRange: 58, // px from body center
  meleeArcDeg: 100,
  critChance: 0.06,
  critMult: 1.8,
  fireballDamage: 18,
  fireballMana: 12,
  fireballCooldown: 900,
  fireballSpeed: 300,
  frostDamage: 14,
  frostMana: 18,
  frostCooldown: 3200,
  frostRadius: 110,
  frostSlowFactor: 0.45,
  frostSlowMs: 2600,
  boltDamage: 9,
  boltMana: 6,
  boltCooldown: 650,
  boltSpeed: 420,
  whirlDamage: 16,
  whirlMana: 14,
  whirlCooldown: 3600,
  whirlRadius: 92,
  dodgeCooldown: 1400,
  dodgeSpeed: 460,
  dodgeMs: 210,
  invulnMs: 650, // post-hit invulnerability
  manaRegen: 2.4, // per second
  healPotionPct: 0.4,
  manaPotionPct: 0.5,
  pickupRadius: 30,
  interactRadius: 64,
};

/* ------------------------------ upgrades ------------------------------ */

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  icon: string;
  maxStacks: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'maxhp', name: 'Oath of Iron', desc: '+20 maximum health, and mend 20.', icon: '/assets/icons/relic_shield.png', maxStacks: 8 },
  { id: 'meleeDmg', name: 'Sharpened Steel', desc: 'Blades bite 15% deeper.', icon: '/assets/icons/melee.png', maxStacks: 8 },
  { id: 'spellDmg', name: 'Deep Focus', desc: 'Spells strike 20% harder.', icon: '/assets/icons/arcane.png', maxStacks: 8 },
  { id: 'atkSpeed', name: 'Swift Blades', desc: 'Attack 12% faster.', icon: '/assets/icons/whirlwind.png', maxStacks: 6 },
  { id: 'crit', name: 'Keen Edge', desc: '+8% chance to strike a critical blow.', icon: '/assets/icons/shards.png', maxStacks: 6 },
  { id: 'moveSpeed', name: 'Fleetfoot', desc: 'Move 10% faster.', icon: '/assets/icons/dodge.png', maxStacks: 5 },
  { id: 'dodgeCd', name: 'Phantom Step', desc: 'Dodge recovers 25% sooner.', icon: '/assets/icons/dodge.png', maxStacks: 4 },
  { id: 'maxMana', name: 'Wellspring', desc: '+20 maximum mana.', icon: '/assets/icons/mana_potion.png', maxStacks: 8 },
  { id: 'fireSplash', name: 'Cinder Blast', desc: 'Fireballs burst wider and burn harder.', icon: '/assets/icons/fireball.png', maxStacks: 4 },
  { id: 'extraBolt', name: 'Splitting Bolt', desc: 'Arcane Bolt looses one additional missile.', icon: '/assets/icons/arcane.png', maxStacks: 3 },
  { id: 'frostRadius', name: 'Frozen Reach', desc: 'Frost Nova spreads 25% wider.', icon: '/assets/icons/frost.png', maxStacks: 4 },
  { id: 'healing', name: 'Mending Rite', desc: 'Potions and shrines heal 30% more.', icon: '/assets/icons/health_potion.png', maxStacks: 4 },
  { id: 'lifesteal', name: 'Sanguine Sigil', desc: 'Melee strikes return 6% of damage as health.', icon: '/assets/icons/gem_red.png', maxStacks: 3 },
  { id: 'armor', name: 'Gravewarden', desc: 'Reduce all damage taken by 2.', icon: '/assets/icons/relic_shield.png', maxStacks: 4 },
];

export function upgradeToChoice(def: UpgradeDef, stacks: number): UpgradeChoice {
  return { id: def.id, name: def.name, desc: def.desc, icon: def.icon, stacks, maxStacks: def.maxStacks };
}

/* ------------------------------ relics ------------------------------ */

export interface RelicDef extends RelicInfo {
  /** gameplay effect keys consumed by the run */
  effect: {
    goldMult?: number;
    bossDmgMult?: number;
    hpMult?: number;
    critAdd?: number;
    dodgeCharge?: number;
    xpMult?: number;
    manaRegenAdd?: number;
    armorAdd?: number;
  };
}

export const RELICS: RelicDef[] = [
  { id: 'grave_bell', name: 'Grave Bell', desc: 'The dead carry more coin. +25% gold.', icon: '/assets/icons/gold.png', effect: { goldMult: 1.25 } },
  { id: 'seal_fragment', name: 'Seal Fragment', desc: 'Cold to the touch. +15% damage against bosses.', icon: '/assets/icons/shards.png', effect: { bossDmgMult: 1.15 } },
  { id: 'cold_iron', name: 'Cold Iron Charm', desc: 'Old ward against old things. +15% health.', icon: '/assets/icons/relic_shield.png', effect: { hpMult: 1.15 } },
  { id: 'echo_lens', name: 'Echo Lens', desc: 'You see the flaw in every guard. +10% critical chance.', icon: '/assets/icons/gem_green.png', effect: { critAdd: 0.1 } },
  { id: 'rift_key', name: 'Rift Key', desc: 'A shortcut through the dark. Dodge recovers 20% faster.', icon: '/assets/icons/key.png', effect: { dodgeCharge: 0.2 } },
  { id: 'silent_tome', name: 'Silent Tome', desc: 'Its pages turn themselves. +20% experience.', icon: '/assets/icons/tome.png', effect: { xpMult: 1.2 } },
  { id: 'void_sip', name: 'Chalice of the Deep', desc: 'It never runs dry. +1.5 mana per second.', icon: '/assets/icons/chalice.png', effect: { manaRegenAdd: 1.5 } },
  { id: 'bone_ring', name: 'Bone Ring', desc: 'Grave dirt under the band. Damage taken reduced by 1.', icon: '/assets/icons/ring.png', effect: { armorAdd: 1 } },
];

/* ------------------------------ boons ------------------------------ */

/** Patron boons: themed run modifiers offered at boon shrines.
    Effects are consumed by RunState.computeStats and player hooks. */
export type PatronName = 'The Ember Choir' | 'The Silent Frost' | 'The Void Below';

export interface BoonDef extends BoonInfo {
  effect: {
    /* ember */
    fireBurnDps?: number; // burn damage per second applied by fireballs
    fireExtraProj?: number; // additional fireball per cast
    critBlastPct?: number; // crits detonate an ember burst for this fraction of damage
    lowHpDamageCut?: number; // fraction of damage removed while below 35% health
    /* frost */
    frostFreezeMs?: number; // frost nova stun duration
    frostRadiusMult?: number; // frost nova radius multiplier
    frostManaRefund?: number; // mana refunded per enemy hit by frost nova
    dodgeChillMs?: number; // enemies you dodge past are chilled
    postHitArmor?: number; // temporary armor after taking a hit
    postHitArmorMs?: number;
    /* void */
    killHeal?: number; // health restored on kill
    chainLightningPct?: number; // crits arc to a nearby enemy
    boltPierce?: number; // arcane bolt pierce count
    boltDmgMult?: number; // arcane bolt damage multiplier
    dodgeCdMult?: number; // dodge cooldown multiplier
    soulMult?: number; // souls dropped multiplier
  };
}

export const PATRONS: Record<import('./types').PatronId, { name: PatronName; color: string; icon: string }> = {
  ember: { name: 'The Ember Choir', color: '#d95252', icon: '/assets/icons/fireball.png' },
  frost: { name: 'The Silent Frost', color: '#65d9d0', icon: '/assets/icons/frost.png' },
  void: { name: 'The Void Below', color: '#9868e8', icon: '/assets/icons/arcane.png' },
};

export const BOONS: BoonDef[] = [
  /* -------- ember -------- */
  { id: 'ember_burn', patron: 'ember', rarity: 'common', name: 'Kindled Wrath', desc: 'Fireballs ignite foes, searing them for 8 damage per second.', icon: '/assets/icons/fireball.png', effect: { fireBurnDps: 8 } },
  { id: 'ember_fan', patron: 'ember', rarity: 'rare', name: 'Twin Cinders', desc: 'Each Fireball cast looses one extra searing missile.', icon: '/assets/icons/fireball.png', effect: { fireExtraProj: 1 } },
  { id: 'ember_blast', patron: 'ember', rarity: 'epic', name: 'Choir Detonation', desc: 'Critical strikes burst into flame, dealing 40% damage to nearby foes.', icon: '/assets/icons/gem_red.png', effect: { critBlastPct: 0.4 } },
  { id: 'ember_skin', patron: 'ember', rarity: 'common', name: 'Ashen Hide', desc: 'While below 35% health, take 15% less damage.', icon: '/assets/icons/relic_shield.png', effect: { lowHpDamageCut: 0.15 } },
  /* -------- frost -------- */
  { id: 'frost_pin', patron: 'frost', rarity: 'common', name: 'Winter Grip', desc: 'Frost Nova briefly freezes foes solid.', icon: '/assets/icons/frost.png', effect: { frostFreezeMs: 800 } },
  { id: 'frost_core', patron: 'frost', rarity: 'rare', name: 'Deep Stillness', desc: 'Frost Nova spreads 40% wider and refunds 8 mana per foe struck.', icon: '/assets/icons/frost.png', effect: { frostRadiusMult: 1.4, frostManaRefund: 8 } },
  { id: 'frost_ward', patron: 'frost', rarity: 'rare', name: 'Rime Veil', desc: 'Foes you dodge past are chilled to the bone.', icon: '/assets/icons/dodge.png', effect: { dodgeChillMs: 1600 } },
  { id: 'frost_armor', patron: 'frost', rarity: 'epic', name: 'Glacial Aegis', desc: 'After taking a hit, harden into ice: +4 armor for 3 seconds.', icon: '/assets/icons/relic_shield.png', effect: { postHitArmor: 4, postHitArmorMs: 3000 } },
  /* -------- void -------- */
  { id: 'void_leech', patron: 'void', rarity: 'common', name: 'Devouring Dark', desc: 'Every foe slain returns 3 health.', icon: '/assets/icons/health_potion.png', effect: { killHeal: 3 } },
  { id: 'void_chain', patron: 'void', rarity: 'rare', name: 'Echoing Arc', desc: 'Critical strikes arc to a nearby foe for 55% damage.', icon: '/assets/icons/arcane.png', effect: { chainLightningPct: 0.55 } },
  { id: 'void_echo', patron: 'void', rarity: 'epic', name: 'Piercing Truth', desc: 'Arcane Bolts pierce through one extra foe and deal 20% more damage.', icon: '/assets/icons/shards.png', effect: { boltPierce: 1, boltDmgMult: 1.2 } },
  { id: 'void_step', patron: 'void', rarity: 'common', name: 'Between Places', desc: 'Dodge recovers 20% sooner.', icon: '/assets/icons/dodge.png', effect: { dodgeCdMult: 0.8 } },
];

/* ------------------------------ pacts ------------------------------ */

export interface PactDef extends PactInfo {
  effect: {
    enemyHpMult?: number;
    enemyDmgMult?: number;
    enemySpeedMult?: number;
    playerHpMult?: number;
    goldMult?: number;
    healMult?: number;
    eliteChanceAdd?: number;
    bossExtraPhase?: boolean;
  };
}

export const PACTS: PactDef[] = [
  { id: 'hardened', name: 'Hardened Foes', desc: 'Enemies endure +35% more punishment.', rewardMult: 0.15, icon: '/assets/icons/relic_shield.png', effect: { enemyHpMult: 1.35 } },
  { id: 'relentless', name: 'Relentless Foes', desc: 'Enemies strike 25% harder.', rewardMult: 0.15, icon: '/assets/icons/skull.png', effect: { enemyDmgMult: 1.25 } },
  { id: 'swift', name: 'Quickened Horrors', desc: 'Enemies move 15% faster.', rewardMult: 0.1, icon: '/assets/icons/dodge.png', effect: { enemySpeedMult: 1.15 } },
  { id: 'frailty', name: 'Frail Descent', desc: 'You begin with 25% less health.', rewardMult: 0.2, icon: '/assets/icons/health_potion.png', effect: { playerHpMult: 0.75 } },
  { id: 'barren', name: 'Barren Halls', desc: 'Gold and healing are halved.', rewardMult: 0.2, icon: '/assets/icons/gold.png', effect: { goldMult: 0.5, healMult: 0.5 } },
  { id: 'fury', name: 'Boss Fury', desc: 'The Necromancer enters a terrifying third phase.', rewardMult: 0.25, icon: '/assets/icons/boss.png', effect: { bossExtraPhase: true } },
];

export const PACT_MAP: Record<PactId, PactDef> = Object.fromEntries(PACTS.map((p) => [p.id, p])) as Record<PactId, PactDef>;

/** Total soul-shard reward multiplier for the chosen pacts. */
export function pactRewardMult(pacts: PactId[]): number {
  return pacts.reduce((acc, id) => acc + (PACT_MAP[id]?.rewardMult ?? 0), 1);
}

/* ------------------------------ elites ------------------------------ */

export interface EliteDef {
  id: string;
  suffix: string;
  tint: number;
  hpMult: number;
  dmgMult: number;
  speedMult: number;
}

export const ELITES: EliteDef[] = [
  { id: 'quick', suffix: 'the Swift', tint: 0x9fe8d5, hpMult: 1.6, dmgMult: 1.1, speedMult: 1.45 },
  { id: 'armored', suffix: 'the Bulwark', tint: 0xc8b98a, hpMult: 2.3, dmgMult: 1.15, speedMult: 0.85 },
  { id: 'vampiric', suffix: 'the Thirsting', tint: 0xd98a9a, hpMult: 1.7, dmgMult: 1.2, speedMult: 1.05 },
];

/* ------------------------------ champions ------------------------------ */

export interface ChampionDef {
  id: string;
  name: string;
  title: string;
  sprite: 'orc' | 'bloodmon' | 'demon';
  scale: number;
  maxHp: number;
  damage: number;
  speed: number;
  radius: number;
  attacks: ('slam' | 'charge' | 'warcry' | 'fan' | 'blink' | 'curse')[];
  windup: number;
  cooldown: number;
  xp: number;
  gold: [number, number];
  souls: number;
}

/** Champions guard the encounter rooms of the two upper floors. */
export const CHAMPIONS: Record<number, ChampionDef> = {
  1: {
    id: 'grul', name: 'Grul, Warchief of the Deep', title: 'First Trial of the Descent',
    sprite: 'orc', scale: 1.55, maxHp: 230, damage: 16, speed: 60, radius: 24,
    attacks: ['slam', 'charge', 'warcry'], windup: 640, cooldown: 1700,
    xp: 55, gold: [26, 40], souls: 4,
  },
  2: {
    id: 'herald', name: 'The Rift Herald', title: 'Keeper of the Sunken Halls',
    sprite: 'demon', scale: 1.45, maxHp: 330, damage: 13, speed: 66, radius: 24,
    attacks: ['fan', 'blink', 'curse'], windup: 560, cooldown: 1500,
    xp: 75, gold: [34, 52], souls: 6,
  },
};

/* ------------------------------ enemies ------------------------------ */

export type EnemyKind = 'orc' | 'bloodmon' | 'demon' | 'orcElite';

export interface EnemyDef {
  kind: EnemyKind;
  sprite: 'orc' | 'bloodmon' | 'demon';
  name: string;
  intro: string;
  maxHp: number;
  damage: number;
  speed: number;
  size: number; // body diameter
  scale: number;
  xp: number;
  gold: [number, number];
  behavior: 'melee' | 'lunge' | 'ranged' | 'heavy';
  attackRange: number;
  attackWindup: number; // ms telegraph
  attackCooldown: number;
  knockbackResist: number; // 0..1
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  orc: {
    kind: 'orc', sprite: 'orc', name: 'Gravewalker', intro: 'A grave-robber that never left.',
    maxHp: 34, damage: 9, speed: 72, size: 24, scale: 1, xp: 10, gold: [2, 6],
    behavior: 'melee', attackRange: 46, attackWindup: 520, attackCooldown: 1500, knockbackResist: 0.1,
  },
  bloodmon: {
    kind: 'bloodmon', sprite: 'bloodmon', name: 'Bloodspawn', intro: 'It remembers being a man.',
    maxHp: 24, damage: 11, speed: 42, size: 24, scale: 1, xp: 9, gold: [2, 5],
    behavior: 'lunge', attackRange: 190, attackWindup: 640, attackCooldown: 2100, knockbackResist: 0,
  },
  demon: {
    kind: 'demon', sprite: 'demon', name: 'Rift Adept', intro: 'It whispers to the seal.',
    maxHp: 28, damage: 8, speed: 62, size: 24, scale: 1, xp: 13, gold: [3, 8],
    behavior: 'ranged', attackRange: 260, attackWindup: 700, attackCooldown: 1900, knockbackResist: 0.1,
  },
  orcElite: {
    kind: 'orcElite', sprite: 'orc', name: 'Orc Warchief', intro: 'Armor of the old garrison.',
    maxHp: 78, damage: 16, speed: 52, size: 30, scale: 1.3, xp: 30, gold: [8, 16],
    behavior: 'heavy', attackRange: 66, attackWindup: 780, attackCooldown: 2300, knockbackResist: 0.55,
  },
};

/* ------------------------------ boss ------------------------------ */

export const BOSS = {
  name: 'The Fallen Necromancer',
  title: 'Keeper of the Broken Seal',
  sprite: 'demon',
  scale: 1.7,
  maxHp: 560,
  phase2At: 0.5,
  phase3At: 0.22, // entered under the Boss Fury pact
  contactDamage: 14,
  boltDamage: 10,
  boltSpeed: 170,
  spikeDamage: 16,
  summonKind: 'bloodmon' as EnemyKind,
  summonCount: [2, 3],
  xp: 120,
  gold: [60, 90],
  souls: 20,
};

/* ------------------------------ floors ------------------------------ */

export interface FloorTheme {
  name: string;
  roomCount: [number, number];
  enemyBudget: number;
  enemyPool: { kind: EnemyKind; weight: number }[];
  eliteChance: number;
  tint: number; // applied to tile layers
  ambient: 'embers' | 'motes' | 'fog';
}

export const FLOORS: FloorTheme[] = [
  {
    name: 'The Broken Courtyard',
    roomCount: [6, 8],
    enemyBudget: 10,
    enemyPool: [
      { kind: 'orc', weight: 5 },
      { kind: 'bloodmon', weight: 3 },
    ],
    eliteChance: 0.08,
    tint: 0xd9d3c2,
    ambient: 'motes',
  },
  {
    name: 'The Sunken Halls',
    roomCount: [7, 9],
    enemyBudget: 14,
    enemyPool: [
      { kind: 'orc', weight: 4 },
      { kind: 'bloodmon', weight: 3 },
      { kind: 'demon', weight: 3 },
      { kind: 'orcElite', weight: 1 },
    ],
    eliteChance: 0.14,
    tint: 0xbdb6cf,
    ambient: 'fog',
  },
  {
    name: 'The Seal of Echoes',
    roomCount: [6, 8],
    enemyBudget: 18,
    enemyPool: [
      { kind: 'orc', weight: 3 },
      { kind: 'bloodmon', weight: 3 },
      { kind: 'demon', weight: 4 },
      { kind: 'orcElite', weight: 2 },
    ],
    eliteChance: 0.2,
    tint: 0xa89cc4,
    ambient: 'embers',
  },
];

export const MAX_FLOOR = 3;

/* ------------------------------ room names ------------------------------ */

export const ROOM_NAMES = {
  start: ['The First Breach'],
  combat: ['Collapsed Gallery', 'Wormeaten Hall', 'The Dry Cistern', 'Broken Colonnade', 'Ossuary Walk', 'The Rubble Yard'],
  treasure: ['Forgotten Reliquary', 'The Locked Vault', 'Chapel of Offerings'],
  encounter: ['Whispering Alcove', 'The Watcher\u2019s Rest', 'Hollowed Shrine'],
  boss: ['Chamber of the Seal'],
  exit: ['The Descent'],
};

/* ------------------------------ xp curve ------------------------------ */

export function xpForLevel(level: number): number {
  return Math.round(18 + level * 14 + level * level * 1.6);
}

/* ------------------------------ controls ------------------------------ */

export const CONTROLS: { keys: string; action: string }[] = [
  { keys: 'W A S D', action: 'Move' },
  { keys: 'Mouse', action: 'Aim' },
  { keys: 'Left Click', action: 'Melee attack' },
  { keys: 'Right Click', action: 'Fireball' },
  { keys: 'Space', action: 'Dodge roll' },
  { keys: '1', action: 'Frost Nova' },
  { keys: '2', action: 'Arcane Bolt' },
  { keys: '3', action: 'Whirlwind' },
  { keys: 'Q', action: 'Drink health potion' },
  { keys: 'F', action: 'Drink mana potion' },
  { keys: 'E', action: 'Interact' },
  { keys: 'Tab', action: 'Hold to enlarge minimap' },
  { keys: 'I', action: 'Inventory' },
  { keys: 'Esc', action: 'Pause' },
];
