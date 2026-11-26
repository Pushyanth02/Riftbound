/* Projectiles, pickups and interactable objects (chests, shrines, portals,
   merchant, boon shrines, rift barriers). */
import * as Phaser from 'phaser';
import { TILE } from '../config';
import { projectileStepCount } from '../combat';
import type { GameContext, ProjectileSpawn } from '../ctx';
import { Entity, dist2, gridLineOfSight } from './base';
import { RELICS, type RelicDef } from '../config';

/* ------------------------------------------------------------------ */
/* Projectiles                                                          */
/* ------------------------------------------------------------------ */

interface ProjectileConfig {
  kind: ProjectileSpawn['kind'];
  animKey: string;
  radius: number;
  rotates: boolean;
}

const PROJECTILE_CONFIG: Record<ProjectileSpawn['kind'], ProjectileConfig> = {
  fireball: { kind: 'fireball', animKey: 'fx_fireball_flight', radius: 12, rotates: true },
  bolt: { kind: 'bolt', animKey: 'fx_magic_missile_flight', radius: 9, rotates: true },
  shadowBolt: { kind: 'shadowBolt', animKey: 'fx_shadow_bolt_flight', radius: 10, rotates: false },
  bossBolt: { kind: 'bossBolt', animKey: 'fx_shadow_bolt_flight', radius: 11, rotates: false },
};

export class Projectile extends Entity {
  private ctx: GameContext;
  vx = 0;
  vy = 0;
  damage = 0;
  owner: 'player' | 'enemy';
  kind: ProjectileSpawn['kind'];
  radius: number;
  splashRadius?: number;
  splashDamage?: number;
  burn?: { dps: number; ms: number };
  pierce = 0;
  life = 2600;
  /** position at the start of the current frame (F3 sweep overlay) */
  sweptFromX = 0;
  sweptFromY = 0;
  private hitSet = new Set<import('./enemy').Enemy>();

  constructor(ctx: GameContext, spawn: ProjectileSpawn) {
    const cfg = PROJECTILE_CONFIG[spawn.kind];
    const texKey = cfg.animKey.replace('_flight', '');
    super(ctx.add.sprite(spawn.x, spawn.y, texKey, 0));
    this.ctx = ctx;
    this.kind = spawn.kind;
    this.owner = spawn.owner;
    this.damage = spawn.damage;
    this.radius = spawn.radius ?? cfg.radius;
    this.splashRadius = spawn.splashRadius;
    this.splashDamage = spawn.splashDamage;
    this.burn = spawn.burn;
    this.pierce = spawn.pierce ?? 0;
    this.vx = Math.cos(spawn.angle) * spawn.speed;
    this.vy = Math.sin(spawn.angle) * spawn.speed;
    if (cfg.rotates) this.sprite.setRotation(spawn.angle);
    /* shadow bolts wobble rather than rotate */
    if (spawn.kind === 'shadowBolt' || spawn.kind === 'bossBolt') {
      this.sprite.setRotation(spawn.angle);
    }
    this.sprite.setDepth(spawn.y + 500);
    this.sprite.play(cfg.animKey);
    this.setPos(spawn.x, spawn.y);
    this.sweptFromX = spawn.x;
    this.sweptFromY = spawn.y;
  }

  update(dt: number): void {
    this.sweptFromX = this.x;
    this.sweptFromY = this.y;
    const travel = Math.hypot(this.vx, this.vy) * dt / 1000;
    const steps = projectileStepCount(travel, TILE);
    for (let i = 0; i < steps && !this.dead; i++) this.advance(dt / steps);
  }

  private advance(dt: number): void {
    const step = dt / 1000;
    const nx = this.x + this.vx * step;
    const ny = this.y + this.vy * step;
    this.life -= dt;

    /* wall collision */
    if (!gridLineOfSight(this.ctx, this.x, this.y, nx, ny)) {
      this.explode();
      return;
    }
    this.setPos(nx, ny);
    if (this.life <= 0) {
      this.explode(false);
      return;
    }

    if (this.owner === 'player') {
      for (const e of this.ctx.enemies) {
        if (e.dead || !e.activated || this.hitSet.has(e)) continue;
        const r = this.radius + e.radius;
        if (dist2(this.x, this.y, e.x, e.y) <= r * r && gridLineOfSight(this.ctx, this.x, this.y, e.x, e.y)) {
          this.hitEnemy(e);
          if (this.dead) return;
        }
      }
    } else {
      const p = this.ctx.player;
      const r = this.radius + p.radius;
      if (dist2(this.x, this.y, p.x, p.y) <= r * r && !p.invulnerable && p.lineOfSightFrom(this.x, this.y)) {
        p.takeDamage(this.damage, this.x, this.y);
        this.explode();
      }
    }
  }

  private hitEnemy(e: import('./enemy').Enemy): void {
    const stats = this.ctx.run.stats;
    const crit = Math.random() < stats.critChance;
    let damage = this.damage * (crit ? stats.critMult : 1);
    if (e.isBoss || e.isChampion) damage *= stats.bossDmgMult;
    this.hitSet.add(e);
    e.takeDamage(damage, { sourceX: this.x, sourceY: this.y, knockback: 60, crit });
    if (crit) {
      /* crit follow-up boons (blast + chain) */
      if (stats.critBlastPct > 0) this.ctx.critBlast(this.x, this.y, damage * stats.critBlastPct);
      if (stats.chainLightningPct > 0) this.ctx.chainLightning(e.x, e.y, damage * stats.chainLightningPct, e);
    }
    /* Kindled Wrath: ignite */
    if (this.burn) e.applyBurn(this.burn.dps, this.burn.ms);
    /* Piercing Truth: keep flying */
    if (this.pierce > 0) {
      this.pierce--;
      return;
    }
    this.explode();
  }

  private explode(playImpact = true): void {
    if (playImpact) {
      if (this.kind === 'fireball') {
        this.ctx.fx.spawn('fireball_impact', this.x, this.y, { scale: 1 });
        if (this.splashRadius && this.splashDamage) {
          this.ctx.fx.spawn('fire_nova', this.x, this.y, { scale: this.splashRadius / 55, depth: this.y });
          this.ctx.play('fireImpact');
          for (const e of this.ctx.enemies) {
            if (e.dead || !e.activated || this.hitSet.has(e)) continue;
            const r = this.splashRadius + e.radius;
            if (dist2(this.x, this.y, e.x, e.y) <= r * r && gridLineOfSight(this.ctx, this.x, this.y, e.x, e.y)) {
              const splash = this.splashDamage * (e.isBoss || e.isChampion ? this.ctx.run.stats.bossDmgMult : 1);
              e.takeDamage(splash, { sourceX: this.x, sourceY: this.y, knockback: 90, crit: false });
              if (this.burn) e.applyBurn(this.burn.dps, this.burn.ms);
            }
          }
        }
      } else if (this.kind === 'bolt') {
        this.ctx.fx.spawn('arcane_burst', this.x, this.y, { scale: 0.55 });
      } else {
        this.ctx.fx.spawn('arcane_burst', this.x, this.y, { scale: 0.5 });
      }
    }
    this.state = 'dead';
    this.dead = true;
    this.sprite.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* Pickups                                                              */
/* ------------------------------------------------------------------ */

export type PickupKind = 'coin' | 'heart' | 'mana' | 'gem' | 'potion-h' | 'potion-m' | 'soul';

export class Pickup extends Entity {
  private ctx: GameContext;
  kind: PickupKind;
  value: number;
  private bobT: number;
  private vx = 0;
  private vy = 0;
  collected = false;

  constructor(ctx: GameContext, kind: PickupKind, x: number, y: number, value: number) {
    let anim: Phaser.GameObjects.Sprite | null = null;
    let plain: Phaser.GameObjects.Image | null = null;
    switch (kind) {
      case 'coin':
        anim = ctx.add.sprite(x, y, 'fx_coin_pickup', 0);
        anim.play('fx_coin_pickup');
        break;
      case 'heart':
        anim = ctx.add.sprite(x, y, 'fx_heart_pickup', 0);
        anim.play('fx_heart_pickup');
        break;
      case 'mana':
        anim = ctx.add.sprite(x, y, 'fx_mana_pickup', 0);
        anim.play('fx_mana_pickup');
        break;
      case 'gem':
        anim = ctx.add.sprite(x, y, 'fx_gem_pickup', 0);
        anim.play('fx_gem_pickup');
        break;
      case 'soul':
        anim = ctx.add.sprite(x, y, 'fx_soul_drain', 0);
        anim.play('fx_soul_drain');
        anim.setTint(0xb49ae8);
        break;
      case 'potion-h':
      case 'potion-m':
      default:
        plain = ctx.add.image(x, y, kind === 'potion-h' ? 'icon_health_potion' : 'icon_mana_potion');
        break;
    }
    super((anim ?? plain) as Phaser.GameObjects.Sprite);
    this.ctx = ctx;
    this.kind = kind;
    this.value = value;
    this.bobT = Math.random() * Math.PI * 2;
    /* scatter */
    const ang = Math.random() * Math.PI * 2;
    const speed = kind === 'soul' ? 20 + Math.random() * 30 : 40 + Math.random() * 70;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.setPos(x, y);
    if (plain) {
      plain.setScale(1.5);
      plain.setDepth(y);
    }
  }

  update(dt: number): void {
    if (this.collected) return;
    const player = this.ctx.player;
    /* friction on the scatter velocity - exponential decay keeps the feel
       identical at any frame rate (0.9/frame at 60 fps) */
    const step = dt / 1000;
    const decay = Math.pow(0.0022, step);
    this.vx *= decay;
    this.vy *= decay;
    let nx = this.x + this.vx * step;
    let ny = this.y + this.vy * step;
    if (!this.ctx.walkableAtPx(nx, ny)) {
      nx = this.x;
      ny = this.y;
      this.vx = 0;
      this.vy = 0;
    }
    /* magnet */
    const d2p = dist2(nx, ny, player.x, player.y);
    const magnetR = this.kind === 'soul' ? 96 : 74;
    if (d2p < magnetR * magnetR && !player.dying && player.lineOfSightFrom(nx, ny)) {
      const d = Math.sqrt(d2p) || 1;
      const pull = Math.min(d, 340 * step);
      nx += ((player.x - nx) / d) * pull;
      ny += ((player.y - ny) / d) * pull;
    }
    this.setPos(nx, ny);
    this.bobT += dt / 260;
    this.sprite.setY(ny + Math.sin(this.bobT) * 2.5);

    /* collect on the post-magnet position */
    if (dist2(nx, ny, player.x, player.y) < 24 * 24 && !player.dying && player.lineOfSightFrom(nx, ny)) {
      this.collect();
    }
  }

  private collect(): void {
    this.collected = true;
    this.state = 'dead';
    const player = this.ctx.player;
    switch (this.kind) {
      case 'coin':
        this.ctx.run.gold += Math.max(1, Math.round(this.value * this.ctx.run.stats.goldMult));
        this.ctx.play('coin');
        break;
      case 'heart':
        player.heal(12);
        this.ctx.play('pickup');
        break;
      case 'mana':
        player.mana = Math.min(this.ctx.run.stats.maxMana, player.mana + 10);
        this.ctx.fx.damageNumber(player.x, player.y - 30, 10, false, true);
        this.ctx.play('pickup');
        break;
      case 'gem':
        this.ctx.run.gold += Math.max(1, Math.round(this.value * this.ctx.run.stats.goldMult));
        this.ctx.play('coin');
        this.ctx.fx.spawn('treasure_glint', this.x, this.y, { scale: 0.8, duration: 600 });
        break;
      case 'soul':
        this.ctx.run.souls += Math.max(1, Math.round(this.value * this.ctx.run.stats.soulMult));
        this.ctx.fx.spawn('treasure_glint', this.x, this.y, { scale: 0.9, duration: 600 });
        this.ctx.fx.spawn('soul_drain', player.x, player.y - 12, { scale: 0.7, depth: player.y - 1 });
        this.ctx.play('levelup');
        break;
      case 'potion-h':
        this.ctx.run.potions.health++;
        this.ctx.toast('Health potion added', '/assets/icons/health_potion.png');
        this.ctx.play('pickup');
        break;
      case 'potion-m':
      default:
        this.ctx.run.potions.mana++;
        this.ctx.toast('Mana potion added', '/assets/icons/mana_potion.png');
        this.ctx.play('pickup');
        break;
    }
    this.sprite.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* Interactables                                                        */
/* ------------------------------------------------------------------ */

export interface Interactable {
  x: number;
  y: number;
  prompt: string;
  active: boolean;
  interact(): void;
  update?(dt: number): void;
  destroy(): void;
  object: Phaser.GameObjects.GameObject;
}

export class Chest implements Interactable {
  x: number;
  y: number;
  prompt = 'Open chest';
  active = true;
  object: Phaser.GameObjects.Image;
  private ctx: GameContext;
  private opened = false;
  private glint: Phaser.GameObjects.Sprite;

  constructor(ctx: GameContext, x: number, y: number) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.object = ctx.add.image(x, y, 'icon_chest');
    this.object.setScale(1.8);
    this.object.setDepth(y);
    this.object.setOrigin(0.5, 0.72);
    this.glint = ctx.add.sprite(x, y - 12, 'fx_treasure_glint', 0);
    this.glint.play('fx_treasure_glint');
    this.glint.setDepth(y + 1);
    this.glint.setScale(0.8);
  }

  interact(): void {
    if (this.opened) return;
    this.opened = true;
    this.active = false;
    this.glint.destroy();
    this.ctx.fx.spawn('chest_open', this.x, this.y - 6, { scale: 1.2, depth: this.y + 2 });
    this.ctx.play('chest');
    const rng = new Phaser.Math.RandomDataGenerator([String(this.x ^ this.y)]);
    /* gold burst */
    const gold = rng.between(15, 40);
    const coins = Math.min(7, 3 + Math.floor(gold / 10));
    for (let i = 0; i < coins; i++) {
      this.ctx.spawnPickup('coin', this.x, this.y, Math.floor(gold / coins) + Number(i < gold % coins));
    }
    /* guaranteed relic if the player has none */
    if (this.ctx.run.relics.length === 0) {
      const pool = RELICS.filter((r) => !this.ctx.run.relics.some((own) => own.id === r.id));
      if (pool.length > 0) this.grant(pool[rng.between(0, pool.length - 1)]);
    } else {
      const roll = rng.frac();
      if (roll < 0.35) this.ctx.spawnPickup('potion-h', this.x, this.y, 1);
      else if (roll < 0.55) this.ctx.spawnPickup('potion-m', this.x, this.y, 1);
      else if (roll < 0.68) this.ctx.spawnPickup('soul', this.x, this.y, 1);
      else if (roll < 0.9) this.grant(RELICS[rng.between(0, RELICS.length - 1)]);
      else this.ctx.spawnPickup('gem', this.x, this.y, rng.between(8, 16));
    }
    this.object.setTint(0x9a8f7a);
    this.object.setAlpha(0.85);
  }

  private grant(def: RelicDef): void {
    this.ctx.grantRelic(def);
  }

  destroy(): void {
    this.glint.destroy();
    this.object.destroy();
  }
}

export class Shrine implements Interactable {
  x: number;
  y: number;
  prompt = 'Touch the shrine';
  active = true;
  object: Phaser.GameObjects.Sprite;
  private ctx: GameContext;
  private used = false;

  constructor(ctx: GameContext, x: number, y: number) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.object = ctx.add.sprite(x, y, 'prop_shrine', 0);
    this.object.play('prop_shrine_anim');
    this.object.setDepth(y);
    this.object.setOrigin(0.5, 0.78);
  }

  interact(): void {
    if (this.used) return;
    this.used = true;
    this.active = false;
    this.ctx.player.heal(this.ctx.run.stats.maxHp * 0.3 * (1 + 0.3 * this.ctx.run.stacks('healing')) * this.ctx.run.pactMult('healMult'));
    this.ctx.play('shrine');
    this.ctx.toast('The shrine answers', '/assets/icons/relic_shield.png');
    this.object.stop();
    this.object.setTint(0x777088);
  }

  destroy(): void {
    this.object.destroy();
  }
}

/** Patron altar: offers a choice of boons after combat rooms. */
export class BoonShrine implements Interactable {
  x: number;
  y: number;
  prompt = "Accept the patron's gift";
  active = true;
  object: Phaser.GameObjects.Sprite;
  private ctx: GameContext;
  private used = false;
  private motes: Phaser.GameObjects.Sprite | null = null;

  constructor(ctx: GameContext, x: number, y: number) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.object = ctx.add.sprite(x, y, 'prop_chalice', 0);
    this.object.play('prop_chalice_anim');
    this.object.setDepth(y);
    this.object.setOrigin(0.5, 0.75);
    this.object.setScale(1.35);
    this.object.setTint(0xb49ae8);
    this.motes = ctx.add.sprite(x, y - 26, 'fx_magic_motes', 0);
    this.motes.play('fx_magic_motes');
    this.motes.setDepth(y - 1);
    this.motes.setScale(0.9);
    this.motes.setAlpha(0.85);
    ctx.fx.spawn('arcane_burst', x, y - 10, { scale: 0.9, depth: y - 1 });
  }

  interact(): void {
    if (this.used) return;
    this.ctx.onBoonShrineOpened?.(this);
  }

  /** Called by the scene once the offering resolves. */
  consume(): void {
    this.used = true;
    this.active = false;
    this.object.stop();
    this.object.setTint(0x6f6580);
    this.object.setAlpha(0.75);
    this.motes?.destroy();
    this.motes = null;
  }

  destroy(): void {
    this.motes?.destroy();
    this.object.destroy();
  }
}

export class Portal implements Interactable {
  x: number;
  y: number;
  prompt = 'Descend';
  active = true;
  object: Phaser.GameObjects.Sprite;
  private ctx: GameContext;
  private circle: Phaser.GameObjects.Sprite;

  constructor(ctx: GameContext, x: number, y: number, prompt = 'Descend') {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.prompt = prompt;
    this.object = ctx.add.sprite(x, y, 'fx_portal_idle', 0);
    this.object.play('fx_portal_idle');
    this.object.setDepth(y + 1);
    this.object.setScale(1.6);
    this.circle = ctx.add.sprite(x, y + 4, 'fx_magic_circle', 0);
    this.circle.play('fx_magic_circle');
    this.circle.setDepth(y);
    this.circle.setScale(1.3);
    this.circle.setAlpha(0.75);
  }

  interact(): void {
    if (!this.active) return;
    this.active = false;
    this.ctx.onPortalEntered?.();
  }

  destroy(): void {
    this.object.destroy();
    this.circle.destroy();
  }
}

export class Merchant implements Interactable {
  x: number;
  y: number;
  prompt = 'Trade';
  active = true;
  object: Phaser.GameObjects.Sprite;
  private ctx: GameContext;

  constructor(ctx: GameContext, x: number, y: number) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.object = ctx.add.sprite(x, y, 'char_merchant_idle', 0);
    this.object.play('merchant_idle');
    this.object.setDepth(y);
    this.object.setOrigin(0.5, 0.7);
    /* lantern glow */
    ctx.fx.spawn('candle_flame', x + 22, y - 26, { scale: 0.5, depth: y - 1, duration: 100000 });
  }

  interact(): void {
    this.ctx.onMerchantOpened?.();
  }

  destroy(): void {
    this.object.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* Rift barriers (combat locks)                                         */
/* ------------------------------------------------------------------ */

export class Barrier {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private tiles: { x: number; y: number }[];
  active = false;

  constructor(scene: Phaser.Scene, tiles: { x: number; y: number }[]) {
    this.scene = scene;
    this.tiles = tiles;
    this.gfx = scene.add.graphics();
    this.gfx.setVisible(false);
  }

  lock(): void {
    if (this.active) return;
    this.active = true;
    this.gfx.setVisible(true);
    this.gfx.clear();
    this.gfx.setDepth(1e9);
    for (const t of this.tiles) {
      this.gfx.fillStyle(0x9868e8, 0.28);
      this.gfx.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
      this.gfx.lineStyle(2, 0xd9ad62, 0.55);
      this.gfx.strokeRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
    }
    this.scene.tweens.add({
      targets: this.gfx,
      alpha: { from: 0.5, to: 1 },
      duration: 420,
      yoyo: true,
      repeat: -1,
    });
  }

  unlock(): void {
    if (!this.active) return;
    this.active = false;
    this.scene.tweens.killTweensOf(this.gfx);
    /* dissolve flash */
    const lastTiles = this.tiles;
    for (const t of lastTiles) {
      const fx = this.scene.add.sprite((t.x + 0.5) * TILE, (t.y + 0.5) * TILE, 'fx_arcane_burst', 0);
      fx.setDepth(1e9);
      fx.setScale(0.6);
      fx.play('fx_arcane_burst');
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    }
    this.gfx.setVisible(false);
    this.gfx.clear();
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.gfx);
    this.gfx.destroy();
  }
}
