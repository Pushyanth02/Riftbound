'use client';

import { useGameStore } from '@/lib/gameStore';
import { uiClick } from './shared';
import { RunSummary } from './RunSummary';

export default function VictoryScreen() {
  const stats = useGameStore((s) => s.runStats);
  const cmdRestart = useGameStore((s) => s.cmdRestart);
  const cmdQuit = useGameStore((s) => s.cmdQuit);

  return (
    <div
      className="anim-fade-in fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(120,90,30,0.12),rgba(10,7,15,0.97)_62%)] p-6 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Victory"
    >
      <div className="flex flex-col items-center">
        <p className="rb-smallcaps anim-fade-in text-xs text-[var(--gold)]">The breach is closed</p>
        <h2 className="anim-rise mt-3 max-w-[16ch] text-center font-display text-4xl font-extrabold leading-tight tracking-[0.16em] text-[var(--gold)] sm:text-5xl">
          THE SEAL HOLDS
        </h2>
        <p className="mt-3 text-center font-body text-sm italic text-[#b7ab97]">
          The keep sleeps — and so may you.
        </p>

        {stats && (
          <div className="mt-8">
            <RunSummary stats={stats} />
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-2.5 sm:flex-row">
          <button type="button" className="rb-btn rb-btn-primary w-64" autoFocus onClick={() => { uiClick(); cmdRestart(); }}>
            Descend again
          </button>
          <button type="button" className="rb-btn w-64" onClick={() => { uiClick(); cmdQuit(); }}>
            Return to menu
          </button>
        </div>
      </div>
    </div>
  );
}
