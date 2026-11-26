'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { uiClick } from './shared';

const TIPS = [
  'The dead do not rest here. Neither should you.',
  'Gold spends. Wounds close. The seal does not care.',
  'Dodge through danger, not away from it.',
  'Elite foes carry elite coin.',
  'The Necromancer keeps his promises.',
];

const TIP_INTERVAL_MS = 2800;
/** If the run has not started this long after entering the loading
    screen, assume it is stuck and offer a way out. */
const WATCHDOG_MS = 20000;

export default function LoadingScreen() {
  const booted = useGameStore((s) => s.booted);
  const bootProgress = useGameStore((s) => s.bootProgress);
  const bootError = useGameStore((s) => s.bootError);
  const setUi = useGameStore((s) => s.setUi);
  const [tipIndex, setTipIndex] = useState(() => 0);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), TIP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  /* watchdog: never spin forever (component remounts on each show,
     so `stuck` always starts fresh) */
  useEffect(() => {
    const id = window.setTimeout(() => setStuck(true), WATCHDOG_MS);
    return () => window.clearTimeout(id);
  }, []);

  const problem = bootError ?? (stuck ? 'The ruins are taking too long to answer.' : null);
  const pct = Math.round(Math.min(1, Math.max(0, bootProgress)) * 100);

  return (
    <div className="rb-atmosphere anim-fade-in absolute inset-0 z-40 flex flex-col items-center justify-center px-6">
      <p className="font-display text-[11px] font-semibold tracking-[0.44em] text-[var(--gold)]">THE DESCENT BEGINS</p>
      <h1 className="rb-title-glow mt-3 font-display text-4xl font-extrabold tracking-[0.14em] text-[var(--bone)] sm:text-5xl">
        RIFTBOUND
      </h1>
      <p className="mt-1 font-body text-base italic text-[#c3aee8] sm:text-lg">Echoes of the Fallen</p>

      {problem ? (
        <div className="mt-10 w-[min(440px,84vw)] border border-[rgba(217,93,93,0.5)] bg-[rgba(30,16,20,0.92)] p-5 text-center" role="alert">
          <p className="rb-smallcaps text-[11px] text-[#e08a8a]">THE DESCENT WAS HALTED</p>
          <p className="mt-2 font-body text-sm text-[#d8cfc4]">{problem}</p>
          <div className="mt-4 flex items-center justify-center gap-2.5">
            <button
              type="button"
              className="rb-btn rb-btn-primary"
              onClick={() => {
                uiClick();
                window.location.reload();
              }}
            >
              Retry
            </button>
            <button
              type="button"
              className="rb-btn"
              onClick={() => {
                uiClick();
                setUi('menu');
              }}
            >
              Back to Menu
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-10 w-[min(440px,84vw)]" role="status" aria-live="polite">
          {booted ? (
            <>
              <div className="rb-bar-track h-[10px]">
                <div className="rb-shimmer-bar h-full w-full" />
              </div>
              <p className="mt-3 text-center font-display text-[11px] font-semibold tracking-[0.26em] text-[var(--gold)]">
                ENTERING THE RUINS...
              </p>
            </>
          ) : (
            <>
              <div className="rb-bar-track h-[10px]">
                <div className="rb-progress-fill h-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-3 text-center font-display text-[11px] font-semibold tracking-[0.26em] text-[#a89dbd] tabular-nums">
                {pct}%
              </p>
            </>
          )}
        </div>
      )}

      {!problem && (
        <p key={tipIndex} className="anim-fade-in mt-12 max-w-md text-center font-body text-sm italic text-[#8d8398]">
          {TIPS[tipIndex]}
        </p>
      )}
    </div>
  );
}
