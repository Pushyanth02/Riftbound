/* VFX spawner, floating damage numbers, camera feedback, hit-stop. */
import * as Phaser from 'phaser';
import { fxMeta, type EffectKey } from './assets';
import { gameAudio } from './audio';

export interface FxOptions {
  angle?: number;
  scale?: number;
  depth?: number;
  duration?: number; // overrides for looping effects
  flipY?: boolean;
  alpha?: number;
  tint?: number;
  onDone?: () => void;
}

export class FxSystem {
  private scene: Phaser.Scene;
  private active = 0;
  private maxActive = 46;
  private maxActiveReduced = 22;
  private numbers: Phaser.GameObjects.Text[] = [];
  private numberPool: Phaser.GameObjects.Text[] = [];
  private live = new Set<Phaser.GameObjects.Sprite>();
  hitstopUntil = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Destroy every live effect (used when a floor is torn down). */
  clearAll(): void {
    for (const s of this.live) s.destroy();
    this.live.clear();
    this.active = 0;
    for (const n of this.numbers) n.destroy();
    this.numbers = [];
  }

  get reduced(): boolean {
    return (this.scene.game as Phaser.Game & { riftReducedFx?: boolean }).riftReducedFx === true;
  }

  /** Spawn a one-shot (or timed loop) effect. Returns the sprite or null. */
  spawn(key: EffectKey, x: number, y: number, opts: FxOptions = {}): Phaser.GameObjects.Sprite | null {
    const meta = fxMeta[key];
    if (!meta) return null;
    const budget = this.reduced ? this.maxActiveReduced : this.maxActive;
    if (this.active >= budget && opts.depth !== 9999) return null;

    const texKey = `fx_${key}`;
    const sprite = this.scene.add.sprite(x, y, texKey, 0);
    /* origin at the effect's authored pivot */
    sprite.setOrigin(meta.pivot[0] / meta.frameW, meta.pivot[1] / meta.frameH);
    if (opts.angle !== undefined) sprite.setRotation(Phaser.Math.DegToRad(opts.angle));
    if (opts.scale !== undefined) sprite.setScale(opts.scale);
    if (opts.alpha !== undefined) sprite.setAlpha(opts.alpha);
    if (opts.tint !== undefined) sprite.setTint(opts.tint);
    if (opts.flipY) sprite.setFlipY(true);
    sprite.setDepth(opts.depth ?? 4000);
    this.active++;
    this.live.add(sprite);

    const animKey = `fx_${key}`;
    const finish = () => {
      this.active = Math.max(0, this.active - 1);
      this.live.delete(sprite);
      sprite.destroy();
      opts.onDone?.();
    };
    if (meta.loop && opts.duration !== undefined && opts.duration > 0) {
      sprite.play(animKey);
      this.scene.time.delayedCall(opts.duration, finish);
    } else if (meta.loop) {
      sprite.play(animKey);
      this.scene.time.delayedCall(2500, finish);
    } else {
      sprite.play(animKey);
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, finish);
      /* safety net in case the event is missed on scene pause */
      const total = meta.durations.reduce((a, b) => a + b, 0);
      this.scene.time.delayedCall(total + 800, () => {
        if (sprite.active) finish();
      });
    }
    return sprite;
  }

  /** Ground-level effect that Y-sorts with entities. */
  spawnGround(key: EffectKey, x: number, y: number, opts: FxOptions = {}): Phaser.GameObjects.Sprite | null {
    return this.spawn(key, x, y, { ...opts, depth: opts.depth ?? y });
  }

  /** Floating damage number. */
  damageNumber(x: number, y: number, amount: number, crit: boolean, healed = false): void {
    let text = this.numberPool.pop();
    if (!text) {
      text = this.scene.add.text(x, y, '', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: `${crit ? 22 : 16}px`,
        fontStyle: 'bold',
        color: '#E8DCC9',
        stroke: '#140E1D',
        strokeThickness: 3,
      });
      text.setOrigin(0.5);
      text.setResolution(2);
    }
    text.setText(healed ? `+${Math.round(amount)}` : `${Math.round(amount)}`);
    const style = text.style;
    style.setColor(healed ? '#65D9D0' : crit ? '#D9AD62' : '#E8DCC9');
    style.setFontSize(crit ? 22 : 16);
    text.setPosition(x + Phaser.Math.Between(-6, 6), y - 8);
    text.setAlpha(1);
    text.setScale(crit ? 1.25 : 1);
    text.setDepth(8000);
    text.setActive(true).setVisible(true);
    this.numbers.push(text);

    this.scene.tweens.add({
      targets: text,
      y: y - (crit ? 46 : 34),
      alpha: 0,
      duration: crit ? 760 : 620,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.numbers = this.numbers.filter((n) => n !== text);
        text.setActive(false).setVisible(false);
        this.numberPool.push(text);
      },
    });
  }

  shake(intensity = 0.004, duration = 120): void {
    if ((this.scene.game as Phaser.Game & { riftShake?: boolean }).riftShake === false) return;
    this.scene.cameras.main.shake(duration, intensity);
  }

  hitstop(ms: number): void {
    this.hitstopUntil = Math.max(this.hitstopUntil, this.scene.time.now + ms);
  }

  flashScreen(color = 0x9868e8, alpha = 0.18): void {
    if (this.reduced) return;
    const cam = this.scene.cameras.main;
    cam.flash(160, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, false);
    void alpha;
  }

  /** Impact package: spark + shake + sound. */
  impact(x: number, y: number, crit: boolean): void {
    this.spawn(crit ? 'crit_hit' : 'hit_spark', x, y, { scale: crit ? 1.2 : 0.9 });
    if (crit) {
      this.hitstop(80);
      this.shake(0.006, 140);
      gameAudio.play('crit');
    } else {
      this.shake(0.0025, 90);
      gameAudio.play('hit');
    }
  }

  destroy(): void {
    for (const n of this.numbers) n.destroy();
    for (const n of this.numberPool) n.destroy();
    this.numbers = [];
    this.numberPool = [];
  }
}
