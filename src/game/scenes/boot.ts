/* BootScene: manifest-guided two-phase asset loading + animation factory.
   Every failure path (missing manifest, failed asset, stalled loader)
   surfaces as a `boot:error` so the UI can react instead of spinning. */
import * as Phaser from 'phaser';
import { createAnimations, loadManifestAssets, loadTextures, validateManifests } from '../assets';
import { bus } from '../bus';

const STALL_TIMEOUT_MS = 30000;

export class BootScene extends Phaser.Scene {
  private failed = false;

  constructor() {
    super({ key: 'BootScene' });
  }

  private fail(message: string): void {
    if (this.failed) return;
    this.failed = true;
    bus.emit('boot:error', { message });
  }

  preload(): void {
    loadManifestAssets(this);
    this.load.on('progress', (p: number) => bus.emit('boot:progress', { p: p * 0.25 }));
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.fail(`A required asset failed to load: ${file.url}`);
    });
    this.load.start();
  }

  create(): void {
    if (this.failed) return;

    /* second phase: textures sized from the parsed manifests */
    try {
      const manifestError = validateManifests(this);
      if (manifestError) {
        this.fail(manifestError);
        return;
      }
      loadTextures(this);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'The ruins refused to take shape.');
      return;
    }

    let settled = false;
    const complete = (): void => {
      if (settled || this.failed) return;
      settled = true;
      this.load.off('loaderror');
      createAnimations(this);
      /* soft ground-shadow texture shared by every entity */
      if (!this.textures.exists('entity_shadow')) {
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xffffff, 1);
        g.fillEllipse(18, 8, 34, 14);
        g.generateTexture('entity_shadow', 36, 16);
        g.destroy();
      }
      bus.emit('boot:progress', { p: 1 });
      bus.emit('boot:done', undefined);
      this.scene.start('GameScene');
    };

    this.load.on('progress', (p: number) => bus.emit('boot:progress', { p: 0.25 + p * 0.7 }));
    this.load.once('complete', complete);

    /* safety nets: a stalled or empty loader must still resolve */
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.fail(`A required asset failed to load: ${file.url}`);
    });
    this.time.delayedCall(STALL_TIMEOUT_MS, () => {
      if (!settled && !this.failed) {
        /* loader never finished: force the hand-off so the watchdog
           UI (not an endless spinner) takes over */
        this.fail('Asset loading stalled. Check your connection and reload.');
      }
    });

    this.load.start();

    /* nothing queued at all: complete immediately */
    this.time.delayedCall(60, () => {
      if (!settled && !this.failed && !this.load.isLoading) complete();
    });
  }
}
