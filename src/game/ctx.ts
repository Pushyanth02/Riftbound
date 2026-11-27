/* GameContext: the slice of GameScene that entities interact with.
   Extends Phaser.Scene so entities can use add/time/tweens directly -
   GameScene (which extends Phaser.Scene) satisfies it naturally. */
import type * as Phaser from 'phaser';
import type { FxSystem } from './fx';
import type { Dungeon } from './dungeon/generator';
import type { RunState } from './run';
import type { Player } from './entities/player';
import type { Enemy } from './entities/enemy';
import type { GridWorld } from './entities/base';
import type { RelicDef } from './config';

export interface ProjectileSpawn {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  kind: 'fireball' | 'bolt' | 'shadowBolt' | 'bossBolt';
  owner: 'player' | 'enemy';
  radius?: number;
  splashRadius?: number;
  splashDamage?: number;
  burn?: { dps: number; ms: number };
  pierce?: number;
}

export interface GameContext extends Phaser.Scene, GridWorld {
  fx: FxSystem;
  run: RunState;
  dungeon: Dungeon;
  player: Player;
  enemies: Enemy[];
  now: number;
  reducedFx: boolean;
  spawnProjectile(spawn: ProjectileSpawn): void;
  spawnPickup(kind: 'coin' | 'heart' | 'mana' | 'gem' | 'potion-h' | 'potion-m' | 'soul', x: number, y: number, value?: number): void;
  summonEcho?(x: number, y: number): void;
  /** generic minion summon honoring the room-local enemy cap */
  summonEnemy?(kind: import('./config').EnemyKind, x: number, y: number): void;
  onPortalEntered?(): void;
  onMerchantOpened?(): void;
  onBoonShrineOpened?(shrine: import('./entities/objects').BoonShrine): void;
  /** a chest was opened: the map marker for its room is consumed */
  onRoomLooted?(roomId: number): void;
  addXp(amount: number): void;
  onEnemyKilled(enemy: Enemy): void;
  toast(text: string, icon?: string): void;
  grantRelic(def: RelicDef): void;
  play(cue: string): void;
  /** boon hook: critical strikes arc to a nearby enemy */
  chainLightning(fromX: number, fromY: number, damage: number, exclude: Enemy): void;
  /** boon hook: critical strikes detonate an ember burst */
  critBlast(x: number, y: number, damage: number): void;
  /** boon hook: room icons refresh after dynamic content is placed */
  refreshMinimapIcon(roomId: number, icon: 'merchant' | 'champion' | 'boon' | 'shrine' | 'challenge' | 'trap' | 'secret' | 'chest' | null): void;
  /** boss/champion bar re-emits immediately (phase transitions) */
  refreshBossBar?(): void;
  /** secret doors: flip walkable topology when a cracked wall breaks */
  openSecretDoor?(doorId: number): void;
}
