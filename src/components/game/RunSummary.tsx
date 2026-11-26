'use client';

/* Shared run-summary block for death and victory screens. */

import type { RunStats } from '@/game/types';
import { PACT_MAP } from '@/game/config';
import { formatTime } from './shared';
import { GoldRule } from './shared';

export function RunSummary({ stats }: { stats: RunStats }) {
  const cells = [
    { label: 'Floor reached', value: String(stats.floor) },
    { label: 'Level', value: String(stats.level) },
    { label: 'Gold gathered', value: String(stats.gold) },
    { label: 'Enemies felled', value: String(stats.kills) },
    { label: 'Time', value: formatTime(stats.timeMs) },
    { label: 'Soul shards earned', value: String(stats.shards) },
  ];
  return (
    <div className="w-[min(560px,92vw)]">
      <div className="rb-card grid grid-cols-3 gap-px sm:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className="p-3 text-center">
            <p className="rb-smallcaps text-[9px] leading-tight text-[#8d8398]">{c.label}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-[var(--bone)]">{c.value}</p>
          </div>
        ))}
      </div>

      {stats.relics.length > 0 && (
        <div className="mt-4">
          <p className="rb-smallcaps mb-2 text-center text-[9px] text-[var(--gold)]">Relics carried</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stats.relics.map((r) => (
              <span key={r.id} className="flex items-center gap-1.5 border border-[rgba(217,173,98,0.3)] bg-[rgba(24,19,36,0.85)] px-2 py-1" title={r.name}>
                <img src={r.icon} alt="" className="pixelated h-5 w-5" draggable={false} />
                <span className="font-body text-[11px] text-[#b7ab97]">{r.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.pacts.length > 0 && (
        <div className="mt-4">
          <p className="rb-smallcaps mb-2 text-center text-[9px] text-[var(--ember)]">
            {stats.pacts.length} {stats.pacts.length === 1 ? 'oath' : 'oaths'} sworn
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stats.pacts.map((id) => {
              const pact = PACT_MAP[id];
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 border border-[rgba(217,82,82,0.35)] bg-[rgba(24,19,36,0.85)] px-2 py-1"
                  title={pact ? `${pact.name} — ${pact.desc}` : undefined}
                >
                  <img src={pact?.icon ?? '/assets/icons/relic_shield.png'} alt="" className="pixelated h-5 w-5" draggable={false} />
                  <span className="font-body text-[11px] text-[#b7ab97]">{pact?.name ?? id}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {stats.upgrades.length > 0 && (
        <div className="mt-4">
          <p className="rb-smallcaps mb-2 text-center text-[9px] text-[var(--gold)]">Boons taken</p>
          <p className="text-center font-body text-xs leading-relaxed text-[#8d8398]">
            {stats.upgrades.map((u) => `${u.name}${u.stacks > 1 ? ` ×${u.stacks}` : ''}`).join(' · ')}
          </p>
        </div>
      )}
      <GoldRule className="mx-auto mt-5" />
    </div>
  );
}
