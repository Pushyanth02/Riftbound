'use client';

import { useGameStore } from '@/lib/gameStore';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';

export default function PauseMenu() {
  const hud = useGameStore((s) => s.hud);
  const cmdResume = useGameStore((s) => s.cmdResume);
  const cmdQuit = useGameStore((s) => s.cmdQuit);
  const cmdInventory = useGameStore((s) => s.cmdInventory);
  const openPanel = useGameStore((s) => s.openPanel);

  return (
    <DialogShell label="Paused" onEsc={cmdResume} z="z-40" backdrop="bg-[rgba(10,7,15,0.66)] backdrop-blur-[6px]">
      <div className="rb-panel relative w-[min(380px,92vw)] p-7">
        <Corners />
        <h2 className="text-center font-display text-2xl font-bold tracking-[0.3em] text-[var(--bone)]">PAUSED</h2>
        <GoldRule className="mx-auto mt-3" />

        {hud && (
          <div className="rb-card mt-5 grid grid-cols-3 gap-px text-center">
            <div className="p-2">
              <p className="rb-smallcaps text-[9px] text-[#8d8398]">Floor</p>
              <p className="font-display text-lg font-bold text-[var(--bone)]">{hud.floor}</p>
            </div>
            <div className="p-2">
              <p className="rb-smallcaps text-[9px] text-[#8d8398]">Level</p>
              <p className="font-display text-lg font-bold text-[var(--bone)]">{hud.level}</p>
            </div>
            <div className="p-2">
              <p className="rb-smallcaps text-[9px] text-[#8d8398]">Gold</p>
              <p className="font-display text-lg font-bold text-[var(--gold)]">{hud.gold}</p>
            </div>
          </div>
        )}

        <nav className="mt-6 flex flex-col gap-2.5" aria-label="Pause menu">
          <button type="button" className="rb-btn rb-btn-primary" autoFocus onClick={() => { uiClick(); cmdResume(); }}>
            Resume
          </button>
          <button type="button" className="rb-btn" onClick={() => { uiClick(); cmdInventory(true); }}>
            Inventory
          </button>
          <button type="button" className="rb-btn" onClick={() => { uiClick(); openPanel('settings'); }}>
            Settings
          </button>
          <button type="button" className="rb-btn" onClick={() => { uiClick(); openPanel('controls'); }}>
            Controls
          </button>
          <button type="button" className="rb-btn rb-btn-danger mt-1" onClick={() => { uiClick(); cmdQuit(); }}>
            Quit to Menu
          </button>
        </nav>
      </div>
    </DialogShell>
  );
}
