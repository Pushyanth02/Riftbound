/* Minimal typed event bus connecting the Phaser game and the React UI.
   Commands are queued until the game scene marks itself ready, so a
   "start" click during the (slow) first compile/load is never lost. */
import type { BusCommands, BusEventKey, BusEvents } from './types';

type Handler<K extends BusEventKey | 'cmd'> = K extends BusEventKey
  ? (payload: BusEvents[K]) => void
  : (payload: BusCommands['cmd']) => void;

const MAX_QUEUED_COMMANDS = 8;

class TypedBus {
  private handlers = new Map<string, Set<(p: unknown) => void>>();
  /** true once the GameScene registered its command listener */
  private ready = false;
  /** commands emitted before the game was ready (flushed on markReady) */
  private pending: BusCommands['cmd'][] = [];

  on<K extends BusEventKey | 'cmd'>(key: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(key as string);
    if (!set) {
      set = new Set();
      this.handlers.set(key as string, set);
    }
    set.add(fn as (p: unknown) => void);
    return () => this.off(key as string, fn as (p: unknown) => void);
  }

  off(key: string, fn: (p: unknown) => void): void {
    this.handlers.get(key)?.delete(fn);
  }

  emit<K extends BusEventKey>(key: K, payload: BusEvents[K]): void {
    const set = this.handlers.get(key as string);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  command(cmd: BusCommands['cmd']): void {
    if (!this.ready) {
      /* keep the most recent intent only if the queue overflows */
      if (this.pending.length >= MAX_QUEUED_COMMANDS) this.pending.shift();
      this.pending.push(cmd);
      return;
    }
    this.dispatch(cmd);
  }

  private dispatch(cmd: BusCommands['cmd']): void {
    const set = this.handlers.get('cmd');
    if (!set) return;
    for (const fn of set) fn(cmd);
  }

  /** Called by GameScene.create() once the command listener is attached. */
  markReady(): void {
    this.ready = true;
    if (this.pending.length > 0) {
      const queued = this.pending.splice(0);
      for (const cmd of queued) this.dispatch(cmd);
    }
  }

  /** Called when the game scene shuts down or the game is destroyed. */
  markUnready(): void {
    this.ready = false;
    this.pending = [];
  }

  get isReady(): boolean {
    return this.ready;
  }

  clear(): void {
    this.handlers.clear();
    this.ready = false;
    this.pending = [];
  }
}

/** Global singleton - imported by both the game and the UI. */
export const bus = new TypedBus();
