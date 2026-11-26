/* Enemies: explicit state machines for four behaviors, elite variants with
   floating health bars, burn/stun statuses, separation steering, the two
   encounter-room Champions, and the final Boss. */
import * as Phaser from 'phaser';
import { BOSS, TILE, CHAMPIONS, ELITES, ENEMIES, type ChampionDef, type EliteDef, type EnemyDef, type EnemyKind } from '../config';
import type { GameContext } from '../ctx';
import { Entity, feetWalkable, dist2, gridLineOfSight, moveGrid } from './base';
import { scaledEnemyStats } from '../dungeon/generator';

export type EnemyState =
  | 'idle'
  | 'detect'
  | 'approach'
  | 'position'
  | 'telegraph'
  | 'attack'
  | 'recover'
  | 'hurt'
  | 'stunned'
  | 'dead';

const HALF_W = 11;
const HALF_H = 7;

/** States whose animation must not be overridden while playing out. */
const LOCKED_ANIM_STATES = new Set(['telegraph', 'attack', 'hurt', 'stunned']);

/** Reusable scratch objects for per-frame vector math (no allocation in
    the enemy update hot path). Consume immediately, never retain. */
const sepScratch = { x: 0, y: 0 };
const towardScratch = { x: 0, y: 0 };

export interface DamageOpts {
  sourceX: number;
  sourceY: number;
  knockback: number;
  crit: boolean;
}

/** Shared status + visual helpers for every hostile. */
abstract class Hostile extends Entity {
  protected ctx: GameContext;
  /** owning room (set by the scene at spawn time) */
  roomId = -1;
  hp: number;
  maxHp: number;
  damage: number;
  aiState: EnemyState = 'idle';
  stateUntil = 0;
  isBoss = false;
  isChampion = false;
  activated = false;
  protected slowUntil = 0;
  protected slowFactor = 1;
  protected stunUntil = 0;
  protected contactReadyAt = 0;
  protected facingLeft = false;
  protected telegraphTarget = { x: 0, y: 0 };
  protected stuckTimer = 0;
  protected sidestepUntil = 0;
  protected sidestepDir = 1;
  protected deathHandled = false;
  /* burn status (ember boons) */
  protected burnUntil = 0;
  protected burnDps = 0;
  protected burnTickAt = 0;
  /* floating health bar */
  protected bar: Phaser.GameObjects.Graphics | null = null;
  protected barHideAt = 0;

  constructor(ctx: GameContext, sprite: Phaser.GameObjects.Sprite, x: number, y: number, maxHp: number, damage: number) {
    super(sprite);
    this.ctx = ctx;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.damage = damage;
    this.setPos(x, y);
  }

  get alive(): boolean {
    return this.aiState !== 'dead';
  }

  activate(): void {
    if (this.activated || this.aiState === 'dead') return;
    this.activated = true;
    this.state = 'active';
    this.sprite.setAlpha(1);
    this.aiState = 'detect';
    this.stateUntil = this.ctx.now + 350;
    this.ctx.fx.spawn('arcane_cast', this.x, this.y - 10, { scale: 0.55, depth: this.y - 1 });
  }

  applySlow(factor: number, ms: number): void {
    if (this.slowUntil > this.ctx.now) {
      this.slowFactor = Math.min(this.slowFactor, factor);
      this.slowUntil = Math.max(this.slowUntil, this.ctx.now + ms);
    } else {
      this.slowFactor = factor;
      this.slowUntil = this.ctx.now + ms;
    }
    this.sprite.setTint(0x9fc8e8);
    this.ctx.fx.spawn('frozen_chill', this.x, this.y - 8, { scale: 0.7, depth: this.y - 1 });
  }

  applyStun(ms: number): void {
    if (this.aiState === 'dead' || this.aiState === 'idle') return;
    this.aiState = 'stunned';
    this.stateUntil = Math.max(this.stateUntil, this.ctx.now + ms);
    this.sprite.setTint(0x9fc8e8);
    this.ctx.fx.spawn('frozen_chill', this.x, this.y - 8, { scale: 0.9, depth: this.y - 1 });
  }

  protected blinkNearPlayer(distance: number): void {
    const room = this.ctx.dungeon.rooms[this.roomId];
    const angle = Math.random() * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const direction = angle + i * Math.PI / 4;
      const x = this.ctx.player.x + Math.cos(direction) * distance;
      const y = this.ctx.player.y + Math.sin(direction) * distance;
      if (x < room.x * TILE + HALF_W || x >= (room.x + room.w) * TILE - HALF_W ||
          y < room.y * TILE + HALF_H || y >= (room.y + room.h) * TILE - HALF_H) continue;
      if (feetWalkable(this.ctx, x, y, HALF_W, HALF_H)) {
        this.setPos(x, y);
        return;
      }
    }
  }

  quenchBurn(): number {
    const damage = this.burnDps * Math.max(0, this.burnUntil - this.ctx.now) / 1000;
    this.burnUntil = 0;
    this.burnDps = 0;
    return damage;
  }

  applyBurn(dps: number, ms: number): void {
    if (this.aiState === 'dead' || this.aiState === 'idle') return;
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnUntil = Math.max(this.burnUntil, this.ctx.now + ms);
  }

  takeDamage(amount: number, opts: DamageOpts): void {
    if (this.aiState === 'dead' || this.aiState === 'idle') return;
    this.hp -= amount;
    this.ctx.fx.damageNumber(this.x, this.y - 34 * this.sprite.scaleX, amount, opts.crit);
    const splat = this.defSprite === 'bloodmon' ? 'slime_splat' : 'blood_splat';
    this.ctx.fx.spawn(splat, this.x, this.y - 8, { scale: 0.55 });
    this.ctx.fx.impact(this.x, this.y - 8, opts.crit);
    this.showBar();
    if (this.hp <= 0) {
      this.die();
      return;
    }
    /* knockback + hurt interruption (resisted by heavy foes) */
    const resist = this.knockbackResist;
    const ang = Math.atan2(this.y - opts.sourceY, this.x - opts.sourceX);
    const kb = opts.knockback * (1 - resist);
    const moved = moveGrid(this.ctx, this.x, this.y, Math.cos(ang) * kb * 0.12, Math.sin(ang) * kb * 0.12, HALF_W, HALF_H);
    this.setPos(moved.x, moved.y);
    const interrupt = this.aiState === 'telegraph' || this.aiState === 'approach' || this.aiState === 'position';
    if (interrupt && Math.random() > resist) {
      this.aiState = 'hurt';
      this.stateUntil = this.ctx.now + 240;
      this.sprite.play(`${this.defSprite}_hurt`);
      this.sprite.chain(`${this.defSprite}_idle`);
    } else if (opts.crit) {
      this.aiState = 'stunned';
      this.stateUntil = this.ctx.now + 420;
    }
  }

  protected abstract get defSprite(): 'orc' | 'bloodmon' | 'demon';
  protected abstract get knockbackResist(): number;
  protected abstract die(): void;

  /* ---------------- floating health bar ---------------- */

  protected showBar(): void {
    this.barHideAt = this.ctx.now + 2600;
    if (!this.bar) {
      this.bar = this.ctx.add.graphics();
    }
  }

  protected updateBar(): void {
    if (!this.bar) return;
    if (this.aiState === 'dead' || this.hp >= this.maxHp || this.ctx.now > this.barHideAt) {
      this.bar.setVisible(false);
      return;
    }
    const w = this.isBoss || this.isChampion ? 0 : 30;
    if (w === 0) {
      this.bar.setVisible(false);
      return;
    }
    const x = this.x - w / 2;
    const y = this.y - 40 * this.sprite.scaleX;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.bar.setVisible(true);
    this.bar.clear();
    this.bar.setDepth(7000);
    this.bar.fillStyle(0x140e1d, 0.85);
    this.bar.fillRect(x - 1, y - 1, w + 2, 6);
    this.bar.fillStyle(0x5a2830, 1);
    this.bar.fillRect(x, y, w, 4);
    this.bar.fillStyle(pct > 0.5 ? 0xc2564f : pct > 0.25 ? 0xd98a3d : 0xd95252, 1);
    this.bar.fillRect(x, y, w * pct, 4);
    if (this.eliteTint !== 0) {
      this.bar.lineStyle(1, this.eliteTint, 0.9);
      this.bar.strokeRect(x - 1.5, y - 1.5, w + 3, 7);
    }
  }

  protected get eliteTint(): number {
    return 0;
  }

  destroy(): void {
    this.destroyBar();
    super.destroy();
  }

  protected destroyBar(): void {
    this.bar?.destroy();
    this.bar = null;
  }

  /* ---------------- shared update scaffolding ---------------- */

  protected tickStatuses(): boolean {
    const now = this.ctx.now;
    /* burn ticking */
    if (this.burnUntil > now && this.burnDps > 0) {
      if (this.burnTickAt <= now) {
        this.burnTickAt = now + 500;
        this.hp -= this.burnDps * 0.5;
        this.ctx.fx.damageNumber(this.x + Phaser.Math.Between(-8, 8), this.y - 26, this.burnDps * 0.5, false);
        if (!this.ctx.reducedFx) this.ctx.fx.spawn('embers', this.x, this.y - 14, { scale: 0.4, depth: this.y });
        this.showBar();
        if (this.hp <= 0) {
          this.die();
          return false;
        }
      }
    } else {
      this.burnDps = 0;
    }
    if (this.slowUntil > 0 && now > this.slowUntil) {
      this.slowUntil = 0;
      this.slowFactor = 1;
      if (this.aiState !== 'dead') this.sprite.clearTint();
    }
    return true;
  }

  protected setFacing(left: boolean): void {
    if (left !== this.facingLeft) {
      this.facingLeft = left;
      this.sprite.setFlipX(left);
    }
  }

  protected moveStep(vx: number, vy: number): void {
    const moved = moveGrid(this.ctx, this.x, this.y, vx, vy, HALF_W, HALF_H);
    const blocked = Math.abs(moved.x - this.x) < 0.01 && Math.abs(moved.y - this.y) < 0.01 && (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01);
    this.setPos(moved.x, moved.y);
    if (blocked) {
      if (this.stuckTimer === 0) this.stuckTimer = this.ctx.now;
      if (this.ctx.now - this.stuckTimer > 550) {
        this.stuckTimer = 0;
        this.sidestepUntil = this.ctx.now + 420;
        this.sidestepDir = Math.random() < 0.5 ? 1 : -1;
      }
    } else {
      this.stuckTimer = 0;
    }
  }

  protected sidestep(): number {
    if (this.ctx.now < this.sidestepUntil) return this.sidestepDir;
    return 0;
  }

  /** Soft push so hostiles do not stack into one blob.
      Returns a shared scratch object - consume immediately. */
  protected separation(dt: number): { x: number; y: number } {
    let px = 0;
    let py = 0;
    const self = this as unknown as Enemy;
    for (const other of this.ctx.enemies) {
      if (other === self || other.dead || !other.activated) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const d2 = dx * dx + dy * dy;
      const minD = (this.radius + other.radius) * 0.9;
      if (d2 > 0.01 && d2 < minD * minD) {
        const d = Math.sqrt(d2);
        px += (dx / d) * (1 - d / minD);
        py += (dy / d) * (1 - d / minD);
      }
    }
    sepScratch.x = px * 60 * (dt / 1000);
    sepScratch.y = py * 60 * (dt / 1000);
    return sepScratch;
  }

  protected tryContactDamage(dist: number): void {
    if (this.ctx.now < this.contactReadyAt) return;
    if (dist <= this.radius + this.ctx.player.radius + 2 && this.ctx.player.lineOfSightFrom(this.x, this.y)) {
      this.contactReadyAt = this.ctx.now + 850;
      this.ctx.player.takeDamage(Math.max(1, Math.round(this.damage * 0.45)), this.x, this.y);
    }
  }

  protected updateAnim(): void {
    if (LOCKED_ANIM_STATES.has(this.aiState)) return;
    const moving = this.aiState === 'approach' || this.aiState === 'position';
    const key = `${this.defSprite}_${moving ? 'walk' : 'idle'}`;
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key);
  }

  /** F3/QA: current windup warning area, or null when not telegraphing. */
  debugTelegraph(): TelegraphDebug | null {
    return null;
  }
}

/** Warning-area description for the F3 overlay: where the damage will land
    while an enemy is still in its windup. */
export interface TelegraphDebug {
  /** 'strike' = area around the enemy, 'lunge' = dash to the focus point,
     'aim' = projectile line to the focus point */
  kind: 'strike' | 'lunge' | 'aim';
  x: number;
  y: number;
  tx: number;
  ty: number;
  radius: number;
  startedAt: number;
  endsAt: number;
}

/* ------------------------------------------------------------------ */
/* Regular enemy                                                        */
/* ------------------------------------------------------------------ */

export class Enemy extends Hostile {
  def: EnemyDef;
  elite: EliteDef | null = null;

  constructor(ctx: GameContext, kind: EnemyKind, x: number, y: number, elite = false) {
    super(ctx, ctx.add.sprite(x, y, `char_${ENEMIES[kind].sprite}_idle`, 0), x, y, 1, 1);
    this.def = ENEMIES[kind];
    const scaled = scaledEnemyStats(kind, ctx.run.floor);
    let maxHp = scaled.maxHp;
    let damage = scaled.damage;
    if (elite && kind !== 'orcElite') {
      this.elite = ELITES[Phaser.Math.Between(0, ELITES.length - 1)];
      maxHp = Math.round(maxHp * this.elite.hpMult);
      damage = Math.round(damage * this.elite.dmgMult);
    }
    /* pact difficulty scaling */
    maxHp = Math.round(maxHp * ctx.run.pactMult('enemyHpMult'));
    damage = Math.round(damage * ctx.run.pactMult('enemyDmgMult'));
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.damage = damage;
    this.radius = this.def.size / 2;
    this.sprite.setScale(this.def.scale);
    this.sprite.setOrigin(0.5, 0.62);
    if (this.elite) this.sprite.setTint(this.elite.tint);
    this.attachShadow(this.def.size * 1.25, this.def.size * 0.4, 0.3);
    this.sprite.play(`${this.def.sprite}_idle`);
    this.sprite.setAlpha(0); /* revealed on activation */
  }

  get displayName(): string {
    return this.elite ? `${this.def.name} ${this.elite.suffix}` : this.def.name;
  }

  protected get defSprite(): 'orc' | 'bloodmon' | 'demon' {
    return this.def.sprite;
  }

  protected get knockbackResist(): number {
    return this.def.knockbackResist;
  }

  protected get eliteTint(): number {
    return this.elite?.tint ?? 0;
  }

  /** F3/QA: danger area while winding up, derived from the behavior. */
  debugTelegraph(): TelegraphDebug | null {
    if (this.aiState !== 'telegraph') return null;
    const startedAt = this.stateUntil - this.def.attackWindup;
    switch (this.def.behavior) {
      case 'melee':
      case 'heavy':
        return {
          kind: 'strike', x: this.x, y: this.y, tx: this.x, ty: this.y,
          radius: this.def.attackRange + (this.def.behavior === 'heavy' ? 26 : 14) + 16,
          startedAt, endsAt: this.stateUntil,
        };
      case 'lunge':
        return {
          kind: 'lunge', x: this.x, y: this.y,
          tx: this.telegraphTarget.x, ty: this.telegraphTarget.y,
          radius: 46, startedAt, endsAt: this.stateUntil,
        };
      case 'ranged':
        return {
          kind: 'aim', x: this.x, y: this.y,
          tx: this.telegraphTarget.x, ty: this.telegraphTarget.y,
          radius: 30, startedAt, endsAt: this.stateUntil,
        };
      default:
        return null;
    }
  }

  protected die(): void {
    this.aiState = 'dead';
    this.state = 'dead';
    this.dead = true;
    this.destroyBar();
    this.sprite.play(`${this.def.sprite}_death`);
    this.sprite.clearTint();
    this.ctx.fx.spawn(this.def.sprite === 'bloodmon' ? 'slime_splat' : 'death_poof', this.x, this.y - 6, { scale: 0.8 });
    this.ctx.play('enemyDeath');
    this.ctx.tweens.add({
      targets: this.sprite,
      alpha: 0,
      delay: 620,
      duration: 700,
      onComplete: () => {
        this.sprite.setVisible(false);
      },
    });
    this.ctx.onEnemyKilled(this);
  }

  update(dt: number): void {
    if (this.aiState === 'dead' || this.aiState === 'idle') return;
    this.updateBar();

    const player = this.ctx.player;
    const now = this.ctx.now;

    if (this.aiState === 'detect') {
      if (now > this.stateUntil) this.aiState = 'approach';
      return;
    }
    if (this.aiState === 'hurt' || this.aiState === 'stunned') {
      if (now > this.stateUntil) this.aiState = 'approach';
      return;
    }
    if (this.aiState === 'recover') {
      if (now > this.stateUntil) this.aiState = 'approach';
      return;
    }
    if (!this.tickStatuses()) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    towardScratch.x = dx / (dist || 1);
    towardScratch.y = dy / (dist || 1);
    const toward = towardScratch;
    if (dx !== 0) this.setFacing(dx < 0);

    const speed = this.currentSpeed();

    switch (this.aiState) {
      case 'approach':
        this.updateApproach(dist, toward, speed, dt);
        break;
      case 'position':
        this.updatePosition(dist, toward, speed, dt);
        break;
      case 'telegraph':
        if (now > this.stateUntil) this.performAttack(dist, toward);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      default:
        break;
    }

    this.tryContactDamage(dist);
    this.updateAnim();
  }

  protected currentSpeed(): number {
    const eliteMult = this.elite ? this.elite.speedMult : 1;
    return this.def.speed * this.ctx.run.pactMult('enemySpeedMult') * eliteMult * (this.slowUntil > this.ctx.now ? this.slowFactor : 1);
  }

  private updateApproach(dist: number, toward: { x: number; y: number }, speed: number, dt: number): void {
    const player = this.ctx.player;
    const sep = this.separation(dt);
    switch (this.def.behavior) {
      case 'melee':
      case 'heavy': {
        if (dist <= this.def.attackRange * (this.def.behavior === 'heavy' ? 1.15 : 1)) {
          this.beginTelegraph();
          return;
        }
        const side = this.sidestep();
        this.moveStep(
          (toward.x * 0.9 + -toward.y * 0.45 * side) * speed * (dt / 1000) + sep.x,
          toward.y * speed * (dt / 1000) + sep.y,
        );
        break;
      }
      case 'lunge': {
        if (dist <= this.def.attackRange && gridLineOfSight(this.ctx, this.x, this.y, player.x, player.y)) {
          this.beginTelegraph();
          return;
        }
        this.moveStep(toward.x * speed * (dt / 1000) + sep.x, toward.y * speed * (dt / 1000) + sep.y);
        break;
      }
      case 'ranged': {
        if (dist <= this.def.attackRange && gridLineOfSight(this.ctx, this.x, this.y, player.x, player.y)) {
          this.aiState = 'position';
          return;
        }
        this.moveStep(toward.x * speed * (dt / 1000) + sep.x, toward.y * speed * (dt / 1000) + sep.y);
        break;
      }
      default:
        break;
    }
  }

  private updatePosition(dist: number, toward: { x: number; y: number }, speed: number, dt: number): void {
    const player = this.ctx.player;
    const hasLos = gridLineOfSight(this.ctx, this.x, this.y, player.x, player.y);
    const idealMin = this.def.attackRange * 0.55;
    const idealMax = this.def.attackRange * 0.95;
    if (dist > idealMax || !hasLos) {
      this.aiState = 'approach';
      return;
    }
    if (dist < idealMin) {
      const sep = this.separation(dt);
      this.moveStep(-toward.x * speed * (dt / 1000) + sep.x, -toward.y * speed * (dt / 1000) + sep.y);
      return;
    }
    if (this.ctx.now > this.stateUntil) {
      this.stateUntil = this.ctx.now + 500;
      this.beginTelegraph();
    }
  }

  protected beginTelegraph(): void {
    this.aiState = 'telegraph';
    this.stateUntil = this.ctx.now + this.def.attackWindup;
    this.telegraphTarget = { x: this.ctx.player.x, y: this.ctx.player.y };
    this.sprite.play(`${this.def.sprite}_atk1`);
    /* white-to-red telegraph flash */
    const s = this.sprite;
    s.setTintFill(0xe8dcc9);
    this.ctx.tweens.addCounter({
      from: 0,
      to: 100,
      duration: this.def.attackWindup,
      onUpdate: (_tween, _target, _key, current) => {
        const v = current / 100;
        s.setTintFill(Phaser.Display.Color.GetColor(232 - v * 60, 220 - v * 130, 201 - v * 110));
      },
      onComplete: () => {
        if (this.aiState !== 'dead' && this.aiState !== 'idle') s.clearTint();
      },
    });
    if (this.elite) s.setTintFill(0xe8dcc9);
    if (this.def.behavior === 'heavy') {
      this.ctx.fx.spawnGround('bd_vortex', this.x, this.y, { scale: 0.9 });
    } else if (this.def.behavior === 'lunge') {
      this.ctx.fx.spawnGround('magic_circle', this.x, this.y, { scale: 0.6 });
    }
  }

  protected performAttack(dist: number, toward: { x: number; y: number }): void {
    const player = this.ctx.player;
    this.aiState = 'attack';
    this.stateUntil = this.ctx.now + (this.def.behavior === 'lunge' ? 340 : 260);
    this.sprite.play(`${this.def.sprite}_atk2`);
    this.sprite.chain(`${this.def.sprite}_idle`);
    if (this.elite) this.sprite.setTint(this.elite.tint);

    switch (this.def.behavior) {
      case 'melee':
      case 'heavy': {
        const reach = this.def.attackRange + (this.def.behavior === 'heavy' ? 26 : 14);
        if (dist <= reach + player.radius) {
          player.takeDamage(this.damage, this.x, this.y);
        }
        const fxScale = this.def.behavior === 'heavy' ? 1.5 : 1;
        this.ctx.fx.spawn(this.def.behavior === 'heavy' ? 'shockwave' : 'greatsword', this.x + toward.x * 26, this.y - 8 + toward.y * 26, {
          angle: Phaser.Math.RadToDeg(Math.atan2(toward.y, toward.x)),
          scale: fxScale,
          depth: this.y + 2,
        });
        if (this.def.behavior === 'heavy') this.ctx.fx.shake(0.006, 200);
        this.ctx.play('swing');
        break;
      }
      case 'lunge': {
        const ang = Math.atan2(this.telegraphTarget.y - this.y, this.telegraphTarget.x - this.x);
        (this as Enemy & { lungeVX?: number; lungeVY?: number }).lungeVX = Math.cos(ang) * 330;
        (this as Enemy & { lungeVX?: number; lungeVY?: number }).lungeVY = Math.sin(ang) * 330;
        this.ctx.fx.spawn('bd_flame_dash', this.x, this.y - 6, {
          angle: Phaser.Math.RadToDeg(ang),
          scale: 0.8,
          depth: this.y + 1,
        });
        break;
      }
      case 'ranged': {
        const ang = Math.atan2(player.y - 10 - this.y, player.x - this.x);
        this.ctx.spawnProjectile({
          x: this.x + Math.cos(ang) * 16,
          y: this.y - 10 + Math.sin(ang) * 16,
          angle: ang,
          speed: 185,
          damage: this.damage,
          kind: 'shadowBolt',
          owner: 'enemy',
          radius: 10,
        });
        this.ctx.fx.spawn('arcane_cast', this.x + Math.cos(ang) * 18, this.y - 10 + Math.sin(ang) * 18, { scale: 0.6 });
        this.ctx.play('summon');
        break;
      }
      default:
        break;
    }
  }

  protected updateAttack(_dt: number): void {
    const self = this as Enemy & { lungeVX?: number; lungeVY?: number };
    if (this.def.behavior === 'lunge') {
      const step = (330 * _dt) / 1000;
      const moved = moveGrid(this.ctx, this.x, this.y, ((self.lungeVX ?? 0) / 330) * step, ((self.lungeVY ?? 0) / 330) * step, HALF_W, HALF_H);
      this.setPos(moved.x, moved.y);
      if (this.ctx.player.withinContact(this.x, this.y, this.radius + 6)) {
        this.ctx.player.takeDamage(this.damage, this.x, this.y);
      }
    }
    if (this.ctx.now > this.stateUntil) {
      this.aiState = 'recover';
      this.stateUntil = this.ctx.now + this.def.attackCooldown * (0.8 + Math.random() * 0.4);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Champions: guard the encounter rooms of the upper floors             */
/* ------------------------------------------------------------------ */

type ChampionAction = 'slam' | 'charge' | 'warcry' | 'fan' | 'blink' | 'curse';

export class Champion extends Enemy {
  cdef: ChampionDef;
  phase = 1;
  private actionQueue: ChampionAction[] = [];
  private performing = false;
  private performUntil = 0;
  private chargeVX = 0;
  private chargeVY = 0;
  introDone = false;

  constructor(ctx: GameContext, cdef: ChampionDef, x: number, y: number) {
    super(ctx, cdef.sprite === 'orc' ? 'orc' : 'demon', x, y);
    this.cdef = cdef;
    this.isChampion = true;
    const hp = Math.round(cdef.maxHp * ctx.run.pactMult('enemyHpMult'));
    this.maxHp = hp;
    this.hp = hp;
    this.damage = Math.round(cdef.damage * ctx.run.pactMult('enemyDmgMult'));
    this.radius = cdef.radius;
    this.sprite.setScale(cdef.scale);
    this.shadow?.destroy();
    this.shadow = null;
    this.attachShadow(cdef.radius * 2.2, cdef.radius * 0.8, 0.38);
    this.sprite.play(`${cdef.sprite}_idle`);
    this.ctx.fx.spawn('dark_mist', x, y, { scale: 1.6, duration: 100000, depth: y - 2, alpha: 0.7 });
  }

  get displayName(): string {
    return this.cdef.name;
  }

  protected get knockbackResist(): number {
    return 0.7;
  }

  activate(): void {
    if (this.activated || this.aiState === 'dead') return;
    this.activated = true;
    this.state = 'active';
    this.sprite.setAlpha(1);
    this.aiState = 'approach';
    this.ctx.play('bossRoar');
    this.ctx.fx.shake(0.006, 400);
  }

  takeDamage(amount: number, opts: DamageOpts): void {
    if (this.aiState === 'dead') return;
    super.takeDamage(amount, opts);
    if (this.hp <= 0) return;
    if (this.phase === 1 && this.hp / this.maxHp <= 0.5) {
      this.phase = 2;
      this.enterPhaseTwo();
    }
  }

  private enterPhaseTwo(): void {
    this.ctx.play('phase');
    this.ctx.fx.hitstop(110);
    this.ctx.fx.shake(0.008, 420);
    this.ctx.fx.spawn('void_rift', this.x, this.y - 10, { scale: 1.2, duration: 1600 });
    this.actionQueue = [];
    this.performing = false;
    this.aiState = 'stunned';
    this.stateUntil = this.ctx.now + 700;
  }

  protected die(): void {
    this.aiState = 'dead';
    this.state = 'dead';
    this.dead = true;
    this.destroyBar();
    this.ctx.fx.hitstop(160);
    this.ctx.fx.shake(0.01, 500);
    this.ctx.fx.spawn('big_explosion', this.x, this.y - 10, { scale: 1.2 });
    this.ctx.play('enemyDeath');
    this.sprite.play(`${this.cdef.sprite}_death`);
    this.ctx.tweens.add({
      targets: this.sprite,
      alpha: 0,
      delay: 800,
      duration: 1100,
      onComplete: () => this.sprite.setVisible(false),
    });
    this.ctx.onEnemyKilled(this);
  }

  update(dt: number): void {
    if (this.aiState === 'dead' || !this.activated) return;
    this.updateBar();

    const player = this.ctx.player;
    const now = this.ctx.now;

    if (this.aiState === 'stunned') {
      if (now > this.stateUntil) this.aiState = 'approach';
      return;
    }
    if (!this.tickStatuses()) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.setFacing(dx < 0);

    if (this.performing) {
      if (this.aiState === 'attack' && this.cdef.attacks.includes('charge')) {
        /* charge momentum while performing */
        const step = (380 * dt) / 1000;
        const moved = moveGrid(this.ctx, this.x, this.y, (this.chargeVX / 380) * step, (this.chargeVY / 380) * step, HALF_W, HALF_H);
        const stuck = moved.x === this.x && moved.y === this.y;
        this.setPos(moved.x, moved.y);
        if (player.withinContact(this.x, this.y, this.radius + 8)) {
          player.takeDamage(this.damage, this.x, this.y);
          this.performUntil = Math.min(this.performUntil, now + 120);
        }
        if (stuck) this.performUntil = Math.min(this.performUntil, now + 120);
      }
      if (now > this.performUntil) {
        this.performing = false;
        this.aiState = 'recover';
        this.stateUntil = now + (this.phase === 2 ? 620 : 900);
      }
      return;
    }
    if (this.aiState === 'recover') {
      if (now > this.stateUntil) this.aiState = 'approach';
      return;
    }

    /* drift toward the player between attacks */
    const ideal = this.cdef.attacks.includes('charge') ? 140 : 190;
    const speed = this.cdef.speed * this.ctx.run.pactMult('enemySpeedMult') * (this.phase === 2 ? 1.2 : 1) * (this.slowUntil > now ? this.slowFactor : 1);
    if (dist > ideal + 30) {
      const sep = this.separation(dt);
      this.moveStep((dx / (dist || 1)) * speed * (dt / 1000) + sep.x, (dy / (dist || 1)) * speed * (dt / 1000) + sep.y);
    }
    this.updateAnim();
    if (now > this.stateUntil && this.actionQueue.length === 0) this.buildQueue();
    if (now > this.stateUntil && this.actionQueue.length > 0) {
      this.execute(this.actionQueue.shift()!);
    }
    this.tryContactDamage(dist);
  }

  private buildQueue(): void {
    const base = this.cdef.attacks.slice();
    if (this.phase === 2) base.push(base[0]);
    /* deterministic shuffle-ish rotation */
    this.actionQueue = base.slice().sort(() => Math.random() - 0.5);
    this.stateUntil = this.ctx.now + (this.phase === 2 ? 420 : 650);
  }

  private execute(action: ChampionAction): void {
    const player = this.ctx.player;
    this.performing = true;
    this.aiState = 'attack';
    this.stateUntil = this.ctx.now + 300;
    const windup = this.cdef.windup;
    switch (action) {
      case 'slam': {
        this.performUntil = this.ctx.now + windup + 500;
        this.sprite.play(`${this.cdef.sprite}_atk1`);
        this.sprite.chain(`${this.cdef.sprite}_idle`);
        this.ctx.fx.spawnGround('bd_vortex', this.x, this.y, { scale: 1.2 });
        this.ctx.time.delayedCall(windup, () => {
          if (this.aiState === 'dead') return;
          this.ctx.fx.spawn('shockwave', this.x, this.y - 8, { scale: 1.7, depth: this.y + 2 });
          this.ctx.fx.shake(0.008, 260);
          this.ctx.play('fireImpact');
          if (player.withinContact(this.x, this.y, 86)) {
            player.takeDamage(this.damage + 3, this.x, this.y);
          }
        });
        break;
      }
      case 'charge': {
        this.performUntil = this.ctx.now + windup + 620;
        this.sprite.play(`${this.cdef.sprite}_atk1`);
        const ang = Math.atan2(player.y - this.y, player.x - this.x);
        this.ctx.fx.spawnGround('magic_circle', this.x, this.y, { scale: 0.9 });
        this.ctx.time.delayedCall(windup, () => {
          if (this.aiState === 'dead') return;
          this.chargeVX = Math.cos(ang) * 380;
          this.chargeVY = Math.sin(ang) * 380;
          this.ctx.fx.spawn('bd_flame_dash', this.x, this.y - 6, { angle: Phaser.Math.RadToDeg(ang), scale: 1, depth: this.y + 1 });
          this.ctx.play('dodge');
        });
        break;
      }
      case 'warcry': {
        this.performUntil = this.ctx.now + 900;
        this.sprite.play(`${this.cdef.sprite}_atk2`);
        this.sprite.chain(`${this.cdef.sprite}_idle`);
        this.ctx.fx.shake(0.005, 300);
        this.ctx.play('bossRoar');
        this.ctx.fx.spawn('bd_fire_sigil', this.x, this.y, { scale: 1, depth: this.y - 1 });
        /* rally: summon two guards */
        for (let i = 0; i < 2; i++) {
          this.ctx.time.delayedCall(260 + i * 240, () => {
            if (this.aiState === 'dead') return;
            this.ctx.summonEcho?.(this.x + Phaser.Math.Between(-110, 110), this.y + Phaser.Math.Between(40, 120));
          });
        }
        break;
      }
      case 'fan': {
        this.performUntil = this.ctx.now + 800;
        this.sprite.play(`${this.cdef.sprite}_atk1`);
        this.sprite.chain(`${this.cdef.sprite}_idle`);
        const count = this.phase === 2 ? 6 : 4;
        const baseAng = Math.atan2(player.y - 10 - this.y, player.x - this.x);
        const spread = Phaser.Math.DegToRad(50);
        for (let i = 0; i < count; i++) {
          const ang = baseAng + spread * (i / (count - 1) - 0.5);
          this.ctx.time.delayedCall(i * 85, () => {
            if (this.aiState === 'dead') return;
            this.ctx.spawnProjectile({
              x: this.x + Math.cos(ang) * 22,
              y: this.y - 12 + Math.sin(ang) * 22,
              angle: ang,
              speed: 190,
              damage: this.damage,
              kind: 'bossBolt',
              owner: 'enemy',
              radius: 10,
            });
          });
        }
        this.ctx.play('summon');
        break;
      }
      case 'blink': {
        this.performUntil = this.ctx.now + 760;
        this.ctx.fx.spawn('dark_mist', this.x, this.y, { scale: 1.2, duration: 620 });
        this.sprite.setAlpha(0);
        this.ctx.play('dodge');
        this.ctx.time.delayedCall(300, () => {
          if (this.aiState === 'dead') return;
          this.blinkNearPlayer(Phaser.Math.Between(110, 170));
          this.sprite.setAlpha(1);
          this.ctx.fx.spawn('teleport_in', this.x, this.y - 8, { scale: 1.1 });
        });
        break;
      }
      case 'curse': {
        this.performUntil = this.ctx.now + 1300;
        this.sprite.play(`${this.cdef.sprite}_atk2`);
        this.sprite.chain(`${this.cdef.sprite}_idle`);
        const tx = player.x;
        const ty = player.y;
        this.ctx.fx.spawnGround('curse', tx, ty, { scale: 1 });
        this.ctx.play('phase');
        this.ctx.time.delayedCall(620, () => {
          if (this.aiState === 'dead') return;
          this.ctx.fx.spawn('shadow_spikes', tx, ty, { scale: 1.1 });
          this.ctx.play('fireImpact');
          if (player.withinContact(tx, ty, 56)) {
            player.takeDamage(this.damage + 2, tx, ty - 40);
          }
        });
        break;
      }
      default:
        this.performUntil = this.ctx.now + 500;
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The Fallen Necromancer (final boss)                                  */
/* ------------------------------------------------------------------ */

type BossAction = 'fan' | 'spikes' | 'summon' | 'burst' | 'teleport' | 'walk' | 'storm';

export class Boss extends Enemy {
  phase = 1;
  phases = 2;
  private actionQueue: BossAction[] = [];
  private performing = false;
  private performUntil = 0;
  private summonCount = 0;
  introDone = false;

  constructor(ctx: GameContext, x: number, y: number) {
    super(ctx, 'demon', x, y);
    this.isBoss = true;
    this.maxHp = Math.round(BOSS.maxHp * ctx.run.pactMult('enemyHpMult'));
    this.hp = this.maxHp;
    this.damage = Math.round(BOSS.boltDamage * ctx.run.pactMult('enemyDmgMult'));
    this.phases = ctx.run.bossFury ? 3 : 2;
    this.sprite.setScale(BOSS.scale);
    this.radius = 26;
    this.shadow?.destroy();
    this.shadow = null;
    this.attachShadow(46, 16, 0.38);
    this.sprite.play('demon_idle');
    /* dark aura */
    this.ctx.fx.spawn('dark_mist', x, y, { scale: 2.2, duration: 100000, depth: y - 2, alpha: 0.85 });
  }

  protected get knockbackResist(): number {
    return 0.85;
  }

  activate(): void {
    if (this.activated) return;
    this.activated = true;
    this.state = 'active';
    this.sprite.setAlpha(1);
    this.aiState = 'approach';
    this.ctx.play('bossRoar');
    this.ctx.fx.shake(0.008, 500);
  }

  takeDamage(amount: number, opts: DamageOpts): void {
    if (this.aiState === 'dead') return;
    super.takeDamage(amount, opts);
    if (this.hp <= 0) return;
    const ratio = this.hp / this.maxHp;
    if (this.phase === 1 && ratio <= BOSS.phase2At) {
      this.phase = 2;
      this.enterPhaseTwo();
    } else if (this.phase === 2 && this.phases === 3 && ratio <= BOSS.phase3At) {
      this.phase = 3;
      this.enterPhaseThree();
    }
  }

  private enterPhaseTwo(): void {
    this.ctx.play('phase');
    this.ctx.fx.hitstop(140);
    this.ctx.fx.shake(0.01, 500);
    this.ctx.fx.spawn('void_rift', this.x, this.y - 10, { scale: 1.6, duration: 2000 });
    this.ctx.fx.spawn('bd_fire_spiral', this.x, this.y - 10, { scale: 1.4 });
    this.aiState = 'stunned';
    this.stateUntil = this.ctx.now + 900;
    this.actionQueue = [];
    this.performing = false;
  }

  /** Third phase, sworn through the Boss Fury pact. */
  private enterPhaseThree(): void {
    this.ctx.play('phase');
    this.ctx.fx.hitstop(200);
    this.ctx.fx.shake(0.014, 700);
    this.ctx.fx.flashScreen(0xd95252, 0.3);
    this.ctx.fx.spawn('big_explosion', this.x, this.y - 12, { scale: 1.8 });
    this.ctx.fx.spawn('bd_fire_bloom', this.x, this.y - 10, { scale: 1.6 });
    this.ctx.fx.spawn('void_rift', this.x, this.y - 10, { scale: 2.1, duration: 2400 });
    this.sprite.setTint(0xe89a8a);
    this.aiState = 'stunned';
    this.stateUntil = this.ctx.now + 1100;
    this.actionQueue = [];
    this.performing = false;
    /* ring of bolts on transformation */
    const count = 12;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      this.ctx.time.delayedCall(i * 70, () => {
        if (this.aiState === 'dead') return;
        this.ctx.spawnProjectile({
          x: this.x + Math.cos(ang) * 26,
          y: this.y - 12 + Math.sin(ang) * 26,
          angle: ang,
          speed: BOSS.boltSpeed * 1.15,
          damage: this.damage,
          kind: 'bossBolt',
          owner: 'enemy',
          radius: 11,
        });
      });
    }
  }

  protected die(): void {
    this.aiState = 'dead';
    this.state = 'dead';
    this.dead = true;
    this.destroyBar();
    this.ctx.fx.hitstop(200);
    this.ctx.fx.shake(0.012, 600);
    this.ctx.fx.spawn('big_explosion', this.x, this.y - 10, { scale: 1.5 });
    this.ctx.time.delayedCall(200, () => {
      this.ctx.fx.spawn('implosion', this.x, this.y - 10, { scale: 1.2 });
      if (!this.ctx.reducedFx) this.ctx.fx.spawn('bd_fire_bloom', this.x, this.y - 8, { scale: 1.4 });
    });
    this.ctx.play('enemyDeath');
    this.sprite.play('demon_death');
    this.ctx.tweens.add({
      targets: this.sprite,
      alpha: 0,
      delay: 900,
      duration: 1200,
      onComplete: () => this.sprite.setVisible(false),
    });
    this.ctx.onEnemyKilled(this);
  }

  update(dt: number): void {
    if (this.aiState === 'dead' || !this.activated) return;
    this.updateBar();

    const player = this.ctx.player;
    const now = this.ctx.now;

    if (this.aiState === 'stunned') {
      if (now > this.stateUntil) this.aiState = 'approach';
      return;
    }
    if (!this.tickStatuses()) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.setFacing(dx < 0);

    if (this.performing) {
      if (now > this.performUntil) {
        this.performing = false;
        this.queueNext();
      }
      return;
    }
    if (this.actionQueue.length === 0) this.buildQueue();

    /* drift toward a comfortable casting range */
    const ideal = 210;
    const speed = this.currentSpeed() * (this.phase === 2 ? 1.25 : this.phase === 3 ? 1.45 : 1);
    if (dist > ideal + 40) {
      const sep = this.separation(dt);
      this.moveStep((dx / (dist || 1)) * speed * (dt / 1000) + sep.x, (dy / (dist || 1)) * speed * (dt / 1000) + sep.y);
    } else if (dist < ideal - 60) {
      this.moveStep(-(dx / (dist || 1)) * speed * (dt / 1000), -(dy / (dist || 1)) * speed * (dt / 1000));
    }
    this.updateAnim();
    if (now > this.stateUntil && this.actionQueue.length > 0) {
      this.execute(this.actionQueue.shift()!);
    }
    this.tryContactDamage(dist);
  }

  protected currentSpeed(): number {
    const def = ENEMIES.demon;
    return def.speed * this.ctx.run.pactMult('enemySpeedMult') * (this.slowUntil > this.ctx.now ? this.slowFactor : 1);
  }

  private buildQueue(): void {
    const base: BossAction[] =
      this.phase === 1
        ? ['fan', 'walk', 'burst', 'walk', 'summon', 'walk']
        : this.phase === 2
          ? ['fan', 'teleport', 'fan', 'spikes', 'walk', 'summon', 'burst', 'teleport']
          : ['storm', 'teleport', 'fan', 'spikes', 'burst', 'storm', 'summon', 'teleport'];
    this.actionQueue = base.slice();
    this.stateUntil = this.ctx.now + (this.phase === 1 ? 950 : this.phase === 2 ? 650 : 480);
  }

  private queueNext(): void {
    this.stateUntil = this.ctx.now + (this.phase === 1 ? 800 : this.phase === 2 ? 500 : 380);
  }

  private execute(action: BossAction): void {
    const player = this.ctx.player;
    this.performing = true;
    const speedMult = this.phase === 3 ? 1.45 : this.phase === 2 ? 1.25 : 1;
    switch (action) {
      case 'fan': {
        this.performUntil = this.ctx.now + 700;
        this.sprite.play('demon_atk1');
        this.sprite.chain('demon_idle');
        const count = this.phase === 1 ? 5 : this.phase === 2 ? 7 : 9;
        const baseAng = Math.atan2(player.y - 10 - this.y, player.x - this.x);
        const spread = Phaser.Math.DegToRad(56);
        for (let i = 0; i < count; i++) {
          const ang = baseAng + spread * (i / (count - 1) - 0.5);
          this.ctx.time.delayedCall(i * 90, () => {
            if (this.aiState === 'dead') return;
            this.ctx.spawnProjectile({
              x: this.x + Math.cos(ang) * 24,
              y: this.y - 12 + Math.sin(ang) * 24,
              angle: ang,
              speed: BOSS.boltSpeed * speedMult,
              damage: this.damage,
              kind: 'bossBolt',
              owner: 'enemy',
              radius: 11,
            });
          });
        }
        this.ctx.play('summon');
        break;
      }
      case 'spikes': {
        this.performUntil = this.ctx.now + 1400;
        const tx = player.x;
        const ty = player.y;
        this.ctx.fx.spawnGround('curse', tx, ty, { scale: 1.1 });
        this.ctx.play('phase');
        const rings = this.phase === 1 ? 1 : 2;
        for (let r = 0; r < rings; r++) {
          const rx = r === 0 ? tx : player.x;
          const ry = r === 0 ? ty : player.y;
          if (r > 0) this.ctx.fx.spawnGround('curse', rx, ry, { scale: 1.1 });
          this.ctx.time.delayedCall(650 + r * 650, () => {
            if (this.aiState === 'dead') return;
            this.ctx.fx.spawn('shadow_spikes', rx, ry, { scale: 1.2 });
            this.ctx.play('fireImpact');
            if (this.ctx.player.withinContact(rx, ry, 58)) {
              this.ctx.player.takeDamage(BOSS.spikeDamage * this.ctx.run.pactMult('enemyDmgMult'), rx, ry - 40);
            }
          });
        }
        break;
      }
      case 'summon': {
        this.performUntil = this.ctx.now + 1100;
        this.sprite.play('demon_atk2');
        this.sprite.chain('demon_idle');
        const alive = this.ctx.enemies.filter((e) => e.alive && e.activated && !e.isBoss).length;
        const want = Math.min(BOSS.summonCount[this.phase - 1] ?? 3, 5 - alive);
        for (let i = 0; i < want; i++) {
          this.ctx.time.delayedCall(250 + i * 220, () => {
            if (this.aiState === 'dead') return;
            this.ctx.summonEcho?.(this.x + Phaser.Math.Between(-120, 120), this.y + Phaser.Math.Between(60, 140));
          });
        }
        this.ctx.play('summon');
        break;
      }
      case 'burst': {
        this.performUntil = this.ctx.now + (this.phase === 1 ? 1900 : 2300);
        const spots = this.phase === 1 ? 3 : 4;
        for (let i = 0; i < spots; i++) {
          const tx = player.x + Phaser.Math.Between(-130, 130);
          const ty = player.y + Phaser.Math.Between(-110, 110);
          this.ctx.time.delayedCall(400 + i * 430, () => {
            if (this.aiState === 'dead') return;
            this.ctx.fx.spawnGround('magic_circle', tx, ty, { scale: 1.15 });
            this.ctx.time.delayedCall(620, () => {
              if (this.aiState === 'dead') return;
              this.ctx.fx.spawn('arcane_burst', tx, ty, { scale: 1.1 });
              this.ctx.play('fireImpact');
              if (this.ctx.player.withinContact(tx, ty, 52)) {
                this.ctx.player.takeDamage(BOSS.spikeDamage * this.ctx.run.pactMult('enemyDmgMult'), tx, ty);
              }
            });
          });
        }
        break;
      }
      case 'storm': {
        /* phase-3 exclusive: orbiting bolt spiral around the player */
        this.performUntil = this.ctx.now + 2400;
        this.sprite.play('demon_atk1');
        this.sprite.chain('demon_idle');
        const cx = player.x;
        const cy = player.y;
        this.ctx.fx.spawnGround('bd_fire_sigil', cx, cy, { scale: 1.4 });
        this.ctx.play('phase');
        const waves = 10;
        for (let w = 0; w < waves; w++) {
          this.ctx.time.delayedCall(w * 190, () => {
            if (this.aiState === 'dead') return;
            const ang = (w / waves) * Math.PI * 4;
            for (let k = 0; k < 3; k++) {
              const a = ang + (k / 3) * Math.PI * 2;
              this.ctx.spawnProjectile({
                x: cx + Math.cos(a) * 130,
                y: cy + Math.sin(a) * 130,
                angle: a + Math.PI,
                speed: BOSS.boltSpeed * 1.1,
                damage: this.damage,
                kind: 'bossBolt',
                owner: 'enemy',
                radius: 11,
              });
            }
          });
        }
        break;
      }
      case 'teleport': {
        this.performUntil = this.ctx.now + 900;
        this.ctx.fx.spawn('dark_mist', this.x, this.y, { scale: 1.4, duration: 700 });
        this.sprite.setAlpha(0);
        this.ctx.play('dodge');
        this.ctx.time.delayedCall(320, () => {
          if (this.aiState === 'dead') return;
          this.blinkNearPlayer(Phaser.Math.Between(120, 190));
          this.sprite.setAlpha(1);
          this.ctx.fx.spawn('teleport_in', this.x, this.y - 8, { scale: 1.2 });
          this.ctx.fx.spawn('dark_mist', this.x, this.y, { scale: 1.6, duration: 1200 });
        });
        break;
      }
      case 'walk':
      default: {
        this.performUntil = this.ctx.now + 600;
        break;
      }
    }
  }
}
