'use client';

/* GameShell: mounts the Phaser canvas host and layers every UI overlay
   on top of it, driven entirely by the zustand mirror of game state. */

import { useCallback, useEffect, useRef } from 'react';
import { initBusBridge, useGameStore } from '@/lib/gameStore';
import { gameAudio } from '@/game/audio';
import { cn } from '@/lib/utils';
import MainMenu from './MainMenu';
import LoadingScreen from './LoadingScreen';
import Hud from './Hud';
import PauseMenu from './PauseMenu';
import SettingsPanel from './SettingsPanel';
import ControlsPanel from './ControlsPanel';
import CreditsPanel from './CreditsPanel';
import LevelUpModal from './LevelUpModal';
import BoonModal from './BoonModal';
import PactPanel from './PactPanel';
import InventoryPanel from './InventoryPanel';
import ShopPanel from './ShopPanel';
import DeathScreen from './DeathScreen';
import VictoryScreen from './VictoryScreen';

export default function GameShell() {
  const parentRef = useRef<HTMLDivElement>(null);
  const ui = useGameStore((s) => s.ui);
  const panelReturn = useGameStore((s) => s.panelReturn);
  /* subscribe to a boolean, not the hud object: the hud payload is rebuilt
     on a 100 ms cadence, and selecting it wholesale would re-render this
     entire tree (every overlay) ten times a second for the whole run */
  const hasHud = useGameStore((s) => s.hud !== null);
  const reducedFx = useGameStore((s) => s.settings.reducedFx);

  useEffect(() => {
    initBusBridge();
  }, []);

  /* Boot the Phaser game. The game layer is loaded through a separate
     module so a missing/unavailable engine never takes the UI down.
     The boot promise is tracked so a late resolution after unmount is
     destroyed immediately (prevents leaked game instances on HMR). */
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    import('./gameBoot')
      .then((boot) => boot.bootGame(parentRef.current ?? document.createElement('div')))
      .then((destroyFn) => {
        if (cancelled) {
          /* component unmounted while booting: tear the game down at once */
          try {
            destroyFn?.();
          } catch {
            /* teardown is best-effort */
          }
          return;
        }
        if (destroyFn) destroy = destroyFn;
      })
      .catch(() => {
        /* game layer unavailable - menus and panels remain usable */
      });
    return () => {
      cancelled = true;
      try {
        destroy?.();
      } catch {
        /* teardown is best-effort */
      }
    };
  }, []);

  /* Browsers only allow audio after a user gesture; unlock on the first
     pointer interaction anywhere, applying the persisted mix. */
  const handleUnlock = useCallback(() => {
    gameAudio.unlock();
    const { master, music, sfx } = useGameStore.getState().settings;
    gameAudio.setVolumes(master, music, sfx);
  }, []);

  const isInfoPanel = ui === 'settings' || ui === 'controls' || ui === 'credits';
  const hudVisible =
    hasHud &&
    (ui === 'playing' ||
      ui === 'paused' ||
      ui === 'levelup' ||
      ui === 'boon' ||
      ui === 'inventory' ||
      ui === 'shop' ||
      (isInfoPanel && panelReturn === 'paused'));

  return (
    <div
      className={cn(
        'rb-atmosphere relative h-dvh w-full cursor-default select-none overflow-hidden',
        reducedFx && 'reduced-fx',
      )}
      onPointerDown={handleUnlock}
      onClick={handleUnlock}
    >
      {/* Phaser canvas host */}
      <div ref={parentRef} className="absolute inset-0 z-0" aria-hidden="true" />
      {/* Atmospheric overlays above the canvas, below the HUD */}
      <div aria-hidden="true" className="rb-grain pointer-events-none absolute inset-0 z-[4]" />
      <div aria-hidden="true" className="rb-vignette pointer-events-none absolute inset-0 z-[5]" />

      {hudVisible && <Hud />}
      {ui === 'pacts' && <PactPanel />}
      {ui === 'paused' && <PauseMenu />}
      {ui === 'levelup' && <LevelUpModal />}
      {ui === 'boon' && <BoonModal />}
      {ui === 'inventory' && <InventoryPanel />}
      {ui === 'shop' && <ShopPanel />}
      {ui === 'settings' && <SettingsPanel />}
      {ui === 'controls' && <ControlsPanel />}
      {ui === 'credits' && <CreditsPanel />}
      {ui === 'dead' && <DeathScreen />}
      {ui === 'victory' && <VictoryScreen />}
      {ui === 'menu' && <MainMenu />}
      {ui === 'loading' && <LoadingScreen />}
    </div>
  );
}
