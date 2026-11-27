'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { assetPath } from '@/lib/assetPath';
import { uiClick } from './shared';
import { Corners, GoldRule, Keycap } from './shared';
import { cn } from '@/lib/utils';

export default function LevelUpModal() {
  const levelup = useGameStore((s) => s.levelup);
  const cmdUpgrade = useGameStore((s) => s.cmdUpgrade);

  useEffect(() => {
    if (!levelup) return;
    const handler = (e: KeyboardEvent) => {
      const idx = ['1', '2', '3'].indexOf(e.key);
      if (idx >= 0 && idx < levelup.choices.length) {
        e.preventDefault();
        uiClick();
        cmdUpgrade(idx);
        return;
      }
      /* arrow keys walk the cards, Enter takes the focused one */
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (dir !== 0) {
        e.preventDefault();
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
        const active = buttons.findIndex((b) => b === document.activeElement);
        if (buttons.length > 0) buttons[(active + dir + buttons.length) % buttons.length].focus();
        return;
      }
      if (e.key === 'Enter') {
        const active = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).findIndex((b) => b === document.activeElement);
        if (active >= 0 && active < levelup.choices.length) {
          e.preventDefault();
          uiClick();
          cmdUpgrade(active);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [levelup, cmdUpgrade]);

  if (!levelup) return null;

  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-[rgba(10,7,15,0.78)] p-4" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="w-[min(860px,96vw)]">
        <div className="text-center">
          <p className="rb-smallcaps text-xs text-[var(--gold)]">The dark offers its boons</p>
          <h2 className="mt-2 font-display text-4xl font-extrabold tracking-[0.2em] text-[var(--bone)]">
            LEVEL {levelup.level}
          </h2>
          <GoldRule className="mx-auto mt-3" />
          <p className="mt-2 font-body text-sm italic text-[#a89dbd]">Choose one</p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {levelup.choices.map((choice, i) => (
            <button
              key={choice.id}
              type="button"
              autoFocus={i === 0}
              onClick={() => { uiClick(); cmdUpgrade(i); }}
              className="rb-card-sweep group relative flex flex-col items-center gap-3 border border-[rgba(217,173,98,0.4)] bg-[rgba(28,22,41,0.96)] p-6 text-center transition-[border-color,transform] duration-200 hover:-translate-y-1 hover:border-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
            >
              <Corners />
              <img src={assetPath(choice.icon)} alt="" className="pixelated h-16 w-16" draggable={false} />
              <h3 className="font-display text-base font-bold tracking-[0.1em] text-[var(--bone)]">{choice.name}</h3>
              <p className="min-h-[40px] font-body text-[13px] leading-snug text-[#b7ab97]">{choice.desc}</p>

              <span className="text-xs text-[var(--gold)]">Rank {choice.stacks} → {choice.stacks + 1} / {choice.maxStacks}</span>
              <span className="flex items-center gap-1" aria-label={`Taken ${choice.stacks} of ${choice.maxStacks} times`}>
                {Array.from({ length: choice.maxStacks }, (_, p) => (
                  <span
                    key={p}
                    className={cn(
                      'h-[6px] w-[10px] border border-[rgba(217,173,98,0.5)]',
                      p < choice.stacks ? 'bg-[var(--gold)]' : 'bg-transparent',
                    )}
                  />
                ))}
              </span>
              <Keycap className="mt-1">{i + 1}</Keycap>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
