'use client';

import { useGameStore } from '@/lib/gameStore';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';

const CREDITS: { section: string; lines: string[] }[] = [
  {
    section: 'Art',
    lines: [
      'Tiny RPG Character Packs 01 & 02 — Zerie',
      'Epic RPG World Pack: Ancient Ruins — Rafael Matos',
      'Raven Fantasy Icons — ClockworkRaven',
      'PVFX Foundry — nerijs (CC0)',
      '750 Effect & FX Pixel — BDragon1727',
    ],
  },
  {
    section: 'Engine',
    lines: ['Phaser 3 — Photon Storm'],
  },
  {
    section: 'Audio',
    lines: ['Original synthesis — Web Audio API'],
  },
];

export default function CreditsPanel() {
  const closePanel = useGameStore((s) => s.closePanel);
  return (
    <DialogShell label="Credits" onEsc={closePanel} z="z-50">
      <div className="rb-panel relative w-[min(470px,92vw)] p-7">
        <Corners />
        <h2 className="text-center font-display text-2xl font-bold tracking-[0.24em] text-[var(--bone)]">CREDITS</h2>
        <p className="mt-1 text-center font-body text-xs italic text-[#a89dbd]">Riftbound: Echoes of the Fallen</p>
        <GoldRule className="mx-auto mt-3" />

        <div className="rb-scroll mt-5 max-h-[48vh] overflow-y-auto pr-1">
          {CREDITS.map((group) => (
            <section key={group.section} className="mb-5 last:mb-0">
              <h3 className="rb-smallcaps mb-2 text-[10px] text-[var(--gold)]">{group.section}</h3>
              <ul className="flex flex-col gap-1.5">
                {group.lines.map((line) => (
                  <li key={line} className="font-body text-sm text-[#b7ab97]">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="border-t border-[rgba(217,173,98,0.18)] pt-4 font-body text-xs italic leading-relaxed text-[#8d8398]">
            All art assets are free or demo packs from itch.io. Support the artists.
          </p>
        </div>

        <button type="button" className="rb-btn rb-btn-primary mt-6" autoFocus onClick={() => { uiClick(); closePanel(); }}>
          Back
        </button>
      </div>
    </DialogShell>
  );
}
