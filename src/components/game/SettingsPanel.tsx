'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';

function VolumeRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <label className="block">
      <span className="rb-smallcaps mb-1.5 flex items-baseline justify-between text-[10px] text-[var(--bone)]">
        {label}
        <span className="tabular-nums text-[var(--gold)]">{pct}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="rb-slider w-full"
      />
    </label>
  );
}

export default function SettingsPanel() {
  const settings = useGameStore((s) => s.settings);
  const applySettings = useGameStore((s) => s.applySettings);
  const closePanel = useGameStore((s) => s.closePanel);
  const [confirmReset, setConfirmReset] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const resetProgress = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      timerRef.current = window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    try {
      window.localStorage.removeItem('riftbound.save');
      window.localStorage.removeItem('riftbound.best');
    } catch {
      /* storage unavailable */
    }
    window.location.reload();
  };

  return (
    <DialogShell label="Settings" onEsc={closePanel} z="z-50">
      <div className="rb-panel relative w-[min(430px,92vw)] p-7">
        <Corners />
        <h2 className="text-center font-display text-2xl font-bold tracking-[0.28em] text-[var(--bone)]">SETTINGS</h2>
        <GoldRule className="mx-auto mt-3" />

        <div className="mt-6 flex flex-col gap-5">
          <VolumeRow label="Master volume" value={settings.master} onChange={(v) => applySettings({ master: v })} />
          <VolumeRow label="Music" value={settings.music} onChange={(v) => applySettings({ music: v })} />
          <VolumeRow label="Effects" value={settings.sfx} onChange={(v) => applySettings({ sfx: v })} />

          <div className="h-px bg-[rgba(217,173,98,0.2)]" />

          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="rb-smallcaps block text-[10px] text-[var(--bone)]">Screen shake</span>
                <span className="font-body text-[11px] text-[#8d8398]">Camera impact feedback</span>
              </span>
              <input
                type="checkbox"
                className="rb-switch"
                checked={settings.screenShake}
                onChange={(e) => applySettings({ screenShake: e.target.checked })}
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="rb-smallcaps block text-[10px] text-[var(--bone)]">Reduced effects</span>
                <span className="font-body text-[11px] text-[#8d8398]">Fewer particles and motion</span>
              </span>
              <input
                type="checkbox"
                className="rb-switch"
                checked={settings.reducedFx}
                onChange={(e) => applySettings({ reducedFx: e.target.checked })}
              />
            </label>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-2.5">
          <button type="button" className="rb-btn rb-btn-primary" autoFocus onClick={() => { uiClick(); closePanel(); }}>
            Back
          </button>
          <button type="button" className={confirmReset ? 'rb-btn rb-btn-danger' : 'rb-btn'} onClick={resetProgress}>
            {confirmReset ? 'Click again to confirm' : 'Reset progress'}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
