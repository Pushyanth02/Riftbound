'use client';

/* Patron boon offer: presented at boon shrines when a patron takes
   interest in the descent. Modeled on the level-up choice modal. */

import { useEffect } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { assetPath } from '@/lib/assetPath';
import { PATRONS } from '@/game/config';
import { uiClick } from './shared';
import { Corners, GoldRule, Keycap } from './shared';
import type { BoonRarity } from '@/game/types';

/** Rarity display shared with the inventory list. */
export const BOON_RARITY: Record<BoonRarity, { label: string; color: string }> = {
  common: { label: 'Common', color: '#b7ab97' },
  rare: { label: 'Rare', color: '#65d9d0' },
  epic: { label: 'Epic', color: '#d9ad62' },
};

export default function BoonModal() {
  const boon = useGameStore((s) => s.boon);
  const cmdBoon = useGameStore((s) => s.cmdBoon);

  useEffect(() => {
    if (!boon) return;
    const handler = (e: KeyboardEvent) => {
      const idx = ['1', '2', '3'].indexOf(e.key);
      if (idx >= 0 && idx < boon.choices.length) {
        e.preventDefault();
        uiClick();
        cmdBoon(idx);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [boon, cmdBoon]);

  if (!boon) return null;
  const patron = PATRONS[boon.patron];

  return (
    <div
      className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-[rgba(10,7,15,0.78)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Patron boon"
    >
      <div className="w-[min(860px,96vw)]">
        <div className="text-center">
          <p className="rb-smallcaps text-xs" style={{ color: patron.color }}>
            A GIFT FROM THE PATRON
          </p>
          <h2
            className="rb-title-glow mt-2 font-display text-3xl font-extrabold tracking-[0.2em] sm:text-4xl"
            style={{ color: patron.color }}
          >
            {patron.name}
          </h2>
          <GoldRule className="mx-auto mt-3" />
          <p className="mt-2 font-body text-sm italic text-[#a89dbd]">Take one offering, and be marked by it</p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {boon.choices.map((choice, i) => {
            const rarity = BOON_RARITY[choice.rarity];
            return (
              <button
                key={choice.id}
                type="button"
                autoFocus={i === 0}
                onClick={() => {
                  uiClick();
                  cmdBoon(i);
                }}
                style={{ borderTopWidth: 2, borderTopColor: patron.color }}
                className="rb-card-sweep group relative flex flex-col items-center gap-3 border border-[rgba(217,173,98,0.4)] bg-[rgba(28,22,41,0.96)] p-6 text-center transition-[border-color,transform] duration-200 hover:-translate-y-1 hover:border-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
              >
                <Corners />
                <img src={assetPath(choice.icon)} alt="" className="pixelated h-16 w-16" draggable={false} />
                <h3 className="font-display text-base font-bold tracking-[0.1em] text-[var(--bone)]">{choice.name}</h3>
                <span
                  className="rb-smallcaps text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: rarity.color }}
                >
                  {rarity.label}
                </span>
                <p className="min-h-[40px] font-body text-[13px] leading-snug text-[#b7ab97]">{choice.desc}</p>
                {choice.owned && (
                  <span className="rb-smallcaps border border-[rgba(217,173,98,0.35)] bg-[rgba(20,14,29,0.8)] px-2 py-0.5 text-[9px] text-[#a89dbd]">
                    Owned
                  </span>
                )}
                <Keycap className="mt-1">{i + 1}</Keycap>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
