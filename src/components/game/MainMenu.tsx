'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { gameAudio } from '@/game/audio';
import { uiClick } from './shared';

export default function MainMenu() {
  const best = useGameStore((s) => s.best);
  const saveInfo = useGameStore((s) => s.saveInfo);
  const booted = useGameStore((s) => s.booted);
  const bootProgress = useGameStore((s) => s.bootProgress);
  const bootError = useGameStore((s) => s.bootError);
  const shards = useGameStore((s) => s.shards);
  const setUi = useGameStore((s) => s.setUi);
  const openPanel = useGameStore((s) => s.openPanel);
  const cmdContinue = useGameStore((s) => s.cmdContinue);

  const [artOk, setArtOk] = useState(true);
  /* localStorage-backed records differ from the server render, so the
     record line is painted one tick after hydration */
  const [recordsReady, setRecordsReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRecordsReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const canPlay = booted && !bootError;
  const pct = Math.round(Math.min(1, Math.max(0, bootProgress)) * 100);

  const beginRun = (start: () => void) => {
    if (!canPlay) return;
    gameAudio.play('click');
    setUi('loading');
    start();
  };

  /* New runs detour through the pact screen, where the descent begins */
  const goPacts = () => {
    if (!canPlay) return;
    uiClick();
    setUi('pacts');
  };

  return (
    <div className="anim-fade-in absolute inset-0 z-40">
      {/* Gradient fallback sits behind the keyart in case it is absent */}
      <div className="rb-menu-fallback absolute inset-0" />
      {artOk && (
        <img
          src="/assets/menu/keyart.png"
          alt=""
          onError={() => setArtOk(false)}
          draggable={false}
          className="pixelated absolute inset-0 h-full w-full object-cover opacity-90"
        />
      )}
      {/* Readability scrims */}
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(14,10,20,0.45)] via-[rgba(14,10,20,0.16)] to-[rgba(14,10,20,0.9)]" />
      <div className="rb-vignette absolute inset-0" />

      <div className="relative flex h-full flex-col items-center justify-center px-6 pb-16 pt-10">
        <header className="flex flex-col items-center text-center">
          <p className="font-display text-[11px] font-semibold tracking-[0.44em] text-[var(--gold)]">
            A DARK FANTASY ROGUELIKE
          </p>
          <h1 className="rb-title-glow mt-3 font-display text-6xl font-extrabold tracking-[0.12em] text-[var(--bone)] sm:text-7xl lg:text-8xl">
            RIFTBOUND
          </h1>
          <p className="mt-2 font-body text-xl italic tracking-wide text-[#c3aee8] sm:text-2xl">
            Echoes of the Fallen
          </p>
          <p className="mt-5 max-w-md font-body text-sm text-[#b7ab97] sm:text-base">
            The seal is weakening. Something is moving beneath the keep.
          </p>
        </header>

        {bootError ? (
          <div className="mt-10 w-[min(420px,88vw)] border border-[rgba(217,93,93,0.5)] bg-[rgba(30,16,20,0.92)] p-5 text-center" role="alert">
            <p className="rb-smallcaps text-[11px] text-[#e08a8a]">THE DESCENT WAS HALTED</p>
            <p className="mt-2 font-body text-sm text-[#d8cfc4]">{bootError}</p>
            <button
              type="button"
              className="rb-btn rb-btn-primary mt-4"
              onClick={() => {
                uiClick();
                window.location.reload();
              }}
            >
              Try Again
            </button>
          </div>
        ) : (
          <nav className="mt-10 flex w-[260px] flex-col gap-2.5" aria-label="Main menu">
            <button
              type="button"
              className="rb-btn rb-btn-primary disabled:cursor-wait disabled:opacity-70"
              disabled={!canPlay}
              onClick={goPacts}
            >
              {canPlay ? 'New Run' : `Forging the Ruins… ${pct}%`}
            </button>
            {saveInfo && (
              <button
                type="button"
                className="rb-btn disabled:cursor-wait disabled:opacity-70"
                disabled={!canPlay}
                onClick={() => beginRun(cmdContinue)}
              >
                <span>Continue</span>
                <span className="mt-0.5 block font-body text-[10px] font-normal normal-case tracking-normal text-[#a89dbd]">
                  Floor {saveInfo.floor} · Level {saveInfo.level}
                </span>
              </button>
            )}
            <button
              type="button"
              className="rb-btn"
              onClick={() => {
                uiClick();
                openPanel('settings');
              }}
            >
              Settings
            </button>
            <button
              type="button"
              className="rb-btn"
              onClick={() => {
                uiClick();
                openPanel('controls');
              }}
            >
              Controls
            </button>
            <button
              type="button"
              className="rb-btn"
              onClick={() => {
                uiClick();
                openPanel('credits');
              }}
            >
              Credits
            </button>
          </nav>
        )}
      </div>

      <footer className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-1.5 font-body text-xs text-[#8d8398]">
            <img src="/assets/icons/ghost.png" alt="" draggable={false} className="pixelated h-4 w-4 shrink-0" />
            <span className="tabular-nums text-[#b49ae8]">Soul shards: {recordsReady ? shards : 0}</span>
          </p>
          <p className="font-body text-xs text-[#8d8398]">
            {recordsReady && best.runs > 0 ? (
              <>
                Deepest descent: Floor {best.bestFloor} · Runs: {best.runs} · Seals held: {best.victories}
              </>
            ) : (
              <span className="italic">No descents yet. The dark is patient.</span>
            )}
          </p>
        </div>
        <p className="shrink-0 font-display text-[10px] tracking-[0.24em] text-[#6f6580]">PHASER 3 · WEBGL</p>
      </footer>
    </div>
  );
}
