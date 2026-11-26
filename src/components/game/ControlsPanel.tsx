'use client';

import { useGameStore } from '@/lib/gameStore';
import { CONTROLS } from '@/game/config';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';

export default function ControlsPanel() {
  const closePanel = useGameStore((s) => s.closePanel);
  return (
    <DialogShell label="Controls" onEsc={closePanel} z="z-50">
      <div className="rb-panel relative w-[min(430px,92vw)] p-7">
        <Corners />
        <h2 className="text-center font-display text-2xl font-bold tracking-[0.28em] text-[var(--bone)]">CONTROLS</h2>
        <GoldRule className="mx-auto mt-3" />

        <dl className="rb-scroll mt-5 grid max-h-[46vh] grid-cols-1 gap-1 overflow-y-auto pr-1">
          {CONTROLS.map((row) => (
            <div key={row.keys} className="flex items-center justify-between gap-4 border-b border-[rgba(217,173,98,0.12)] py-2 last:border-b-0">
              <dt>
                {row.keys.split(' ').map((k, i) => (
                  <kbd key={i} className="rb-keycap mr-1 last:mr-0">
                    {k === 'SPC' ? 'SPACE' : k}
                  </kbd>
                ))}
              </dt>
              <dd className="font-body text-sm text-[#b7ab97]">{row.action}</dd>
            </div>
          ))}
        </dl>

        <button type="button" className="rb-btn rb-btn-primary mt-6" autoFocus onClick={() => { uiClick(); closePanel(); }}>
          Back
        </button>
      </div>
    </DialogShell>
  );
}
