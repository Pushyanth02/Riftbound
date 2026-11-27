'use client';

/* Chamber reward choice (phase 4): offered after each combat room clears.
   Recovery, currency or a build upgrade - each with its concrete payoff
   previewed before selection. Fully keyboard-driven (arrows, numbers,
   Enter) so the golden path never needs the mouse. */

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { assetPath } from '@/lib/assetPath';
import { uiClick } from './shared';
import { Corners, GoldRule, Keycap } from './shared';
import { cn } from '@/lib/utils';
import type { ChamberChoice } from '@/game/types';

const KIND_LABEL: Record<ChamberChoice['kind'], string> = {
  recovery: 'Recovery',
  bounty: 'Currency',
  build: 'Build',
};

export default function ChamberChoicePanel() {
  const chamber = useGameStore((s) => s.chamber);
  const cmdChamber = useGameStore((s) => s.cmdChamber);
  const [focused, setFocused] = useState(0);

  const choices = chamber?.choices ?? [];

  useEffect(() => {
    if (choices.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const numeric = ['1', '2', '3'].indexOf(e.key);
      if (numeric >= 0 && numeric < choices.length) {
        e.preventDefault();
        uiClick();
        cmdChamber(numeric);
        return;
      }
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          setFocused((f) => (f + 1) % choices.length);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          setFocused((f) => (f - 1 + choices.length) % choices.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          uiClick();
          cmdChamber(focused);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [choices.length, focused, cmdChamber]);

  if (choices.length === 0) return null;

  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-[rgba(10,7,15,0.78)] p-4" role="dialog" aria-modal="true" aria-label="Chamber reward">
      <div className="w-[min(860px,96vw)]">
        <div className="text-center">
          <p className="rb-smallcaps text-xs text-[var(--gold)]">The chamber yields</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[0.2em] text-[var(--bone)]">
            TAKE ONE
          </h2>
          <GoldRule className="mx-auto mt-3" />
          <p className="mt-2 font-body text-sm italic text-[#a89dbd]">Claim what the dead left behind</p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {choices.map((choice, i) => (
            <button
              key={choice.id}
              type="button"
              autoFocus={i === focused}
              onMouseEnter={() => setFocused(i)}
              onFocus={() => setFocused(i)}
              onClick={() => { uiClick(); cmdChamber(i); }}
              aria-label={`${KIND_LABEL[choice.kind]}: ${choice.name}. ${choice.preview}`}
              className={cn(
                'rb-card-sweep group relative flex flex-col items-center gap-3 border p-6 text-center transition-[border-color,transform] duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]',
                i === focused
                  ? '-translate-y-1 border-[var(--gold)] bg-[rgba(28,22,41,0.98)]'
                  : 'border-[rgba(217,173,98,0.4)] bg-[rgba(28,22,41,0.96)] hover:-translate-y-1 hover:border-[var(--gold)]',
              )}
            >
              <Corners />
              <span className="rb-smallcaps text-[10px] text-[#8d8398]">{KIND_LABEL[choice.kind]}</span>
              <img src={assetPath(choice.icon)} alt="" className="pixelated h-16 w-16" draggable={false} />
              <h3 className="font-display text-base font-bold tracking-[0.1em] text-[var(--bone)]">{choice.name}</h3>
              <p className="min-h-[40px] font-body text-[13px] leading-snug text-[#b7ab97]">{choice.desc}</p>
              {/* the concrete payoff preview: stat delta or conditional effect */}
              <span className="border border-[rgba(217,173,98,0.35)] bg-[rgba(20,16,30,0.8)] px-2.5 py-1 font-body text-xs font-semibold tabular-nums text-[var(--gold)]">
                {choice.preview}
              </span>
              <Keycap className="mt-1">{i + 1}</Keycap>
            </button>
          ))}
        </div>

        <p className="mt-4 text-center font-body text-[11px] text-[#8d8398]">
          Arrow keys to inspect · Enter or number keys to claim
        </p>
      </div>
    </div>
  );
}
