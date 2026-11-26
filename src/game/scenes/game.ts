/* GameScene: run lifecycle, floor construction, entity orchestration,
   input, HUD/minimap emission, room locks, boss + champion encounters,
   boon shrines, pacts, souls, persistence. */
import * as Phaser from 'phaser';
import { bus } from '../bus';
import { BOSS, CHAMPIONS, FLOORS, MAX_FLOOR, PATRONS, PLAYER_BASE, RELICS, TILE, UPGRADES, type EnemyKind, type RelicDef } from '../config';
import type { BoonChoice, BoonInfo, Command, HudState, MinimapCorridor, MinimapData, MinimapRoom, PactId, PatronId, RelicInfo, RunStats, ShopWare, UiState, UpgradeChoice, WeaponId } from '../types';
import { FxSystem } from '../fx';
import { RunState, parseSave, availableUpgrades, boonOffering, type SaveData } from '../run';
import { Rng, randomSeed } from '../rng';
import { gameAudio } from '../audio';
import { generateDungeon, type Dungeon } from '../dungeon/generator';
import { buildDungeon, type BuiltDungeon } from '../dungeon/builder';
import { gridLineOfSight } from '../sight';
import { Player } from '../entities/player';
import { Boss, Champion, Enemy, type TelegraphDebug } from '../entities/enemy';
import { Barrier, BoonShrine, Chest, Merchant, Pickup, Portal, Projectile, Shrine, type Interactable, type PickupKind } from '../entities/objects';
import type { GameContext, ProjectileSpawn } from '../ctx';

const SAVE_KEY = 'riftbound.save';

type SceneState = 'idle' | 'running' | 'paused' | 'transition' | 'over';

export class GameScene extends Phaser.Scene implements GameContext {
  /* GameContext */
  fx!: FxSystem;
  run!: RunState;
  dungeon!: Dungeon;
  player!: Player;
  enemies: Enemy[] = [];
  now = 0;
  private sealedTiles = new Set<number>();
  private debugHitboxes?: Phaser.GameObjects.Graphics;
  reducedFx = false;

  private state: SceneState = 'idle';
  private built: BuiltDungeon | null = null;
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private interactables: Interactable[] = [];
  private barriers: Barrier[] = [];
  private roomBarriers = new Map<number, number[]>();
  private ambientSprites: Phaser.GameObjects.GameObject[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private currentRoomId = -1;
  private hudTimer = 0;
  private minimapTimer = 0;
  private bossEmitTimer = 0;
  /* HUD payload caches: relics/boons are append-only during a run, so the
     mapped arrays keep a stable identity between 100 ms ticks and React
     rows skip re-rendering unless something was actually gained */
  private hudRelics: RelicInfo[] = [];
  private hudBoons: BoonInfo[] = [];
  /* Minimap structure cache: rooms/corridors only change on discovery,
     clear, or room entry - not every 180 ms tick */
  private minimapRooms: MinimapRoom[] = [];
  private minimapCorridors: MinimapCorridor[] = [];
  private minimapFp = -1;
  private minimapFloorFor: Dungeon | null = null;
  private promptText: string | null = null;
  private bossRef: Boss | null = null;
  private championRef: Champion | null = null;
  private bossIntroUntil = 0;
  private toastId = 1;
  private levelupOpen = false;
  private shopWares: ShopWare[] = [];
  private boonOpen = false;
  private pendingBoonChoices: BoonChoice[] | null = null;
  private pendingBoonShrine: BoonShrine | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.fx = new FxSystem(this);
    this.cameras.main.setBackgroundColor('#0e0a14');

    /* input */
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,ONE,TWO,THREE,Q,F,E,I,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['TAB', 'SPACE', 'ONE', 'TWO', 'THREE']);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.state !== 'running') return;
      if (p.leftButtonDown()) this.player.queueMelee();
      else if (p.rightButtonDown()) this.player.castFireball();
    });
    this.setupKeyEdges();

    /* bus commands from the UI - unsubscribed on shutdown so destroyed
       scenes never receive stale commands (HML safety). The bus is marked
       ready only while this scene can actually receive commands; anything
       emitted earlier was queued and is flushed by markReady(). */
    const offCmd = bus.on('cmd', (cmd: Command) => this.handleCommand(cmd));
    bus.markReady();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offCmd();
      bus.markUnready();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      offCmd();
      bus.markUnready();
    });

    /* settings applied at boot */
    this.applyInitialSettings();

    /* idle menu backdrop */
    this.spawnIdleBackdrop();

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
    });
  }

  /* ------------------------------------------------------------------ */
  /* settings                                                            */
  /* ------------------------------------------------------------------ */

  private applyInitialSettings(): void {
    try {
      const raw = window.localStorage.getItem('riftbound.settings');
      if (raw) {
        const s = JSON.parse(raw) as { master: number; music: number; sfx: number; screenShake: boolean; reducedFx: boolean };
        (this.game as Phaser.Game & { riftShake?: boolean }).riftShake = s.screenShake;
        this.reducedFx = s.reducedFx;
        (this.game as Phaser.Game & { riftReducedFx?: boolean }).riftReducedFx = s.reducedFx;
        gameAudio.setVolumes(s.master, s.music, s.sfx);
      }
    } catch {
      /* defaults */
    }
  }

  /* ------------------------------------------------------------------ */
  /* commands                                                            */
  /* ------------------------------------------------------------------ */

  private handleCommand(cmd: Command): void {
    switch (cmd.type) {
      case 'start':
        this.safeRun(() => this.newRun(cmd.seed ?? randomSeed(), cmd.pacts ?? [], cmd.weapon));
        break;
      case 'continue':
        this.safeRun(() => this.continueRun());
        break;
      case 'restart':
        this.safeRun(() => this.newRun(randomSeed(), this.run?.pacts ?? [], this.run?.weapon));
        break;
      case 'quit':
        this.quitToMenu();
        break;
      case 'pause':
        this.pauseGame();
        break;
      case 'resume':
        this.resumeGame();
        break;
      case 'upgrade':
        this.chooseUpgrade(cmd.index);
        break;
      case 'boon':
        this.chooseBoon(cmd.index);
        break;
      case 'pacts:back':
        this.emitUiState('menu');
        break;
      case 'cast':
        this.handleCast(cmd.slot);
        break;
      case 'potion':
        if (this.state === 'running') this.player.usePotion(cmd.kind);
        break;
      case 'settings':
        (this.game as Phaser.Game & { riftShake?: boolean }).riftShake = cmd.settings.screenShake;
        this.reducedFx = cmd.settings.reducedFx;
        (this.game as Phaser.Game & { riftReducedFx?: boolean }).riftReducedFx = cmd.settings.reducedFx;
        gameAudio.setVolumes(cmd.settings.master, cmd.settings.music, cmd.settings.sfx);
        break;
      case 'inventory':
        if (cmd.open && this.state === 'running') this.pauseGame('inventory');
        else if (!cmd.open && this.state === 'paused') this.resumeGame();
        break;
      case 'shop:buy':
        this.buyWare(cmd.index);
        break;
      case 'shop:close':
        bus.emit('shop', null);
        if (this.state === 'paused') this.resumeGame();
        break;
      default:
        break;
    }
  }

  private handleCast(slot: 'melee' | 'fireball' | 'frost' | 'bolt' | 'whirl' | 'dodge'): void {
    if (this.state !== 'running' || this.now < this.bossIntroUntil) return;
    switch (slot) {
      case 'melee':
        this.player.queueMelee();
        break;
      case 'fireball':
        this.player.castFireball();
        break;
      case 'frost':
        this.player.castFrostNova();
        break;
      case 'bolt':
        this.player.castArcaneBolt();
        break;
      case 'whirl':
        this.player.castWhirlwind();
        break;
      case 'dodge':
        this.player.dodge();
        break;
      default:
        break;
    }
  }

  /** Run starters are guarded: a thrown error must kick the UI back to
      the menu instead of leaving it on the loading screen forever. */
  private safeRun(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('[riftbound] run failed to start', err);
      this.state = 'idle';
      try {
        this.teardownFloor();
        this.spawnIdleBackdrop();
      } catch {
        /* best-effort cleanup */
      }
      this.emitUiState('menu');
      this.toast('The descent failed to begin. Please retry.');
    }
  }

  private setupKeyEdges(): void {
    const kb = this.input.keyboard!;
    if (process.env.NODE_ENV === 'development') {
      kb.on('keydown-F3', () => {
        if (this.debugHitboxes) {
          this.debugHitboxes.destroy();
          this.debugHitboxes = undefined;
        } else {
          this.debugHitboxes = this.add.graphics().setDepth(1e9);
        }
      });
    }
    kb.on('keydown-SPACE', () => {
      if (this.state === 'running' && this.now > this.bossIntroUntil) this.player.dodge();
    });
    kb.on('keydown-ONE', () => {
      if (this.state === 'running') this.player.castFrostNova();
    });
    kb.on('keydown-TWO', () => {
      if (this.state === 'running' && this.now >= this.bossIntroUntil) this.player.beginBoltCharge();
    });
    kb.on('keyup-TWO', () => {
      if (this.state === 'running') this.player.releaseBolt();
    });
    kb.on('keydown-THREE', () => {
      if (this.state === 'running') this.player.castWhirlwind();
    });
    kb.on('keydown-Q', () => {
      if (this.state === 'running') this.player.usePotion('health');
    });
    kb.on('keydown-F', () => {
      if (this.state === 'running') this.player.usePotion('mana');
    });
    kb.on('keydown-E', () => {
      if (this.state === 'running') this.tryInteract();
    });
    kb.on('keydown-I', () => {
      if (this.state === 'running') bus.command({ type: 'inventory', open: true });
      else if (this.state === 'paused') bus.command({ type: 'inventory', open: false });
    });
    kb.on('keydown-ESC', () => {
      if (this.state === 'running') this.pauseGame();
    });
  }

  private pauseGame(uiState: 'paused' | 'levelup' | 'inventory' | 'shop' | 'boon' = 'paused'): void {
    if (this.state === 'running') {
      this.player.cancelCharge();
      this.state = 'paused';
      this.time.paused = true;
      this.tweens.pauseAll();
    }
    this.emitUiState(uiState);
    gameAudio.setMusicMode('menu');
  }

  private resumeGame(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.time.paused = false;
    this.tweens.resumeAll();
    this.emitUiState('playing');
    gameAudio.setMusicMode(this.bossRef?.alive || this.championRef?.alive ? 'boss' : 'explore');
  }

  private emitUiState(state: UiState): void {
    bus.emit('ui:state', { state });
  }

  /* ------------------------------------------------------------------ */
  /* run lifecycle                                                       */
  /* ------------------------------------------------------------------ */

  private newRun(seed: number, pacts: PactId[], weapon: WeaponId = 'sword'): void {
    this.run = new RunState(seed, pacts, weapon);
    this.run.potions = { health: 2, mana: 1 };
    this.startFloor(1);
    bus.emit('run:start', { seed, floor: 1 });
    if (pacts.length > 0) {
      this.toast(`${pacts.length} oath${pacts.length > 1 ? 's' : ''} sworn — the dark takes notice`, '/assets/icons/relic_shield.png');
    }
  }

  private continueRun(): void {
    const data = this.readSave();
    if (!data) {
      this.newRun(randomSeed(), []);
      return;
    }
    this.run = RunState.fromSave(data);
    this.startFloor(this.run.floor);
  }

  private startFloor(floor: number): void {
    this.state = 'transition';
    this.teardownFloor();
    this.run.floor = floor;
    this.dungeon = generateDungeon(this.run.seed, floor);
    this.built = buildDungeon(this, this.dungeon);

    /* theme tint on the floor layer for deeper floors */
    const theme = FLOORS[Math.min(floor, FLOORS.length) - 1];
    if (theme.tint !== 0xffffff) {
      this.built.floorLayer.setTint(theme.tint);
      for (const w of this.built.wallImages) w.setTint(theme.tint);
    }

    /* player */
    this.player = new Player(this, this.dungeon.playerSpawn.x, this.dungeon.playerSpawn.y);
    this.player.hp = Math.min(this.run.hp, this.run.stats.maxHp);
    this.player.mana = Math.min(this.run.mana, this.run.stats.maxMana);

    /* enemies + props + interactables */
    for (const room of this.dungeon.rooms) {
      for (const sp of room.enemySpawns) {
        this.spawnEnemy(sp.kind, (sp.x + 0.5) * TILE, (sp.y + 0.5) * TILE, room.id, sp.elite === true);
      }
      if (room.type === 'boss') {
        /* The Fallen Necromancer awaits before his altar */
        const boss = new Boss(this, (room.cx + 0.5) * TILE, (room.y + 5.5) * TILE);
        boss.roomId = room.id;
        this.enemies.push(boss);
      }
      if (room.type === 'encounter') {
        /* a Champion guards each upper-floor sanctum */
        const cdef = CHAMPIONS[Math.min(floor, MAX_FLOOR - 1)];
        if (cdef) {
          const champ = new Champion(this, cdef, (room.cx + 0.5) * TILE, (room.cy + 0.5) * TILE);
          champ.roomId = room.id;
          this.enemies.push(champ);
        }
      }
      for (const prop of room.props) {
        this.placeProp(prop.kind, (prop.x + 0.5) * TILE, (prop.y + 0.5) * TILE, room.id);
      }
      /* barriers per gate, indexed per room */
      const indices: number[] = [];
      for (const gate of room.gates) {
        indices.push(this.barriers.length);
        this.barriers.push(new Barrier(this, gate.tiles));
      }
      this.roomBarriers.set(room.id, indices);
    }
    this.spawnAmbient(theme.ambient);
    this.currentRoomId = -1;

    /* camera */
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.dungeon.width * TILE, this.dungeon.height * TILE);
    this.applyZoom();
    cam.startFollow(this.player.sprite, false, 0.12, 0.12);
    cam.setDeadzone(70, 50);
    cam.fadeIn(650, 0, 0, 0);

    this.state = 'running';
    gameAudio.setMusicMode('explore');
    bus.emit('floor', { floor, name: theme.name });
    this.enterRoom(this.dungeon.startRoom, true);
    this.emitHud();
    this.emitMinimap();
    this.persistSave();
    this.emitUiState('playing');
  }

  private teardownFloor(): void {
    this.time.removeAllEvents();
    this.time.paused = false;
    this.tweens.resumeAll();
    this.levelupOpen = false;
    this.boonOpen = false;
    this.pendingChoices = null;
    this.pendingBoonChoices = null;
    this.pendingBoonShrine = null;
    this.sealedTiles.clear();
    this.debugHitboxes?.clear();
    this.hudRelics = [];
    this.hudBoons = [];
    this.fx.clearAll();
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.sprite.destroy();
    for (const p of this.pickups) if (!p.collected) p.sprite.destroy();
    for (const i of this.interactables) i.destroy?.();
    for (const b of this.barriers) b.destroy();
    for (const a of this.ambientSprites) {
      this.tweens.killTweensOf(a);
      a.destroy();
    }
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.interactables = [];
    this.barriers = [];
    this.roomBarriers.clear();
    this.ambientSprites = [];
    this.bossRef = null;
    this.championRef = null;
    this.bossIntroUntil = 0;
    this.bossEmitTimer = 0;
    /* clear any stale boss/champion bar left over from the previous run */
    bus.emit('boss', null);
    for (const decal of this.built?.decals ?? []) decal.destroy();
    this.built?.floorLayer.destroy();
    for (const w of this.built?.wallImages ?? []) w.destroy();
    this.built = null;
    this.player?.destroy();
    this.tweens.resumeAll();
  }

  private quitToMenu(): void {
    this.teardownFloor();
    this.state = 'idle';
    this.spawnIdleBackdrop();
    this.emitUiState('menu');
    gameAudio.setMusicMode('menu');
    bus.emit('boss', null);
    this.refreshSaveInfo();
  }

  /* ------------------------------------------------------------------ */
  /* spawning helpers                                                    */
  /* ------------------------------------------------------------------ */

  private spawnEnemy(kind: EnemyKind, x: number, y: number, roomId: number, elite = false): void {
    const enemy = new Enemy(this, kind, x, y, elite);
    enemy.roomId = roomId;
    this.enemies.push(enemy);
  }

  private placeProp(kind: string, x: number, y: number, roomId: number): void {
    switch (kind) {
      case 'chest':
        this.interactables.push(new Chest(this, x, y));
        break;
      case 'shrine':
        this.interactables.push(new Shrine(this, x, y));
        if (this.dungeon.rooms[roomId].type !== 'encounter') this.refreshMinimapIcon(roomId, 'shrine');
        break;
      case 'merchant':
        this.interactables.push(new Merchant(this, x, y));
        this.refreshMinimapIcon(roomId, 'merchant');
        break;
      case 'brazier': {
        const flame = this.add.sprite(x, y - 14, 'fx_candle_flame', 0);
        flame.play('fx_candle_flame');
        flame.setDepth(y + 2);
        flame.setScale(1.7);
        this.ambientSprites.push(flame);
        if (!this.reducedFx) {
          this.fx.spawn('embers', x, y - 30, { scale: 0.5, duration: 100000, depth: y + 3 });
        }
        void roomId;
        break;
      }
      case 'portal': {
        const portal = new Portal(this, x, y, this.dungeon.floor >= MAX_FLOOR ? 'Enter the seal' : 'Descend');
        this.wirePortal(portal);
        this.interactables.push(portal);
        break;
      }
      case 'altar': {
        const altar = this.add.sprite(x, y, 'prop_altar', 0);
        altar.setOrigin(0.5, 0.86);
        altar.setDepth(y);
        altar.setScale(0.85);
        this.ambientSprites.push(altar);
        this.fx.spawn('magic_motes', x, y - 40, { scale: 0.8, duration: 100000, depth: y - 1 });
        void roomId;
        break;
      }
      case 'torch': {
        const torch = this.add.sprite(x, y - 6, 'fx_wall_torch', 0);
        torch.play('fx_wall_torch');
        torch.setDepth(y + TILE + 2);
        torch.setScale(1.1);
        this.ambientSprites.push(torch);
        if (!this.reducedFx) {
          this.fx.spawn('embers', x, y - 16, { scale: 0.55, duration: 100000, depth: y + TILE + 3 });
        }
        break;
      }
      case 'chalice': {
        const c = this.add.sprite(x, y, 'prop_chalice', 0);
        c.play('prop_chalice_anim');
        c.setDepth(y);
        c.setOrigin(0.5, 0.75);
        this.ambientSprites.push(c);
        break;
      }
      case 'arch': {
        const a = this.add.image(x, y, 'prop_arch');
        a.setDepth(y);
        a.setOrigin(0.5, 0.9);
        a.setScale(0.75);
        this.ambientSprites.push(a);
        break;
      }
      default:
        break;
    }
  }

  private spawnAmbient(kind: 'embers' | 'motes' | 'fog'): void {
    if (this.reducedFx) return;
    const rng = new Rng(this.run.seed ^ (this.run.floor * 31337));
    for (const room of this.dungeon.rooms) {
      const count = kind === 'fog' ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const x = rng.range((room.x + 2) * TILE, (room.x + room.w - 2) * TILE);
        const y = rng.range((room.y + 2) * TILE, (room.y + room.h - 2) * TILE);
        const key = kind === 'embers' ? 'embers' : kind === 'motes' ? 'magic_motes' : 'fog_bank';
        const s = this.add.sprite(x, y, `fx_${key}`, 0);
        s.play(`fx_${key}`);
        s.setAlpha(kind === 'fog' ? 0.16 : 0.5);
        s.setDepth(-80);
        s.setScale(rng.range(0.8, 1.5));
        this.ambientSprites.push(s);
        this.tweens.add({
          targets: s,
          y: y + rng.range(-30, 30),
          x: x + rng.range(-40, 40),
          duration: rng.int(4000, 9000),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private spawnIdleBackdrop(): void {
    /* quiet drifting motes behind the main menu */
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(100, this.scale.width - 100);
      const y = Phaser.Math.Between(100, this.scale.height - 100);
      const s = this.add.sprite(x, y, 'fx_magic_motes', 0);
      s.play('fx_magic_motes');
      s.setAlpha(0.25);
      s.setScale(Phaser.Math.FloatBetween(0.6, 1.2));
      s.setScrollFactor(0);
      s.setDepth(-10);
      this.ambientSprites.push(s);
      this.tweens.add({
        targets: s,
        y: y + Phaser.Math.Between(-80, 80),
        duration: Phaser.Math.Between(5000, 10000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* GameContext implementation                                          */
  /* ------------------------------------------------------------------ */

  walkableAtPx(x: number, y: number): boolean {
    const d = this.dungeon;
    if (!d) return false;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return false;
    const index = ty * d.width + tx;
    return d.walkable[index] === 1 && !this.sealedTiles.has(index);
  }

  spawnProjectile(spawn: ProjectileSpawn): void {
    this.projectiles.push(new Projectile(this, spawn));
  }

  spawnPickup(kind: PickupKind, x: number, y: number, value = 1): void {
    if (!this.walkableAtPx(x, y)) {
      x = this.player.x;
      y = this.player.y;
    }
    this.pickups.push(new Pickup(this, kind, x, y, value));
  }

  private dropGold(x: number, y: number, total: number, piles: number): void {
    piles = Math.min(total, piles);
    for (let i = 0; i < piles; i++) {
      this.spawnPickup('coin', x, y, Math.floor(total / piles) + Number(i < total % piles));
    }
  }

  addXp(amount: number): void {
    this.run.addXp(amount);
  }

  play(cue: string): void {
    gameAudio.play(cue as Parameters<typeof gameAudio.play>[0]);
  }

  toast(text: string, icon?: string): void {
    bus.emit('toast', { id: this.toastId++, text, icon });
  }

  grantRelic(def: RelicDef): void {
    const added = this.run.addRelic(def.id);
    if (added) {
      this.toast(`${added.name} — ${added.desc}`, added.icon);
      this.fx.spawn('level_up', this.player.x, this.player.y - 10, { scale: 0.9 });
      this.play('levelup');
      this.emitHud();
    }
  }

  /** Echoing Arc: crit chains to a nearby foe (no further chaining). */
  chainLightning(fromX: number, fromY: number, damage: number, exclude: Enemy): void {
    let best: Enemy | null = null;
    let bestD2 = 150 * 150;
    for (const e of this.enemies) {
      if (e === exclude || e.dead || !e.activated) continue;
      const d2 = (e.x - fromX) * (e.x - fromX) + (e.y - fromY) * (e.y - fromY);
      if (d2 < bestD2 && gridLineOfSight(this, fromX, fromY, e.x, e.y)) {
        bestD2 = d2;
        best = e;
      }
    }
    if (!best) return;
    this.fx.spawn('arcane_cast', best.x, best.y - 12, { scale: 0.8, depth: best.y - 1, tint: 0xb49ae8 });
    this.fx.spawn('arcane_burst', (fromX + best.x) / 2, (fromY + best.y) / 2 - 10, { scale: 0.5, tint: 0xb49ae8 });
    best.takeDamage(damage, { sourceX: fromX, sourceY: fromY, knockback: 50, crit: false });
    this.play('bolt');
  }

  /** Choir Detonation: ember burst around a crit point. */
  critBlast(x: number, y: number, damage: number): void {
    this.fx.spawn('fire_nova', x, y, { scale: 0.95, depth: y });
    this.play('fireImpact');
    for (const e of this.enemies) {
      if (e.dead || !e.activated) continue;
      const r = 55 + e.radius;
      const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d2 <= r * r && gridLineOfSight(this, x, y, e.x, e.y)) {
        e.takeDamage(damage, { sourceX: x, sourceY: y, knockback: 80, crit: false });
      }
    }
  }

  refreshMinimapIcon(roomId: number, icon: 'merchant' | 'champion' | 'boon' | 'shrine' | null): void {
    const room = this.dungeon?.rooms[roomId];
    if (!room) return;
    room.icon = icon;
    this.emitMinimap();
  }

  summonEcho(x: number, y: number): void {
    if (!this.walkableAtPx(x, y) || this.roomOfPoint(x, y) !== this.currentRoomId) return;
    const alive = this.enemies.filter((e) => e.alive && e.roomId === this.currentRoomId && !e.isBoss && !e.isChampion).length;
    if (alive >= 7) return;
    const echo = new Enemy(this, BOSS.summonKind, x, y);
    echo.roomId = this.roomOfPoint(x, y);
    this.enemies.push(echo);
    this.fx.spawn('teleport_in', x, y - 8, { scale: 0.9 });
    echo.activate();
  }

  private roomOfPoint(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (const room of this.dungeon.rooms) {
      if (tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) return room.id;
    }
    return this.currentRoomId;
  }

  onEnemyKilled(enemy: Enemy): void {
    this.run.kills++;
    const elite = enemy.elite;
    const champ = enemy.isChampion ? (enemy as Champion) : null;
    /* Devouring Dark: kills restore health */
    if (this.run.stats.killHeal > 0) this.player.heal(this.run.stats.killHeal);

    if (enemy.isBoss) {
      this.addXp(BOSS.xp);
      const gold = Phaser.Math.Between(BOSS.gold[0], BOSS.gold[1]);
      this.dropGold(enemy.x, enemy.y, gold, 8);
      for (let i = 0; i < BOSS.souls; i++) this.spawnPickup('soul', enemy.x + Phaser.Math.Between(-40, 40), enemy.y + Phaser.Math.Between(-30, 30), 1);
      /* guaranteed relic */
      const pool = RELICS.filter((r) => !this.run.relics.some((own) => own.id === r.id));
      if (pool.length > 0) {
        const pick = pool[Phaser.Math.Between(0, pool.length - 1)];
        this.time.delayedCall(900, () => this.grantRelic(pick));
      }
      bus.emit('boss', null);
      this.bossRef = null;
      /* the seal opens: place the exit inside the boss room on the last floor */
      if (this.run.floor >= MAX_FLOOR) {
        this.time.delayedCall(1400, () => {
          const room = this.dungeon.rooms[this.dungeon.bossRoom];
          const portal = new Portal(this, (room.cx + 0.5) * TILE, (room.cy + 0.5) * TILE, 'Enter the seal');
          this.wirePortal(portal);
          this.interactables.push(portal);
          this.toast('The seal stands open', '/assets/icons/portal.png');
          this.play('doorOpen');
        });
      }
      gameAudio.setMusicMode('explore');
    } else if (champ) {
      /* champion bounty: xp, gold, souls, guaranteed relic */
      const cdef = champ.cdef;
      this.addXp(cdef.xp);
      const gold = Phaser.Math.Between(cdef.gold[0], cdef.gold[1]);
      this.dropGold(enemy.x, enemy.y, gold, 6);
      for (let i = 0; i < cdef.souls; i++) this.spawnPickup('soul', enemy.x + Phaser.Math.Between(-36, 36), enemy.y + Phaser.Math.Between(-26, 26), 1);
      this.spawnPickup('potion-h', enemy.x - 30, enemy.y + 20, 1);
      const pool = RELICS.filter((r) => !this.run.relics.some((own) => own.id === r.id));
      if (pool.length > 0) {
        const pick = pool[Phaser.Math.Between(0, pool.length - 1)];
        this.time.delayedCall(800, () => this.grantRelic(pick));
      }
      this.championRef = null;
      bus.emit('boss', null);
      this.toast(`${cdef.name} falls`, '/assets/icons/skull.png');
      gameAudio.setMusicMode('explore');
    } else {
      const def = enemy.def;
      this.addXp(def.xp);
      const gold = Phaser.Math.Between(def.gold[0], def.gold[1]);
      const coins = Math.max(1, Math.round(gold / 3));
      this.dropGold(enemy.x, enemy.y, gold, coins);
      const roll = Math.random();
      if (elite) {
        /* elite bounties always pay souls and often a potion */
        this.spawnPickup('soul', enemy.x, enemy.y, 1);
        if (roll < 0.5) this.spawnPickup('potion-h', enemy.x, enemy.y, 1);
        else if (roll < 0.7) this.spawnPickup('potion-m', enemy.x, enemy.y, 1);
        else this.spawnPickup('gem', enemy.x, enemy.y, 10);
      } else {
        if (roll < 0.16) this.spawnPickup('heart', enemy.x, enemy.y, 1);
        else if (roll < 0.27) this.spawnPickup('mana', enemy.x, enemy.y, 1);
        else if (roll < 0.32) this.spawnPickup('potion-h', enemy.x, enemy.y, 1);
        else if (roll < 0.345) this.spawnPickup('soul', enemy.x, enemy.y, 1);
      }
    }
    this.checkRoomCleared(enemy.roomId);
  }

  onMerchantOpened(): void {
    const rng = new Rng(this.run.seed ^ (this.run.floor * 911));
    const relicPool = RELICS.filter((r) => !this.run.relics.some((own) => own.id === r.id));
    const relic = relicPool.length > 0 ? relicPool[rng.int(0, relicPool.length - 1)] : null;
    this.shopWares = [
      { id: 'ware-h', name: 'Health Potion', desc: 'Mends 40% of your health.', icon: '/assets/icons/health_potion.png', price: 25, kind: 'potion-h', sold: false },
      { id: 'ware-m', name: 'Mana Potion', desc: 'Restores half your mana.', icon: '/assets/icons/mana_potion.png', price: 20, kind: 'potion-m', sold: false },
    ];
    if (relic) {
      this.shopWares.push({ id: `ware-${relic.id}`, name: relic.name, desc: relic.desc, icon: relic.icon, price: 60, kind: 'relic', sold: false });
    }
    bus.emit('shop', { wares: this.shopWares, gold: this.run.gold });
    this.pauseGame('shop');
  }

  private buyWare(index: number): void {
    const ware = this.shopWares[index];
    if (!ware || ware.sold || this.run.gold < ware.price) return;
    this.run.gold -= ware.price;
    ware.sold = true;
    if (ware.kind === 'potion-h') this.run.potions.health++;
    else if (ware.kind === 'potion-m') this.run.potions.mana++;
    else if (ware.kind === 'relic') {
      const def = RELICS.find((r) => r.id === ware.id.replace('ware-', ''));
      if (def) this.grantRelic(def);
    }
    this.play('coin');
    bus.emit('shop', { wares: this.shopWares.slice(), gold: this.run.gold });
    this.emitHud();
  }

  /* ------------------------------------------------------------------ */
  /* rooms                                                               */
  /* ------------------------------------------------------------------ */

  private roomOfPlayer(): number {
    return this.roomOfPoint(this.player.x, this.player.y);
  }

  private enterRoom(roomId: number, silent = false): void {
    if (roomId === this.currentRoomId) return;
    this.currentRoomId = roomId;
    const room = this.dungeon.rooms[roomId];
    room.discovered = true;
    for (const gate of room.gates) {
      const other = this.dungeon.rooms[gate.otherRoom];
      if (other && other.type !== 'boss') other.discovered = true;
    }
    if (!silent) {
      const champ = this.enemies.find((e) => e.isChampion && (e as Champion).roomId === roomId) as Champion | undefined;
      const sub = room.type === 'boss' ? BOSS.title : champ ? champ.cdef.title : undefined;
      bus.emit('room', { name: room.name, sub });
    }

    const hasLivingEnemies = this.enemies.some((e) => e.roomId === roomId && e.alive);
    if (hasLivingEnemies && (room.type === 'combat' || room.type === 'encounter' || room.type === 'boss')) {
      this.lockRoom(roomId);
      for (const e of this.enemies) {
        if (e.roomId === roomId && e.alive && !e.isBoss && !e.isChampion) e.activate();
      }
      if (room.type === 'boss') this.startBossIntro();
      else if (room.type === 'encounter') this.startChampionIntro(roomId);
    } else if (!hasLivingEnemies) {
      room.cleared = true;
    }
    this.emitMinimap();
  }

  private lockRoom(roomId: number): void {
    const room = this.dungeon.rooms[roomId];
    // Clear the threshold before sealing tiles under the trailing edge of the feet.
    this.player.setPos(
      Phaser.Math.Clamp(this.player.x, room.x * TILE + 12, (room.x + room.w) * TILE - 12),
      Phaser.Math.Clamp(this.player.y, room.y * TILE + 8, (room.y + room.h) * TILE - 8),
    );
    for (const gate of this.dungeon.rooms[roomId].gates) {
      for (const tile of gate.tiles) this.sealedTiles.add(tile.y * this.dungeon.width + tile.x);
    }
    const indices = this.roomBarriers.get(roomId) ?? [];
    for (const i of indices) this.barriers[i]?.lock();
    this.play('doorOpen');
  }

  private unlockRoom(roomId: number): void {
    for (const gate of this.dungeon.rooms[roomId].gates) {
      for (const tile of gate.tiles) this.sealedTiles.delete(tile.y * this.dungeon.width + tile.x);
    }
    const indices = this.roomBarriers.get(roomId) ?? [];
    for (const i of indices) this.barriers[i]?.unlock();
  }

  private checkRoomCleared(roomId: number): void {
    if (roomId === undefined || roomId < 0) return;
    const room = this.dungeon.rooms[roomId];
    if (!room || room.cleared) return;
    const hasLiving = this.enemies.some((e) => e.roomId === roomId && e.alive);
    if (hasLiving) return;
    room.cleared = true;
    this.unlockRoom(roomId);
    if (room.type === 'combat' || room.type === 'encounter') {
      this.addXp(12);
      this.toast('The room falls silent', '/assets/icons/skull.png');
      this.rollRoomReward(room);
    }
    this.emitMinimap();
  }

  /** Post-clear bounty: a patron shrine, a potion, or a stray soul. */
  private rollRoomReward(room: import('../dungeon/generator').Room): void {
    const rng = new Rng(this.run.seed ^ (this.run.floor * 613) ^ (room.id * 89));
    const roll = rng.next();
    if (roll < 0.42) {
      /* boon shrine at the room center (or a nearby walkable spot) */
      let sx = (room.cx + 0.5) * TILE;
      let sy = (room.cy + 0.5) * TILE;
      if (!this.walkableAtPx(sx, sy)) {
        outer: for (let r = 1; r <= 3; r++) {
          for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
            const tx = (room.cx + dx + 0.5) * TILE;
            const ty = (room.cy + dy + 0.5) * TILE;
            if (this.walkableAtPx(tx, ty)) {
              sx = tx;
              sy = ty;
              break outer;
            }
          }
        }
      }
      const shrine = new BoonShrine(this, sx, sy);
      this.interactables.push(shrine);
      this.refreshMinimapIcon(room.id, 'boon');
      this.toast('A patron marks this place', PATRONS.void.icon);
    } else if (roll < 0.62) {
      this.spawnPickup('potion-h', this.player.x + Phaser.Math.Between(-40, 40), this.player.y + 30, 1);
    } else if (roll < 0.72) {
      this.spawnPickup('soul', (room.cx + 0.5) * TILE, (room.cy + 0.5) * TILE, 1);
    }
  }

  private startBossIntro(): void {
    const boss = this.enemies.find((e) => e.isBoss);
    if (!boss || !(boss instanceof Boss)) return;
    this.bossRef = boss;
    this.bossIntroUntil = this.now + 2100;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(boss.x, boss.y - 30, 750, 'Sine.easeInOut');
    this.time.delayedCall(850, () => {
      boss.activate();
      this.emitBossState();
      this.play('bossRoar');
      this.fx.spawn('bd_fire_sigil', boss.x, boss.y, { scale: 1.3, depth: boss.y - 1 });
    });
    this.time.delayedCall(1650, () => {
      cam.pan(this.player.x, this.player.y, 450, 'Sine.easeInOut');
    });
    this.time.delayedCall(2100, () => {
      cam.startFollow(this.player.sprite, false, 0.12, 0.12);
      cam.setDeadzone(70, 50);
      gameAudio.setMusicMode('boss');
    });
  }

  private startChampionIntro(roomId: number): void {
    const champ = this.enemies.find((e) => e.isChampion && e.roomId === roomId);
    if (!champ || !(champ instanceof Champion)) return;
    this.championRef = champ;
    this.bossIntroUntil = this.now + 1800;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(champ.x, champ.y - 24, 650, 'Sine.easeInOut');
    this.time.delayedCall(750, () => {
      champ.activate();
      this.emitBossState();
    });
    this.time.delayedCall(1400, () => {
      cam.pan(this.player.x, this.player.y, 400, 'Sine.easeInOut');
    });
    this.time.delayedCall(1800, () => {
      cam.startFollow(this.player.sprite, false, 0.12, 0.12);
      cam.setDeadzone(70, 50);
      gameAudio.setMusicMode('boss');
    });
  }

  private emitBossState(): void {
    if (this.bossRef) {
      bus.emit('boss', { name: BOSS.name, title: BOSS.title, hp: Math.max(0, this.bossRef.hp), maxHp: this.bossRef.maxHp, phase: this.bossRef.phase, phases: this.bossRef.phases });
    } else if (this.championRef) {
      const c = this.championRef;
      bus.emit('boss', { name: c.cdef.name, title: c.cdef.title, hp: Math.max(0, c.hp), maxHp: c.maxHp, phase: c.phase, phases: 2, champion: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /* boon shrines                                                        */
  /* ------------------------------------------------------------------ */

  onBoonShrineOpened(shrine: BoonShrine): void {
    if (this.state !== 'running' || this.boonOpen) return;
    /* pick a patron, favoring whichever granted the fewest boons so far */
    const counts: Record<PatronId, number> = { ember: 0, frost: 0, void: 0 };
    for (const b of this.run.boons) counts[b.patron]++;
    const patrons: PatronId[] = ['ember', 'frost', 'void'];
    const min = Math.min(...patrons.map((p) => counts[p]));
    const favored = patrons.filter((p) => counts[p] === min);
    const patron = favored[Phaser.Math.Between(0, favored.length - 1)];
    const pool = boonOffering(this.run, patron, 3);
    if (pool.length === 0) {
      /* every boon owned: the patron pays in souls instead */
      shrine.consume();
      this.refreshMinimapIcon(this.roomOfPoint(shrine.x, shrine.y), null);
      const souls = 3 + this.run.floor;
      for (let i = 0; i < souls; i++) this.spawnPickup('soul', shrine.x + Phaser.Math.Between(-30, 30), shrine.y + Phaser.Math.Between(-20, 20), 1);
      this.toast('The patron pays tribute in souls', '/assets/icons/ghost.png');
      return;
    }
    this.boonOpen = true;
    this.pendingBoonShrine = shrine;
    this.pendingBoonChoices = pool.map((b) => ({
      id: b.id,
      name: b.name,
      desc: b.desc,
      icon: b.icon,
      patron: b.patron,
      rarity: b.rarity,
      owned: false,
    }));
    this.play('levelup');
    this.fx.spawn('level_up', shrine.x, shrine.y - 12, { scale: 1 });
    bus.emit('boon', { patron, choices: this.pendingBoonChoices });
    this.pauseGame('boon');
  }

  private chooseBoon(index: number): void {
    if (!this.boonOpen) return;
    const current = this.pendingBoonChoices;
    if (current && index >= 0 && index < current.length) {
      const choice = current[index];
      const added = this.run.addBoon(choice.id);
      if (added) {
        this.toast(`${added.name} — ${added.desc}`, added.icon);
        this.fx.spawn('level_up', this.player.x, this.player.y - 10, { scale: 1 });
      }
      this.emitHud();
    }
    const shrine = this.pendingBoonShrine;
    if (shrine) {
      shrine.consume();
      this.refreshMinimapIcon(this.roomOfPoint(shrine.x, shrine.y), null);
    }
    this.boonOpen = false;
    this.pendingBoonChoices = null;
    this.pendingBoonShrine = null;
    if (this.state === 'paused') this.resumeGame();
  }

  /* ------------------------------------------------------------------ */
  /* F3 debug overlay                                                    */
  /* ------------------------------------------------------------------ */

  /** Development overlay (F3): bodies, the live melee sector, projectile
      sweeps and enemy windup warning areas, so combat timing can be
      compared against the sprite, sound and effect on the same frame. */
  private drawDebugOverlay(gfx: Phaser.GameObjects.Graphics): void {
    gfx.clear();
    /* player body + feet */
    gfx.lineStyle(1, 0x65d9d0);
    gfx.strokeCircle(this.player.x, this.player.y, this.player.radius);
    gfx.strokeRect(this.player.x - 11, this.player.y - 7, 22, 14);

    /* enemy bodies */
    gfx.lineStyle(1, 0xd95252);
    for (const e of this.enemies) if (e.activated && !e.dead) gfx.strokeCircle(e.x, e.y, e.radius);

    /* projectile bodies + the swept capsule for this frame's travel */
    for (const p of this.projectiles) {
      gfx.lineStyle(1, 0xd9ad62, 0.85);
      gfx.lineBetween(p.sweptFromX, p.sweptFromY, p.x, p.y);
      gfx.strokeCircle(p.sweptFromX, p.sweptFromY, p.radius);
      gfx.strokeCircle(p.x, p.y, p.radius);
    }

    /* sealed gate tiles (barriers block movement and line of sight) */
    gfx.lineStyle(1, 0x9868e8, 0.9);
    for (const tile of this.sealedTiles) {
      gfx.strokeRect((tile % this.dungeon.width) * TILE, Math.floor(tile / this.dungeon.width) * TILE, TILE, TILE);
    }

    /* melee sector: gold while winding up (where the swing would lock),
       red while live (the locked arc), dim during recovery */
    const melee = this.player.debugMelee();
    if (melee) {
      const half = melee.arcRad / 2;
      const a0 = melee.angle - half;
      const a1 = melee.angle + half;
      const color = melee.phase === 'windup' ? 0xd9ad62 : melee.phase === 'active' ? 0xd95252 : 0x65d9d0;
      const alpha = melee.phase === 'active' ? 0.22 : melee.phase === 'windup' ? 0.1 : 0.05;
      const y = this.player.y - 8;
      gfx.fillStyle(color, alpha);
      gfx.slice(this.player.x, y, melee.reach, a0, a1, false);
      gfx.fillPath();
      gfx.lineStyle(1, color, 0.85);
      gfx.slice(this.player.x, y, melee.reach, a0, a1, false);
      gfx.strokePath();
      if (melee.remainingMs > 0) {
        gfx.lineStyle(2, color, 0.9);
        gfx.beginPath();
        gfx.arc(this.player.x, this.player.y, melee.reach + 6, melee.angle, melee.angle + half * 2, false);
        gfx.strokePath();
      }
    }

    /* enemy windup warning areas + a progress ring for the remaining windup */
    for (const e of this.enemies) {
      if (!e.activated || e.dead) continue;
      const t: TelegraphDebug | null = e.debugTelegraph();
      if (!t) continue;
      if (t.kind === 'lunge' || t.kind === 'aim') {
        gfx.lineStyle(3, 0xd95252, 0.3);
        gfx.lineBetween(t.x, t.y - 8, t.tx, t.ty - 8);
      }
      gfx.fillStyle(0xd95252, 0.14);
      gfx.fillCircle(t.tx, t.ty - 8, t.radius);
      gfx.lineStyle(1, 0xd95252, 0.75);
      gfx.strokeCircle(t.tx, t.ty - 8, t.radius);
      const total = Math.max(1, t.endsAt - t.startedAt);
      const progress = Math.min(1, Math.max(0, (this.now - t.startedAt) / total));
      gfx.lineStyle(2, 0xe8dcc9, 0.9);
      gfx.beginPath();
      gfx.arc(t.tx, t.ty - 8, t.radius + 5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, false);
      gfx.strokePath();
    }
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'running' || !this.dungeon) {
      if (this.bossRef && !this.bossRef.alive) this.bossRef = null;
      return;
    }
    /* hit-stop freeze */
    if (_time < this.fx.hitstopUntil) return;

    const dt = Math.min(delta, 50);
    this.now += dt;
    this.run.timeMs += dt;
    const intro = this.now < this.bossIntroUntil;

    /* player input */
    if (!intro) {
      this.player.moveX = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
      this.player.moveY = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);
      const pointer = this.input.activePointer;
      pointer.updateWorldPoint(this.cameras.main);
      this.player.aimX = pointer.worldX;
      this.player.aimY = pointer.worldY;
    } else {
      this.player.moveX = 0;
      this.player.moveY = 0;
    }

    this.player.update(dt);

    /* enemies: activated ones tick fully */
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!e.activated) continue;
      e.update(dt);
    }
    /* compact corpses in place (swap-free write index) instead of allocating
       a fresh filtered array every frame */
    {
      let w = 0;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead && e.sprite.alpha <= 0.01) {
          e.destroy();
        } else {
          this.enemies[w++] = e;
        }
      }
      this.enemies.length = w;
    }

    /* boss / champion bar emission (throttled) */
    this.bossEmitTimer -= dt;
    if (this.bossEmitTimer <= 0 && (this.bossRef?.alive || this.championRef?.alive)) {
      this.bossEmitTimer = 180;
      this.emitBossState();
    }
    if (this.bossRef && !this.bossRef.alive) this.bossRef = null;
    if (this.championRef && !this.championRef.alive) {
      this.championRef = null;
      bus.emit('boss', null);
    }

    /* projectiles */
    for (const p of this.projectiles) p.update(dt);
    {
      let w = 0;
      for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        if (!p.dead) this.projectiles[w++] = p;
      }
      this.projectiles.length = w;
    }

    /* redraw the F3 overlay once entities have settled this frame */
    if (this.debugHitboxes) this.drawDebugOverlay(this.debugHitboxes);

    /* pickups */
    for (const p of this.pickups) p.update(dt);
    {
      let w = 0;
      for (let i = 0; i < this.pickups.length; i++) {
        const p = this.pickups[i];
        if (!p.collected) this.pickups[w++] = p;
      }
      this.pickups.length = w;
    }

    /* room tracking */
    const rid = this.roomOfPlayer();
    if (rid !== this.currentRoomId && rid >= 0) this.enterRoom(rid);

    /* interaction prompt */
    this.updatePrompt();

    /* death check */
    if (this.player.dying && this.state === 'running') {
      this.state = 'over';
      this.time.delayedCall(1500, () => this.finishRun(false));
      return;
    }

    /* level-up queue */
    if (!intro && this.run.pendingLevelUps > 0 && !this.levelupOpen && !this.boonOpen) {
      this.openLevelUp();
    }

    /* HUD + minimap emission */
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 100;
      this.emitHud();
    }
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 180;
      this.emitMinimap();
    }
  }

  private updatePrompt(): void {
    let best: Interactable | null = null;
    let bestD2 = PLAYER_BASE.interactRadius * PLAYER_BASE.interactRadius;
    for (const it of this.interactables) {
      if (!it.active) continue;
      const dx = it.x - this.player.x;
      const dy = it.y - this.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2 && this.player.lineOfSightFrom(it.x, it.y)) {
        bestD2 = d2;
        best = it;
      }
    }
    const text = best ? best.prompt : null;
    if (text !== this.promptText) {
      this.promptText = text;
      bus.emit('prompt', text ? { text } : null);
    }
    (this as GameScene & { nearestInteractable?: Interactable | null }).nearestInteractable = best;
  }

  private tryInteract(): void {
    const best = (this as GameScene & { nearestInteractable?: Interactable | null }).nearestInteractable;
    if (best && best.active) best.interact();
  }

  wirePortal(portal: Portal): void {
    portal.interact = () => {
      if (this.state !== 'running') return;
      portal.active = false;
      if (this.run.floor >= MAX_FLOOR) {
        this.state = 'over';
        this.finishRun(true);
      } else {
        this.descend();
      }
    };
  }

  private descend(): void {
    if (this.state !== 'running') return;
    this.state = 'transition';
    this.play('doorOpen');
    const cam = this.cameras.main;
    cam.fadeOut(550, 0, 0, 0);
    this.time.delayedCall(600, () => {
      this.run.hp = Math.max(1, this.player.hp);
      this.run.mana = this.player.mana;
      this.startFloor(this.run.floor + 1);
    });
  }

  private finishRun(victory: boolean): void {
    this.state = 'over';
    const stats: RunStats = {
      seed: this.run.seed,
      floor: this.run.floor,
      level: this.run.level,
      gold: this.run.gold,
      kills: this.run.kills,
      timeMs: this.run.timeMs,
      victory,
      relics: this.run.relics.map((r) => ({ id: r.id, name: r.name, desc: r.desc, icon: r.icon })),
      boons: this.run.boons.map((b) => ({ id: b.id, name: b.name, desc: b.desc, icon: b.icon, patron: b.patron, rarity: b.rarity })),
      upgrades: Array.from(this.run.upgrades.entries()).map(([id, stacks]) => ({
        id,
        name: UPGRADES.find((u) => u.id === id)?.name ?? id,
        stacks,
      })),
      souls: this.run.souls,
      shards: this.run.shardReward,
      pacts: this.run.pacts.slice(),
    };
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
    this.refreshSaveInfo();
    if (victory) {
      this.play('victory');
      bus.emit('victory', stats);
    } else {
      bus.emit('gameover', stats);
    }
    gameAudio.setMusicMode('menu');
  }

  /* ------------------------------------------------------------------ */
  /* level-up                                                            */
  /* ------------------------------------------------------------------ */

  private openLevelUp(): void {
    const pool = availableUpgrades(this.run);
    if (pool.length === 0) {
      /* everything maxed: mend instead */
      this.run.pendingLevelUps = 0;
      this.player.heal(this.run.stats.maxHp * 0.5);
      this.toast('The dark grants pure vigor', '/assets/icons/relic_shield.png');
      return;
    }
    this.levelupOpen = true;
    const rng = new Rng(this.run.seed ^ (this.run.level - this.run.pendingLevelUps));
    const choices: UpgradeChoice[] = rng
      .shuffle(pool)
      .slice(0, Math.min(3, pool.length))
      .map((u) => ({ id: u.id, name: u.name, desc: u.desc, icon: u.icon, stacks: this.run.stacks(u.id), maxStacks: u.maxStacks }));
    this.pendingChoices = choices;
    this.play('levelup');
    this.fx.spawn('level_up', this.player.x, this.player.y - 10, { scale: 1.1 });
    this.emitHud();
    bus.emit('levelup', { level: this.run.level, choices });
    /* NOTE: emit the modal even if a shop/inventory pause is already open;
       otherwise the run would soft-lock with levelupOpen stuck true. */
    this.pauseGame('levelup');
  }

  private chooseUpgrade(index: number): void {
    if (!this.levelupOpen) return;
    const current = this.pendingChoices;
    if (current && index >= 0 && index < current.length) {
      this.run.hp = this.player.hp;
      this.run.mana = this.player.mana;
      this.run.addUpgrade(current[index].id);
      this.player.hp = this.run.hp;
      this.player.mana = this.run.mana;
      this.run.pendingLevelUps--;
      this.toast(`${current[index].name} accepted`, current[index].icon);
      this.emitHud();
    }
    this.levelupOpen = false;
    this.pendingChoices = null;
    if (this.run.pendingLevelUps > 0) {
      this.openLevelUp();
    } else if (this.state === 'paused' && !this.boonOpen) {
      this.resumeGame();
    }
  }

  private pendingChoices: UpgradeChoice[] | null = null;

  /* ------------------------------------------------------------------ */
  /* HUD + minimap                                                       */
  /* ------------------------------------------------------------------ */

  private emitHud(): void {
    if (!this.player || !this.run) return;
    /* rebuild the mapped relic/boon lists only when one was gained */
    if (this.hudRelics.length !== this.run.relics.length) {
      this.hudRelics = this.run.relics.map((r) => ({ id: r.id, name: r.name, desc: r.desc, icon: r.icon }));
    }
    if (this.hudBoons.length !== this.run.boons.length) {
      this.hudBoons = this.run.boons.map((b) => ({ id: b.id, name: b.name, desc: b.desc, icon: b.icon, patron: b.patron, rarity: b.rarity }));
    }
    const room = this.dungeon.rooms[this.currentRoomId];
    const enemiesLeft = this.sealedTiles.size ? this.enemies.reduce((n, e) =>
      n + Number(e.alive && e.roomId === this.currentRoomId), 0) : 0;
    const hud: HudState = {
      boltCharge: this.player.boltCharge,
      objective: enemiesLeft ? `Clear the chamber · ${enemiesLeft} remain` :
        room?.type === 'rest' ? 'Touch the healing shrine' :
        this.run.floor < MAX_FLOOR ? 'Find the descent' :
        this.dungeon.rooms[this.dungeon.bossRoom].cleared ? 'Enter the seal' : 'Find the Fallen Necromancer',
      hp: this.player.hp,
      maxHp: this.run.stats.maxHp,
      mana: this.player.mana,
      maxMana: this.run.stats.maxMana,
      level: this.run.level,
      xp: this.run.xp,
      xpNeed: this.run.xpNeed,
      gold: this.run.gold,
      floor: this.run.floor,
      maxFloor: MAX_FLOOR,
      floorName: FLOORS[Math.min(this.run.floor, FLOORS.length) - 1].name,
      potions: { ...this.run.potions },
      cooldowns: this.player.cooldownFractions(),
      relics: this.hudRelics,
      boons: this.hudBoons,
      souls: this.run.souls,
      pactCount: this.run.pacts.length,
    };
    bus.emit('hud', hud);
  }

  private emitMinimap(): void {
    if (!this.dungeon || !this.player) return;
    /* fingerprint the room state: discovery flags, clear flags and the
     current-room marker are the only things that ever change after a floor
     is generated. A matching fingerprint means the cached room/corridor
     arrays (and their identities) can be reused as-is. */
    let fp = this.currentRoomId;
    for (const r of this.dungeon.rooms) {
      fp = (Math.imul(fp, 31) + Number(r.discovered) + 2 * Number(r.cleared) +
        4 * ([null, 'merchant', 'champion', 'boon', 'shrine'].indexOf(r.icon ?? null) + 1)) | 0;
    }
    if (fp !== this.minimapFp || this.minimapFloorFor !== this.dungeon) {
      this.minimapFp = fp;
      this.minimapFloorFor = this.dungeon;
      this.minimapRooms = this.dungeon.rooms.map((r) => ({
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        type: r.type,
        discovered: r.discovered,
        cleared: r.cleared,
        current: r.id === this.currentRoomId,
        icon: r.icon ?? null,
        lockedTiles: r.gates.flatMap((gate) => gate.tiles.filter((t) => this.sealedTiles.has(t.y * this.dungeon.width + t.x))),
      }));
      this.minimapCorridors = this.dungeon.corridors.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, roomA: c.roomA, roomB: c.roomB }));
    }
    const data: MinimapData = {
      rooms: this.minimapRooms,
      corridors: this.minimapCorridors,
      player: { x: this.player.x / TILE, y: this.player.y / TILE, heading: this.player.aimAngle },
      width: this.dungeon.width,
      height: this.dungeon.height,
    };
    bus.emit('minimap', data);
  }

  /* ------------------------------------------------------------------ */
  /* persistence                                                         */
  /* ------------------------------------------------------------------ */

  private persistSave(): void {
    if (!this.run) return;
    this.run.hp = Math.max(1, this.player?.hp ?? this.run.hp);
    this.run.mana = this.player?.mana ?? this.run.mana;
    const data = this.run.toSave();
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable */
    }
    this.refreshSaveInfo();
  }

  private readSave(): SaveData | null {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return parseSave(raw);
    } catch {
      return null;
    }
  }

  private refreshSaveInfo(): void {
    const data = this.readSave();
    if (data) {
      bus.emit('save:exists', { exists: true, info: { seed: data.seed, floor: data.floor, level: data.level, gold: data.gold, timeMs: data.timeMs } });
    } else {
      bus.emit('save:exists', { exists: false });
    }
  }

  /* ------------------------------------------------------------------ */
  /* camera / resize                                                     */
  /* ------------------------------------------------------------------ */

  private applyZoom(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    /* snapped to quarter steps to avoid subpixel tile seams */
    const zoom = Phaser.Math.Clamp(Math.round((Math.min(w, h) / 380) * 4) / 4, 2, 3.2);
    this.cameras.main.setZoom(zoom);
  }

  private handleResize(): void {
    this.applyZoom();
  }
}
