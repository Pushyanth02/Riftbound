/* Asset loading + animation factory driven by the generated manifests. */
import * as Phaser from 'phaser';

export interface FxMeta {
  file: string;
  frameW: number;
  frameH: number;
  columns: number;
  frames: number;
  durations: number[];
  pivot: [number, number];
  loop: boolean;
  flightFrames: number | null;
}

export interface CharMeta {
  frame: number;
  license?: string;
  anims: Record<string, { frames: number; file: string }>;
  idleFrame0AlphaBBox?: [number, number, number, number] | null;
}

/** Static descriptions of everything the BootScene must load. */
export const CHARACTER_KEYS = ['player', 'orc', 'demon', 'bloodmon', 'merchant'] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];

export const EFFECT_KEYS = [
  'melee_combo', 'greatsword', 'spin_slash',
  'fireball_flight', 'fireball_impact', 'fire_nova', 'fire_cast',
  'frost_nova',
  'magic_missile', 'arcane_cast', 'blink_dash', 'magic_circle', 'teleport_in', 'arcane_burst',
  'hit_spark', 'crit_hit', 'blood_splat', 'death_poof', 'slime_splat', 'shockwave',
  'shadow_bolt', 'void_rift', 'soul_drain', 'dark_mist', 'curse', 'shadow_spikes',
  'holy_heal', 'frozen_chill',
  'coin_pickup', 'gem_pickup', 'heart_pickup', 'mana_pickup', 'treasure_glint', 'chest_open', 'level_up',
  'embers', 'fog_bank', 'magic_motes', 'wall_torch', 'portal_idle', 'candle_flame',
  'big_explosion', 'implosion',
  'bd_fire_bloom', 'bd_fire_sigil', 'bd_vortex', 'bd_fire_spiral', 'bd_flame_dash',
] as const;
export type EffectKey = (typeof EFFECT_KEYS)[number];

/** Filled by BootScene after the manifest JSON files are parsed. */
export const fxMeta: Partial<Record<EffectKey, FxMeta>> = {};
export const charMeta: Partial<Record<CharacterKey, CharMeta>> = {};

export function textureKeyForEffect(key: EffectKey): string {
  return `fx_${key}`;
}

export function loadManifestAssets(scene: Phaser.Scene): void {
  scene.load.json('meta:effects', '/assets/manifests/effects.json');
  scene.load.json('meta:characters', '/assets/manifests/characters.json');
  scene.load.json('meta:icons', '/assets/manifests/icons.json');
}

/** Sanity-check the parsed manifests; returns an error message or null. */
export function validateManifests(scene: Phaser.Scene): string | null {
  const chars = scene.cache.json.get('meta:characters') as Record<CharacterKey, CharMeta> | undefined;
  if (!chars) return 'Character manifest missing or unreadable (/assets/manifests/characters.json).';
  if (!chars.player || !chars.player.anims?.idle) return 'The hero is missing from the character manifest.';
  const fx = scene.cache.json.get('meta:effects') as Record<EffectKey, FxMeta> | undefined;
  if (!fx) return 'Effects manifest missing or unreadable (/assets/manifests/effects.json).';
  for (const key of ['fireball_flight', 'coin_pickup', 'portal_idle'] as const) {
    if (!fx[key]) return `Effect "${key}" is missing from the effects manifest.`;
  }
  return null;
}

/** Load every game texture (called with manifest data available). */
export function loadTextures(scene: Phaser.Scene): void {
  const chars = scene.cache.json.get('meta:characters') as Record<CharacterKey, CharMeta>;
  for (const key of CHARACTER_KEYS) {
    const meta = chars[key];
    if (!meta) continue;
    charMeta[key] = meta;
    for (const [anim, info] of Object.entries(meta.anims)) {
      scene.load.spritesheet(`char_${key}_${anim}`, `/assets/${info.file}`, {
        frameWidth: meta.frame,
        frameHeight: meta.frame,
      });
    }
  }

  const fx = scene.cache.json.get('meta:effects') as Record<EffectKey, FxMeta>;
  for (const key of EFFECT_KEYS) {
    const meta = fx[key];
    if (!meta) continue;
    fxMeta[key] = meta;
    scene.load.spritesheet(textureKeyForEffect(key), `/assets/${meta.file}`, {
      frameWidth: meta.frameW,
      frameHeight: meta.frameH,
    });
  }

  scene.load.spritesheet('tiles_terrain', '/assets/tilesets/terrain.png', { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('tiles_walls', '/assets/tilesets/walls.png', { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('prop_altar', '/assets/props/altar.png', { frameWidth: 224, frameHeight: 288 });
  scene.load.spritesheet('prop_shrine', '/assets/props/shrine.png', { frameWidth: 160, frameHeight: 128 });
  scene.load.spritesheet('prop_chalice', '/assets/props/chalice.png', { frameWidth: 64, frameHeight: 64 });
  scene.load.image('prop_arch', '/assets/props/ruin_arch.png');

  /* world-space icons used by pickups / chests */
  const icons = scene.cache.json.get('meta:icons') as Record<string, { file: string }>;
  if (icons) {
    for (const [name, info] of Object.entries(icons)) {
      scene.load.image(`icon_${name}`, `/assets/${info.file}`);
    }
  } else {
    scene.load.image('icon_health_potion', '/assets/icons/health_potion.png');
    scene.load.image('icon_mana_potion', '/assets/icons/mana_potion.png');
    scene.load.image('icon_chest', '/assets/icons/chest.png');
  }
}

/** Build every Phaser animation once, using the exact per-frame durations. */
export function createAnimations(scene: Phaser.Scene): void {
  /* character animations */
  const charAnims: Record<CharacterKey, string[]> = {
    player: ['idle', 'walk', 'atk1', 'atk2', 'atk3', 'hurt', 'death'],
    orc: ['idle', 'walk', 'atk1', 'atk2', 'hurt', 'death'],
    demon: ['idle', 'walk', 'atk1', 'atk2', 'hurt', 'death'],
    bloodmon: ['idle', 'walk', 'atk1', 'atk2', 'hurt', 'death'],
    merchant: ['idle'],
  };
  for (const key of CHARACTER_KEYS) {
    for (const anim of charAnims[key]) {
      const meta = charMeta[key];
      const info = meta?.anims[anim];
      if (!info) continue;
      const animKey = `${key}_${anim}`;
      if (scene.anims.exists(animKey)) continue;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(`char_${key}_${anim}`, { frames: Array.from({ length: info.frames }, (_, i) => i) }),
        frameRate: anim === 'death' || anim === 'hurt' ? 8 : 10,
        repeat: anim === 'idle' || anim === 'walk' ? -1 : 0,
      });
    }
  }

  /* effect animations - exact durations from the PVFX manifests */
  for (const key of EFFECT_KEYS) {
    const meta = fxMeta[key];
    if (!meta) continue;
    const animKey = `fx_${key}`;
    if (scene.anims.exists(animKey)) continue;
    const frames = meta.durations.map((d, i) => ({
      key: textureKeyForEffect(key),
      frame: i,
      duration: Math.max(16, Math.round(d)),
    }));
    scene.anims.create({
      key: animKey,
      frames,
      repeat: meta.loop ? -1 : 0,
    });
    /* looping flight variants for projectile clips (flight-only subset) */
    if (meta.flightFrames && meta.flightFrames > 1 && meta.flightFrames < meta.frames) {
      const flightKey = `fx_${key}_flight`;
      if (!scene.anims.exists(flightKey)) {
        scene.anims.create({
          key: flightKey,
          frames: meta.durations.slice(0, meta.flightFrames).map((d, i) => ({
            key: textureKeyForEffect(key),
            frame: i,
            duration: Math.max(16, Math.round(d)),
          })),
          repeat: -1,
        });
      }
    }
  }

  /* props */
  if (!scene.anims.exists('prop_shrine_anim')) {
    scene.anims.create({
      key: 'prop_shrine_anim',
      frames: scene.anims.generateFrameNumbers('prop_shrine', { frames: [0, 1, 2, 3, 4, 5, 6, 7] }),
      frameRate: 6,
      repeat: -1,
    });
  }
  if (!scene.anims.exists('prop_chalice_anim')) {
    scene.anims.create({
      key: 'prop_chalice_anim',
      frames: scene.anims.generateFrameNumbers('prop_chalice', { frames: [0, 1, 2, 3, 4, 5, 6, 7] }),
      frameRate: 6,
      repeat: -1,
    });
  }
}
