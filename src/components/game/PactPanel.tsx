'use client';

/* The Descent Pact: pre-run screen where oaths are sworn in exchange
   for a richer harvest of soul shards. */

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/gameStore';
import type { WeaponId } from '@/game/types';
import { WEAPONS, PACTS, pactRewardMult } from '@/game/config';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';
import { cn } from '@/lib/utils';

export default function PactPanel() {
  const pactSelection = useGameStore((s) => s.pactSelection);
  const togglePact = useGameStore((s) => s.togglePact);
  const cmdStart = useGameStore((s) => s.cmdStart);
  const cmdPactsBack = useGameStore((s) => s.cmdPactsBack);
  const setUi = useGameStore((s) => s.setUi);
  const shards = useGameStore((s) => s.shards);
  const [weapon, setWeapon] = useState<WeaponId>('sword');
  const beginRef = useRef<HTMLButtonElement>(null);

  /* DialogShell focuses the first button it finds (a pact card); the
     primary action should own the initial focus instead. */
  useEffect(() => {
    beginRef.current?.focus();
  }, []);

  const bounty = Math.round((pactRewardMult(pactSelection) - 1) * 100);

  return (
    <DialogShell label="The Descent Pact" z="z-40" backdrop="bg-[rgba(10,7,15,0.86)]">
      <div className="rb-panel relative w-[min(880px,96vw)] p-6 sm:p-8">
        <Corners />
        <h2 className="text-center font-display text-2xl font-bold tracking-[0.26em] text-[var(--bone)] sm:text-3xl">
          THE DESCENT PACT
        </h2>
        <p className="mt-2 text-center font-body text-sm italic text-[#a89dbd]">
          Swear oaths for a richer harvest of soul shards.
        </p>
        <GoldRule className="mx-auto mt-3" />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <label className="font-body text-sm text-[var(--bone)]">
            Starting weapon
            <select value={weapon} onChange={(event) => setWeapon(event.target.value as WeaponId)}
              className="ml-2 border border-[var(--gold)] bg-[var(--ink)] px-2 py-1">
              {(Object.keys(WEAPONS) as WeaponId[]).map((id) => (
                <option key={id} value={id} disabled={shards < WEAPONS[id].shards}>
                  {WEAPONS[id].name}{shards < WEAPONS[id].shards ? ` · ${WEAPONS[id].shards} shards required` : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="font-body text-xs text-[var(--bone)]">{WEAPONS[weapon].desc}</span>
        </div>
        <div className="rb-scroll mt-4 grid max-h-[42vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {PACTS.map((pact) => {
            const sworn = pactSelection.includes(pact.id);
            return (
              <button
                key={pact.id}
                type="button"
                aria-pressed={sworn}
                onClick={() => {
                  uiClick();
                  togglePact(pact.id);
                }}
                className={cn(
                  'rb-card group relative flex items-start gap-4 border p-4 text-left',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]',
                  sworn
                    ? 'border-[var(--gold)] bg-[rgba(217,173,98,0.14)]'
                    : 'border-[rgba(217,173,98,0.3)] bg-[rgba(26,21,39,0.9)] hover:bg-[rgba(30,25,45,0.94)]',
                )}
              >
                <span className="rb-sweep" aria-hidden="true" />
                <img
                  src={pact.icon}
                  alt=""
                  draggable={false}
                  className={cn('pixelated h-10 w-10 shrink-0', sworn ? 'opacity-100' : 'opacity-75')}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-sm font-bold tracking-wide text-[var(--bone)]">{pact.name}</span>
                    <span className="shrink-0 font-body text-xs font-semibold tabular-nums text-[var(--gold)]">
                      +{Math.round(pact.rewardMult * 100)}% shards
                    </span>
                  </span>
                  <span className="mt-1 block font-body text-xs leading-snug text-[#a89dbd]">{pact.desc}</span>
                </span>
                {/* sworn marker: filled corner diamond (no glyph, keeps the pixel idiom) */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-2.5 top-2.5 block h-[10px] w-[10px] rotate-45 border',
                    sworn ? 'border-[var(--gold)] bg-[var(--gold)]' : 'border-[rgba(217,173,98,0.35)] bg-transparent',
                  )}
                />
                {sworn && <span className="sr-only">Oath sworn</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-[rgba(217,173,98,0.14)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="rb-smallcaps text-center text-[11px] text-[#8d8398] sm:text-left">
            Soul shard bounty: <span className="font-semibold text-[var(--gold)]">+{bounty}%</span>
          </p>
          <div className="flex w-full gap-2.5 sm:w-auto">
            <button
              type="button"
              className="rb-btn flex-1 sm:flex-none sm:!px-7"
              onClick={() => {
                uiClick();
                setUi('menu');
                cmdPactsBack();
              }}
            >
              Back
            </button>
            <button
              ref={beginRef}
              type="button"
              className="rb-btn rb-btn-primary flex-1 sm:flex-none sm:!px-7"
              onClick={() => {
                uiClick();
                setUi('loading');
                cmdStart(undefined, pactSelection, weapon);
              }}
            >
              Begin the Descent
            </button>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}
