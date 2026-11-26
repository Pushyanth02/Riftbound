/* createGame: client-side Phaser bootstrap used by the React shell. */
import type * as Phaser from 'phaser';

export type DestroyGame = () => void;

export async function createGame(parent: HTMLElement): Promise<DestroyGame> {
  const Phaser = await import('phaser');
  const { BootScene } = await import('./scenes/boot');
  const { GameScene } = await import('./scenes/game');

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0e0a14',
    pixelArt: true,
    roundPixels: true,
    /* ask the browser for the fast GPU when the machine has a choice
       (laptops with integrated + discrete adapters) */
    render: { powerPreference: 'high-performance' },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
    },
    scene: [BootScene, GameScene],
  });

  /* debug/QA handle (development aid, harmless in production) */
  (window as unknown as { __riftbound?: unknown }).__riftbound = game;

  return () => {
    game.destroy(true);
  };
}
