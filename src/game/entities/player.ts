/* The player hero: movement, dodge, melee combo, spells, boons, damage, death. */
import * as Phaser from 'phaser';
import { MELEE, PLAYER_BASE, WEAPONS } from '../config';
import type { GameContext } from '../ctx';
import {
  ChargeTracker,
  MeleeTimeline,
  inMeleeSector,
  meleeCadenceFor,
  meleeSectorFor,
  type MeleeCadence,
  type MeleePhase,
} from '../combat';
import { Entity, dist2, gridLineOfSight, moveGrid } from './base';
import type { Enemy } from './enemy';

const BODY_HALF_W = 11;
const BODY_HALF_H = 7;

export class Player extends Entity {
  private ctx: GameContext;
  hp = 100;
  mana = 60;
  moveX = 0;
  moveY = 0;
  aimX = 1;
  aimY = 0;
  /** last movement heading in radians (minimap arrow) */
  heading = 0;
  private facingLeft = false;
  private moving = false;

  /* dodge */
  private dodgeUntil = 0;
  private dodgeReadyAt = 0;
  private dodgeVX = 0;
  private dodgeVY = 0;
  private trailAt = 0;
  private dodgeChillAt = 0;

  /* melee + charge (deterministic core lives in src/game/combat.ts) */
  private readonly melee = new MeleeTimeline();
  private readonly charge = new ChargeTracker(PLAYER_BASE.boltChargeMs);
  private velocityX = 0;
  private velocityY = 0;

  /* cooldowns (timestamps) */
  private fireballReadyAt = 0;
  private frostReadyAt = 0;
  private boltReadyAt = 0;
  private whirlReadyAt = 0;

  /* damage state */
  private invulnUntil = 0;
  private hurtUntil = 0;
  private deathAt = 0;
  private tempArmor = 0;
  private tempArmorUntil = 0;
  dying = false;

  constructor(ctx: GameContext, x: number, y: number) {
    super(ctx.add.sprite(x, y, 'char_player_idle', 0));
    this.ctx = ctx;
    this.radius = 12;
    this.hp = ctx.run.stats.maxHp;
    this.mana = ctx.run.stats.maxMana;
    this.setPos(x, y);
    this.attachShadow(26, 9, 0.3);
    this.sprite.setOrigin(0.5, 0.62);
    this.sprite.play('player_idle');
  }

  get invulnerable(): boolean {
    return this.ctx.now < this.invulnUntil || this.ctx.now < this.dodgeUntil || this.dying;
  }

  get aimAngle(): number {
    return Math.atan2(this.aimY - this.y, this.aimX - this.x);
  }

  /* ------------------------------ input hooks ------------------------------ */

  queueMelee(): void {
    if (this.dying) return;
    const ev = this.melee.queue(this.ctx.now, this.cadence(), this.ctx.run.stats.meleeCooldown, this.dodgeUntil);
    if (ev) this.onSwingStart();
  }

  private cadence(): MeleeCadence {
    return meleeCadenceFor(this.ctx.run.weapon);
  }

  /** Visual + movement payload fired the frame a swing begins. */
  private onSwingStart(): void {
    const combo = this.melee.comboIndex;
    this.sprite.play(combo === 3 ? 'player_atk3' : combo === 2 ? 'player_atk2' : 'player_atk1');
    this.sprite.chain('player_idle');
    /* small weighty lunge toward the aim */
    const angle = this.aimAngle;
    const lunge = combo === 3 ? MELEE.lungeFinisherPx : MELEE.lungePx;
    const moved = moveGrid(this.ctx, this.x, this.y, Math.cos(angle) * lunge, Math.sin(angle) * lunge, BODY_HALF_W, BODY_HALF_H);
    this.setPos(moved.x, moved.y);
    this.faceByAngle(angle);
  }

  castFireball(): void {
    if (this.dying) return;
    const stats = this.ctx.run.stats;
    if (this.ctx.now < this.fireballReadyAt || this.mana < stats.fireballMana) return;
    this.mana -= stats.fireballMana;
    this.fireballReadyAt = this.ctx.now + stats.fireballCooldown;
    const angle = this.aimAngle;
    this.faceByAngle(angle);
    const burn = stats.fireBurnDps > 0 ? { dps: stats.fireBurnDps * (1 + 0.2 * this.ctx.run.stacks('spellDmg')), ms: 3000 } : undefined;
    const shots = 1 + stats.fireExtraProj;
    for (let i = 0; i < shots; i++) {
      const spread = shots > 1 ? 0.18 * (i - (shots - 1) / 2) : 0;
      const a = angle + spread;
      this.ctx.spawnProjectile({
        x: this.x + Math.cos(a) * 18,
        y: this.y - 8 + Math.sin(a) * 18,
        angle: a,
        speed: PLAYER_BASE.fireballSpeed,
        damage: stats.fireballDamage,
        kind: 'fireball',
        owner: 'player',
        radius: 12,
        splashRadius: 56 * (1 + 0.4 * this.ctx.run.stacks('fireSplash')),
        splashDamage: stats.fireballDamage * 0.55 * (1 + 0.3 * this.ctx.run.stacks('fireSplash')),
        burn,
      });
    }
    this.ctx.fx.spawn('fire_cast', this.x + Math.cos(angle) * 22, this.y - 8 + Math.sin(angle) * 22, { angle: Phaser.Math.RadToDeg(angle), scale: 0.9 });
    this.ctx.play('fireball');
  }

  castFrostNova(): void {
    if (this.dying) return;
    const stats = this.ctx.run.stats;
    if (this.ctx.now < this.frostReadyAt || this.mana < stats.frostMana) return;
    this.mana -= stats.frostMana;
    this.frostReadyAt = this.ctx.now + stats.frostCooldown;
    this.ctx.fx.spawn('frost_nova', this.x, this.y, { scale: stats.frostRadius / 110 });
    this.ctx.fx.shake(0.003, 160);
    let hits = 0;
    for (const e of this.ctx.enemies) {
      if (e.dead || !e.activated) continue;
      const d2 = dist2(this.x, this.y, e.x, e.y);
      const r = stats.frostRadius + e.radius;
      if (d2 <= r * r && this.lineOfSightFrom(e.x, e.y)) {
        hits++;
        e.applySlow(PLAYER_BASE.frostSlowFactor, PLAYER_BASE.frostSlowMs);
        if (stats.frostFreezeMs > 0) e.applyStun(stats.frostFreezeMs);
        const quench = e.quenchBurn() * PLAYER_BASE.quenchedBurnFraction;
        e.takeDamage(stats.frostDamage + quench, { sourceX: this.x, sourceY: this.y, knockback: 40, crit: false });
      }
    }
    /* Deep Stillness: refund mana per foe struck */
    if (stats.frostManaRefund > 0 && hits > 0) {
      this.mana = Math.min(stats.maxMana, this.mana + stats.frostManaRefund * hits);
      this.ctx.fx.damageNumber(this.x, this.y - 44, stats.frostManaRefund * hits, false, true);
    }
    this.ctx.play('frost');
  }

  beginBoltCharge(): void {
    if (this.dying || this.charge.active || this.ctx.now < this.boltReadyAt ||
        this.ctx.now < this.dodgeUntil || this.mana < this.ctx.run.stats.boltMana) return;
    this.charge.begin(this.ctx.now);
  }

  get boltCharge(): number {
    return this.charge.progress(this.ctx.now);
  }

  cancelCharge(): void {
    this.charge.cancel();
  }

  releaseBolt(): void {
    if (!this.charge.active) return;
    const charged = this.charge.fullyCharged(this.ctx.now) && this.mana >= this.ctx.run.stats.boltMana + PLAYER_BASE.boltChargeMana;
    this.cancelCharge();
    this.castArcaneBolt(charged);
  }

  castArcaneBolt(charged = false): void {
    if (this.dying) return;
    const stats = this.ctx.run.stats;
    if (this.ctx.now < this.boltReadyAt || this.mana < stats.boltMana) return;
    this.cancelCharge();
    this.mana -= stats.boltMana + (charged ? PLAYER_BASE.boltChargeMana : 0);
    this.boltReadyAt = this.ctx.now + stats.boltCooldown;
    const base = this.aimAngle;
    const count = stats.boltCount;
    const spread = count > 1 ? 0.16 : 0;
    for (let i = 0; i < count; i++) {
      const angle = base + spread * (i - (count - 1) / 2);
      this.ctx.spawnProjectile({
        x: this.x + Math.cos(angle) * 14,
        y: this.y - 8 + Math.sin(angle) * 14,
        angle,
        speed: PLAYER_BASE.boltSpeed,
        damage: stats.boltDamage * (charged ? PLAYER_BASE.boltChargeDamage : 1),
        kind: 'bolt',
        owner: 'player',
        radius: 9,
        pierce: stats.boltPierce + Number(charged),
      });
    }
    this.faceByAngle(base);
    this.ctx.play('bolt');
  }

  castWhirlwind(): void {
    if (this.dying) return;
    const stats = this.ctx.run.stats;
    if (this.ctx.now < this.whirlReadyAt || this.mana < stats.whirlMana) return;
    this.mana -= stats.whirlMana;
    this.whirlReadyAt = this.ctx.now + stats.whirlCooldown;
    this.ctx.fx.spawn('spin_slash', this.x, this.y - 6, { scale: stats.whirlRadius / 60, depth: this.y + 1 });
    this.ctx.fx.hitstop(50);
    this.ctx.fx.shake(0.004, 150);
    for (const e of this.ctx.enemies) {
      if (e.dead || !e.activated) continue;
      const d2 = dist2(this.x, this.y, e.x, e.y);
      const r = stats.whirlRadius + e.radius;
      if (d2 <= r * r && this.lineOfSightFrom(e.x, e.y)) {
        const crit = Math.random() < stats.critChance;
        let damage = stats.whirlDamage * (crit ? stats.critMult : 1);
        if (e.isBoss || e.isChampion) damage *= stats.bossDmgMult;
        e.takeDamage(damage, {
          sourceX: this.x,
          sourceY: this.y,
          knockback: 140,
          crit,
        });
        if (crit) this.onCrit(this.x, this.y, damage, e);
      }
    }
    this.ctx.play('whirl');
  }

  /** Crit follow-ups shared by every damage source. */
  private onCrit(x: number, y: number, damage: number, target: Enemy): void {
    const stats = this.ctx.run.stats;
    if (stats.critBlastPct > 0) this.ctx.critBlast(x, y, damage * stats.critBlastPct);
    if (stats.chainLightningPct > 0) this.ctx.chainLightning(target.x, target.y, damage * stats.chainLightningPct, target);
  }

  dodge(): void {
    if (this.dying) return;
    const stats = this.ctx.run.stats;
    if (this.ctx.now < this.dodgeReadyAt || this.ctx.now < this.dodgeUntil) return;
    let dx = this.moveX;
    let dy = this.moveY;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(this.aimAngle);
      dy = Math.sin(this.aimAngle);
    }
    const len = Math.hypot(dx, dy) || 1;
    this.dodgeVX = (dx / len) * PLAYER_BASE.dodgeSpeed;
    this.dodgeVY = (dy / len) * PLAYER_BASE.dodgeSpeed;
    this.dodgeUntil = this.ctx.now + PLAYER_BASE.dodgeMs;
    this.dodgeReadyAt = this.dodgeUntil + stats.dodgeCooldown;
    this.melee.cancel();
    this.cancelCharge();
    this.velocityX = 0;
    this.velocityY = 0;
    this.dodgeChillAt = 0;
    this.ctx.fx.spawn('blink_dash', this.x, this.y - 6, {
      angle: Phaser.Math.RadToDeg(Math.atan2(this.dodgeVY, this.dodgeVX)),
      scale: 0.9,
      depth: this.y,
    });
    this.ctx.play('dodge');
  }

  usePotion(kind: 'health' | 'mana'): boolean {
    if (this.dying) return false;
    const run = this.ctx.run;
    if (kind === 'health') {
      if (run.potions.health <= 0 || this.hp >= run.stats.maxHp) return false;
      run.potions.health--;
      this.heal(run.stats.maxHp * run.stats.healPotionPct);
    } else {
      if (run.potions.mana <= 0 || this.mana >= run.stats.maxMana) return false;
      run.potions.mana--;
      this.mana = Math.min(run.stats.maxMana, this.mana + run.stats.maxMana * run.stats.manaPotionPct);
      this.ctx.fx.spawn('mana_pickup', this.x, this.y - 10, { scale: 1.2 });
    }
    this.ctx.play('potion');
    return true;
  }

  heal(amount: number): void {
    if (this.dying) return;
    const before = this.hp;
    this.hp = Math.min(this.ctx.run.stats.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (gained >= 1) {
      this.ctx.fx.damageNumber(this.x, this.y - 30, gained, false, true);
      this.ctx.fx.spawn('holy_heal', this.x, this.y - 8, { scale: 0.8, depth: this.y - 1 });
    }
  }

  takeDamage(amount: number, sourceX: number, sourceY: number): void {
    if (this.invulnerable) return;
    this.cancelCharge();
    const stats = this.ctx.run.stats;
    let armor = stats.armor + (this.ctx.now < this.tempArmorUntil ? this.tempArmor : 0);
    let dealt = Math.max(1, amount - armor);
    /* Ashen Hide: softened below 35% health */
    if (stats.lowHpDamageCut > 0 && this.hp / stats.maxHp < 0.35) {
      dealt = Math.max(1, Math.round(dealt * (1 - stats.lowHpDamageCut)));
    }
    this.hp -= dealt;
    this.invulnUntil = this.ctx.now + stats.invulnMs;
    this.hurtUntil = this.ctx.now + 220;
    this.ctx.fx.damageNumber(this.x, this.y - 34, dealt, false);
    this.ctx.fx.spawn('blood_splat', this.x, this.y - 10, { scale: 0.7 });
    this.ctx.fx.shake(0.006, 160);
    this.ctx.fx.hitstop(45);
    this.ctx.play('hurt');
    /* Glacial Aegis: harden after a hit */
    if (stats.postHitArmor > 0) {
      this.tempArmor = stats.postHitArmor;
      this.tempArmorUntil = this.ctx.now + stats.postHitArmorMs;
      this.ctx.fx.spawn('frozen_chill', this.x, this.y - 12, { scale: 0.9, depth: this.y - 1 });
    }
    /* knockback away from the source */
    const ang = Math.atan2(this.y - sourceY, this.x - sourceX);
    const moved = moveGrid(this.ctx, this.x, this.y, Math.cos(ang) * 14, Math.sin(ang) * 14, BODY_HALF_W, BODY_HALF_H);
    this.setPos(moved.x, moved.y);
    this.flashHurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.deathAt = this.ctx.now;
      this.sprite.play('player_death');
      this.sprite.setDepth(this.y + 400);
      this.ctx.fx.shake(0.01, 400);
      this.ctx.play('death');
    }
  }

  private flashHurt(): void {
    this.sprite.setTintFill(0xe8dcc9);
    this.ctx.time.delayedCall(70, () => {
      if (this.sprite.active && !this.dying) this.sprite.clearTint();
    });
  }

  private faceByAngle(angle: number): void {
    const left = Math.cos(angle) < 0;
    if (left !== this.facingLeft) {
      this.facingLeft = left;
      this.sprite.setFlipX(left);
    }
  }

  /* ------------------------------ update ------------------------------ */

  update(dt: number): void {
    if (this.dying) {
      if (this.sprite.anims.currentAnim?.key !== 'player_death') this.sprite.play('player_death');
      return;
    }
    const stats = this.ctx.run.stats;
    this.mana = Math.min(stats.maxMana, this.mana + (stats.manaRegen * dt) / 1000);

    /* face the aim direction */
    this.faceByAngle(this.aimAngle);

    /* dodge movement */
    if (this.ctx.now < this.dodgeUntil) {
      const step = (PLAYER_BASE.dodgeSpeed * dt) / 1000;
      const moved = moveGrid(this.ctx, this.x, this.y, (this.dodgeVX / PLAYER_BASE.dodgeSpeed) * step, (this.dodgeVY / PLAYER_BASE.dodgeSpeed) * step, BODY_HALF_W, BODY_HALF_H);
      this.setPos(moved.x, moved.y);
      /* Rime Veil: chill foes you dodge past */
      if (stats.dodgeChillMs > 0 && this.ctx.now > this.dodgeChillAt) {
        this.dodgeChillAt = this.ctx.now + 110;
        for (const e of this.ctx.enemies) {
          if (e.dead || !e.activated) continue;
          const r = 42 + e.radius;
          if (dist2(this.x, this.y, e.x, e.y) <= r * r && this.lineOfSightFrom(e.x, e.y)) {
            e.applySlow(0.5, stats.dodgeChillMs);
          }
        }
      }
      if (!this.ctx.reducedFx && this.ctx.now > this.trailAt) {
        this.trailAt = this.ctx.now + 45;
        const ghost = this.ctx.add.image(this.x, this.y, 'char_player_idle', this.sprite.frame.name);
        ghost.setOrigin(0.5, 0.62);
        ghost.setFlipX(this.facingLeft);
        ghost.setAlpha(0.35);
        ghost.setTint(0x9868e8);
        ghost.setDepth(this.y - 1);
        this.ctx.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      }
      this.updateAnim('dodge');
      return;
    }

    /* melee phases */
    this.updateMeleePhase();

    /* movement */
    let vx = this.moveX;
    let vy = this.moveY;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
      this.heading = Math.atan2(vy, vx);
    }
    const response = len > 0 ? PLAYER_BASE.accelerationMs : PLAYER_BASE.brakingMs;
    const targetX = vx * stats.moveSpeed;
    const targetY = vy * stats.moveSpeed;
    const difference = Math.hypot(targetX - this.velocityX, targetY - this.velocityY);
    const fraction = difference ? Math.min(1, stats.moveSpeed * dt / response / difference) : 1;
    this.velocityX += (targetX - this.velocityX) * fraction;
    this.velocityY += (targetY - this.velocityY) * fraction;
    this.moving = this.velocityX !== 0 || this.velocityY !== 0;
    if (this.moving) {
      const step = dt / 1000;
      const moved = moveGrid(this.ctx, this.x, this.y, this.velocityX * step, this.velocityY * step, BODY_HALF_W, BODY_HALF_H);
      this.setPos(moved.x, moved.y);
    }

    /* animation state */
    if (this.melee.phase === 'none' && this.ctx.now > this.hurtUntil) {
      this.updateAnim(this.moving ? 'walk' : 'idle');
    } else if (this.ctx.now <= this.hurtUntil && this.melee.phase === 'none') {
      this.updateAnim('hurt');
    }

    /* invulnerability blink */
    this.sprite.setAlpha(this.ctx.now < this.invulnUntil ? 0.55 + 0.45 * Math.abs(Math.sin(this.ctx.now / 60)) : 1);
  }

  private updateMeleePhase(): void {
    const now = this.ctx.now;
    const ev = this.melee.tick(now, this.cadence(), this.ctx.run.stats.meleeCooldown, this.aimAngle, this.dodgeUntil);
    /* the active window keeps accepting targets that enter the arc */
    if (this.melee.phase === 'active' && now < this.melee.phaseUntil) this.resolveMeleeHits();
    if (!ev) return;
    if (ev.type === 'swing-start') {
      this.onSwingStart();
    } else if (ev.type === 'active-start') {
      this.resolveMeleeHits();
      /* deploy the slash VFX along the locked swing angle */
      const angle = ev.angle;
      const isThird = this.melee.comboIndex === 3;
      const fxKey = isThird ? 'greatsword' : 'melee_combo';
      const reach = meleeSectorFor(this.ctx.run.weapon, this.melee.comboIndex).reach;
      this.ctx.fx.spawn(fxKey, this.x + Math.cos(angle) * reach * 0.55, this.y - 8 + Math.sin(angle) * reach * 0.55, {
        angle: Phaser.Math.RadToDeg(angle),
        scale: (isThird ? 1.35 : 1.05) * WEAPONS[this.ctx.run.weapon].reach,
        flipY: Math.abs(Phaser.Math.Angle.Wrap(angle)) > Math.PI / 2,
        depth: this.y + 2,
      });
      this.ctx.play('swing');
    }
  }

  private resolveMeleeHits(): void {
    const stats = this.ctx.run.stats;
    const isThird = this.melee.comboIndex === 3;
    const sector = meleeSectorFor(this.ctx.run.weapon, this.melee.comboIndex);
    const aim = this.melee.swingAngle;
    for (const e of this.ctx.enemies) {
      if (e.dead || !e.activated || this.melee.hitSet.has(e)) continue;
      if (!inMeleeSector(this.x, this.y, aim, sector.reach, sector.arcRad, e.x, e.y, e.radius)) continue;
      if (!this.lineOfSightFrom(e.x, e.y)) continue;
      this.melee.hitSet.add(e);
      const crit = Math.random() < stats.critChance;
      const comboMult = isThird ? MELEE.finisherDamageMult : 1;
      let damage = stats.meleeDamage * comboMult * (crit ? stats.critMult : 1);
      if (e.isBoss || e.isChampion) damage *= stats.bossDmgMult;
      e.takeDamage(damage, { sourceX: this.x, sourceY: this.y, knockback: crit ? 170 : 110, crit });
      if (crit) this.onCrit(this.x, this.y, damage, e);
      if (stats.lifesteal > 0) this.heal(damage * stats.lifesteal);
    }
  }

  private updateAnim(anim: 'idle' | 'walk' | 'hurt' | 'dodge'): void {
    const key = `player_${anim === 'dodge' ? 'walk' : anim}`;
    if (this.sprite.anims.currentAnim?.key !== key) {
      this.sprite.play(key);
    }
  }

  /** Distance from a point to the player's body (for enemy contact checks). */
  withinContact(x: number, y: number, radius: number): boolean {
    const d2 = dist2(this.x, this.y, x, y);
    const r = radius + this.radius;
    return d2 <= r * r && this.lineOfSightFrom(x, y);
  }

  /** Remaining cooldown fractions (0 = ready) for the HUD. */
  cooldownFractions(): { melee: number; fireball: number; frost: number; bolt: number; whirl: number; dodge: number } {
    const now = this.ctx.now;
    const stats = this.ctx.run.stats;
    const frac = (readyAt: number, cd: number): number => Math.max(0, Math.min(1, (readyAt - now) / Math.max(1, cd)));
    return {
      melee: frac(this.melee.readyAt, stats.meleeCooldown),
      fireball: frac(this.fireballReadyAt, stats.fireballCooldown),
      frost: frac(this.frostReadyAt, stats.frostCooldown),
      bolt: frac(this.boltReadyAt, stats.boltCooldown),
      whirl: frac(this.whirlReadyAt, stats.whirlCooldown),
      dodge: frac(this.dodgeReadyAt, stats.dodgeCooldown),
    };
  }

  lineOfSightFrom(x: number, y: number): boolean {
    return gridLineOfSight(this.ctx, x, y, this.x, this.y);
  }

  /** F3 debug: live melee info for the sector overlay (null when idle). */
  debugMelee(): { phase: MeleePhase; angle: number; reach: number; arcRad: number; remainingMs: number } | null {
    const m = this.melee;
    if (m.phase === 'none') return null;
    const sector = meleeSectorFor(this.ctx.run.weapon, m.comboIndex);
    return {
      phase: m.phase,
      /* during windup show where the swing would lock if aimed now */
      angle: m.phase === 'windup' ? this.aimAngle : m.swingAngle,
      reach: sector.reach,
      arcRad: sector.arcRad,
      remainingMs: Math.max(0, m.phaseUntil - this.ctx.now),
    };
  }
}
