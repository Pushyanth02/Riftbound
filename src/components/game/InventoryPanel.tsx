'use client';

import { useGameStore } from '@/lib/gameStore';
import { PATRONS } from '@/game/config';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';
import { BOON_RARITY } from './BoonModal';

export default function InventoryPanel() {
  const hud = useGameStore((s) => s.hud);
  const cmdInventory = useGameStore((s) => s.cmdInventory);

  const stats: { label: string; value: string }[] = hud
    ? [
        { label: 'Health', value: `${Math.ceil(hud.hp)} / ${hud.maxHp}` },
        { label: 'Mana', value: `${Math.floor(hud.mana)} / ${hud.maxMana}` },
        { label: 'Level', value: String(hud.level) },
        { label: 'Gold', value: String(hud.gold) },
        { label: 'Soul Shards', value: String(hud.souls) },
        { label: 'Boons', value: String(hud.boons.length) },
        { label: 'Floor', value: `${hud.floor} / ${hud.maxFloor}` },
        { label: 'Potions', value: `${hud.potions.health} health · ${hud.potions.mana} mana` },
      ]
    : [];

  return (
    <DialogShell label="Inventory" onEsc={() => cmdInventory(false)} z="z-40">
      <div className="rb-panel relative w-[min(760px,94vw)] p-7">
        <Corners />
        <h2 className="text-center font-display text-2xl font-bold tracking-[0.28em] text-[var(--bone)]">INVENTORY</h2>
        <GoldRule className="mx-auto mt-3" />

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1.25fr_1fr]">
          {/* relics & boons */}
          <section aria-label="Relics and boons">
            <h3 className="rb-smallcaps mb-3 text-[10px] text-[var(--gold)]">Relics &amp; Boons</h3>
            {hud && (hud.relics.length > 0 || hud.boons.length > 0) ? (
              <ul className="rb-scroll flex max-h-[44vh] flex-col gap-2 overflow-y-auto pr-1">
                {hud.relics.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 border border-[rgba(217,173,98,0.22)] bg-[rgba(24,19,36,0.8)] p-3">
                    <img src={r.icon} alt="" className="pixelated mt-0.5 h-9 w-9 shrink-0" draggable={false} />
                    <div>
                      <p className="font-display text-sm font-bold tracking-wide text-[var(--bone)]">{r.name}</p>
                      <p className="font-body text-xs leading-snug text-[#a89dbd]">{r.desc}</p>
                    </div>
                  </li>
                ))}
                {hud.relics.length > 0 && hud.boons.length > 0 && (
                  <li aria-hidden="true" className="flex items-center gap-3 py-0.5">
                    <span className="h-px flex-1 bg-[rgba(217,173,98,0.18)]" />
                    <span className="block h-[5px] w-[5px] rotate-45 border border-[rgba(217,173,98,0.4)]" />
                    <span className="h-px flex-1 bg-[rgba(217,173,98,0.18)]" />
                  </li>
                )}
                {hud.boons.map((b) => {
                  const rarity = BOON_RARITY[b.rarity];
                  return (
                    <li
                      key={b.id}
                      className="flex items-start gap-3 border border-[rgba(217,173,98,0.22)] bg-[rgba(24,19,36,0.8)] p-3"
                      style={{ borderLeft: `3px solid ${PATRONS[b.patron].color}` }}
                    >
                      <img src={b.icon} alt="" className="pixelated mt-0.5 h-9 w-9 shrink-0" draggable={false} />
                      <div>
                        <p className="font-display text-sm font-bold tracking-wide text-[var(--bone)]">
                          {b.name}
                          <span
                            className="rb-smallcaps ml-2 font-body text-[10px] font-semibold uppercase tracking-[0.16em]"
                            style={{ color: rarity.color }}
                          >
                            {rarity.label}
                          </span>
                        </p>
                        <p className="font-body text-xs leading-snug text-[#a89dbd]">{b.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border border-dashed border-[rgba(217,173,98,0.25)] p-6 text-center font-body text-sm italic text-[#8d8398]">
                You carry nothing but grief.
              </p>
            )}
          </section>

          {/* hero stats */}
          <section aria-label="Hero status">
            <h3 className="rb-smallcaps mb-3 text-[10px] text-[var(--gold)]">The Hero</h3>
            <dl className="flex flex-col">
              {stats.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-[rgba(217,173,98,0.12)] py-2.5 last:border-b-0">
                  <dt className="rb-smallcaps text-[10px] text-[#8d8398]">{s.label}</dt>
                  <dd className="font-body text-sm font-semibold tabular-nums text-[var(--bone)]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <button type="button" className="rb-btn rb-btn-primary mt-7" autoFocus onClick={() => { uiClick(); cmdInventory(false); }}>
          Continue
        </button>
      </div>
    </DialogShell>
  );
}
