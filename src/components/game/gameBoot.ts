'use client';

import { bus } from '@/game/bus';

export type DestroyGame = () => void;

export async function bootGame(parent: HTMLElement): Promise<DestroyGame | null> {
  try {
    const mod = await import('@/game/createGame');
    return await mod.createGame(parent);
  } catch (err) {
    /* surface engine failures to the UI instead of failing silently */
    const message = err instanceof Error ? err.message : 'The game engine failed to start.';
    bus.emit('boot:error', { message: `The engine failed to start: ${message}` });
    return null;
  }
}
