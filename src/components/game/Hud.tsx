'use client';

/* Gameplay HUD: bars, relic/boon rows, souls and pact trackers, ability
   bar with cooldowns and cast buttons, potions, gold, floor, boss bar,
   interaction prompt, room/floor cards, toasts, minimap, low-HP vignette. */

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { assetPath } from '@/lib/assetPath';
import { PATRONS, PLAYER_BASE } from '@/game/config';
import { clamp01 } from './shared';
import { Keycap } from './shared';
import MinimapCanvas from './MinimapCanvas';
import { cn } from '@/lib/utils';
import type { BossState, HudState } from '@/game/types';

/* ----------------------------- bars ----------------------------- */

function HpBar({ hud }: { hud: HudState }) {
  const [ghost, setGhost] = useState(hud.hp);
  const ghostRef = useRef(hud.hp);
  useEffect(() => {
    /* the pale ghost drains slightly after the real bar; rises instantly */
    if (hud.hp > ghostRef.current) {
      ghostRef.current = hud.hp;
      const rise = window.setTimeout(() => setGhost(hud.hp), 0);
      return () => window.clearTimeout(rise);
    }
    const t = window.setTimeout(() => {
      ghostRef.current = hud.hp;
      setGhost(hud.hp);
    }, 420);
    return () => window.clearTimeout(t);
  }, [hud.hp]);

  const pct = clamp01(hud.hp / hud.maxHp) * 100;
  const ghostPct = clamp01(ghost / hud.maxHp) * 100;
  const low = hud.hp / hud.maxHp <= 0.25;
  return (
    <div className="relative h-[22px] w-[260px] rb-bar-track" role="progressbar" aria-label="Health" aria-valuenow={hud.hp} aria-valuemin={0} aria-valuemax={hud.maxHp}>
      <div className="absolute inset-y-0 left-0 bg-[#7e3a3a] transition-[width] duration-500 ease-out" style={{ width: `${ghostPct}%` }} />
      <div
        className={cn('absolute inset-y-0 left-0 transition-[width] duration-150 ease-out', low && 'anim-pulse-soft')}
        style={{ width: `${pct}%`, background: 'linear-gradient(180deg, #e06a5e 0%, #c24343 55%, #93302f 100%)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-body text-[11px] font-semibold tabular-nums text-[var(--bone)] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {Math.ceil(hud.hp)} / {hud.maxHp}
        </span>
      </div>
    </div>
  );
}

function ManaBar({ hud }: { hud: HudState }) {
  const pct = clamp01(hud.mana / hud.maxMana) * 100;
  return (
    <div className="relative h-[12px] w-[200px] rb-bar-track" role="progressbar" aria-label="Mana" aria-valuenow={hud.mana} aria-valuemin={0} aria-valuemax={hud.maxMana}>
      <div className="absolute inset-y-0 left-0 transition-[width] duration-150 ease-out" style={{ width: `${pct}%`, background: 'linear-gradient(180deg, #a983ee 0%, #8357d6 60%, #6a41b4 100%)' }} />
    </div>
  );
}

function XpBar({ hud }: { hud: HudState }) {
  const pct = clamp01(hud.xp / hud.xpNeed) * 100;
  return (
    <div className="flex w-[260px] items-center gap-2">
      <span className="rb-smallcaps shrink-0 border border-[rgba(217,173,98,0.5)] bg-[rgba(20,14,29,0.85)] px-1.5 py-px text-[10px] leading-tight text-[var(--gold)]">
        LV {hud.level}
      </span>
      <div className="relative h-[6px] flex-1 rb-bar-track">
        <div className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #8a7040, #d9ad62)' }} />
      </div>
    </div>
  );
}

/* ------------------------ relics & boons ------------------------ */

/** Compact icon rows under the bars. Rows render only when non-empty;
    native title tooltips carry the name/desc. */
function RelicBoonRows({ hud }: { hud: HudState }) {
  if (hud.relics.length === 0 && hud.boons.length === 0) return null;
  return (
    <div className="rb-panel mt-1 flex max-w-[284px] flex-col gap-1.5 !p-1.5">
      {hud.relics.length > 0 && (
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {hud.relics.map((r) => (
            <img
              key={r.id}
              src={assetPath(r.icon)}
              alt=""
              draggable={false}
              title={`${r.name} — ${r.desc}`}
              className="pixelated h-6 w-6"
            />
          ))}
        </div>
      )}
      {hud.boons.length > 0 && (
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {hud.boons.map((b) => (
            <span
              key={b.id}
              title={`${b.name} — ${b.desc}`}
              className="block border-b-2 pb-px"
              style={{ borderColor: PATRONS[b.patron].color }}
            >
              <img src={assetPath(b.icon)} alt="" draggable={false} className="pixelated block h-6 w-6" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- boss bar ---------------------------- */

/** Phase pips: filled diamonds for phases already entered, hollow for
    the ones to come. Re-keys on change so the flash replays. */
function PhasePips({ phase, phases }: { phase: number; phases: number }) {
  if (phases <= 1) return null;
  return (
    <span
      key={phase}
      role="img"
      aria-label={`Phase ${phase} of ${phases}`}
      className="anim-flash mt-1 flex items-center justify-center gap-2"
    >
      {Array.from({ length: phases }, (_, i) => (
        <span
          key={i}
          className={cn(
            'block h-[7px] w-[7px] rotate-45',
            i < phase ? 'bg-[var(--ember)]' : 'border border-[rgba(217,82,82,0.6)]',
          )}
        />
      ))}
    </span>
  );
}

function BossBar({ boss }: { boss: BossState }) {
  const champion = boss.champion === true;
  return (
    <div
      className={cn(
        'anim-rise absolute left-1/2 top-5 -translate-x-1/2',
        champion ? 'w-[min(440px,64vw)]' : 'w-[min(560px,72vw)]',
      )}
    >
      <div className="flex items-center justify-center gap-2.5">
        <img
          src={assetPath('/assets/icons/boss.png')}
          alt=""
          draggable={false}
          className={cn('pixelated shrink-0', champion ? 'h-6 w-6' : 'h-8 w-8')}
        />
        <div className="text-center">
          {champion ? (
            <>
              <p className="font-body text-[10px] italic text-[var(--ember)]">{boss.title}</p>
              <p className="font-display text-xs font-bold tracking-[0.12em] text-[var(--bone)]">{boss.name}</p>
            </>
          ) : (
            <>
              <p className="font-display text-sm font-bold tracking-[0.14em] text-[var(--bone)]">{boss.name}</p>
              <p className="font-body text-[10px] italic text-[#a89dbd]">{boss.title}</p>
            </>
          )}
        </div>
      </div>
      <div
        className={cn('relative mt-1.5 rb-bar-track', champion ? 'h-[10px]' : 'h-[14px]')}
        role="progressbar"
        aria-label="Boss health"
        aria-valuenow={boss.hp}
        aria-valuemin={0}
        aria-valuemax={boss.maxHp}
      >
        <div className="absolute inset-y-0 left-0 transition-[width] duration-200" style={{ width: `${clamp01(boss.hp / boss.maxHp) * 100}%`, background: 'linear-gradient(180deg, #e06a5e 0%, #b53a3a 60%, #7d2727 100%)' }} />
        {/* segment ticks every 10% */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="ml-[10%] h-full w-px bg-[rgba(14,10,20,0.55)]" />
          ))}
        </div>
      </div>
      <PhasePips key={boss.phase} phase={boss.phase} phases={boss.phases} />
    </div>
  );
}

/* --------------------------- ability slots --------------------------- */

type CastSlot = 'melee' | 'fireball' | 'frost' | 'bolt' | 'whirl' | 'dodge';

interface SlotDef {
  key: string;
  icon: string;
  label: string;
  slot: CastSlot;
  cd: number;
  mana?: number;
  manaMax?: number;
}

function AbilitySlot({ def, onCast }: { def: SlotDef; onCast: (slot: CastSlot) => void }) {
  const cooling = def.cd > 0.02;
  const starved = def.mana !== undefined && def.manaMax !== undefined && def.mana > def.manaMax;
  return (
    <button
      type="button"
      tabIndex={0}
      title={`${def.label} (${def.key})${def.mana ? ` · ${def.mana} mana` : ''}`}
      aria-label={`${def.label} (${def.key})${starved ? ', insufficient mana' : cooling ? ', recovering' : ', ready'}`}
      disabled={starved || (cooling && def.slot !== 'melee')}
      onClick={() => onCast(def.slot)}
      className="pointer-events-auto group relative h-14 w-14 shrink-0 cursor-pointer border border-[rgba(217,173,98,0.4)] bg-[rgba(30,24,44,0.92)] transition-[border-color,transform] hover:-translate-y-px hover:border-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gold)]"
    >
      <img src={assetPath(def.icon)} alt="" draggable={false} className={cn('pixelated h-9 w-9 transition-opacity', cooling && 'opacity-40')} />
      {/* mana cost chip (bottom-left) */}
      {def.mana !== undefined && (
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 left-0.5 font-body text-[10px] font-bold leading-none tabular-nums text-[#b49ae8] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
        >
          {def.mana}
        </span>
      )}
      <span className="rb-keycap absolute bottom-0.5 right-0.5 !px-1 !py-0 !text-[8px]">{def.key}</span>
      {/* ready shine: a thin gold line while the skill is off cooldown */}
      {!cooling && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-[var(--gold)]" />}
      {cooling && (
        <span className="absolute inset-x-0 bottom-0 bg-[rgba(10,7,15,0.78)]" style={{ height: `${clamp01(def.cd) * 100}%` }}>
          <span className="sr-only">cooling down</span>
        </span>
      )}
      {starved && !cooling && <span className="absolute inset-0 bg-[rgba(152,104,232,0.25)]" aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------ main ------------------------------ */

export default function Hud() {
  const hud = useGameStore((s) => s.hud);
  const minimap = useGameStore((s) => s.minimap);
  const boss = useGameStore((s) => s.boss);
  const prompt = useGameStore((s) => s.prompt);
  const roomTitle = useGameStore((s) => s.roomTitle);
  const floorCard = useGameStore((s) => s.floorCard);
  const toasts = useGameStore((s) => s.toasts);
  const cmdPotion = useGameStore((s) => s.cmdPotion);
  const cmdCast = useGameStore((s) => s.cmdCast);
  const [mapLarge, setMapLarge] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && useGameStore.getState().ui === 'playing' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setMapLarge(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setMapLarge(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  if (!hud) return null;
  const c = hud.cooldowns;
  const lowHp = hud.maxHp > 0 && hud.hp / hud.maxHp <= 0.25;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* low-health vignette */}
      {lowHp && (
        <div
          aria-hidden="true"
          className="anim-pulse-soft absolute inset-0 z-[6]"
          style={{ boxShadow: 'inset 0 0 120px 40px rgba(160,30,30,0.35)' }}
        />
      )}

      {/* top-left cluster */}
      <div className="absolute left-4 top-4 flex items-start gap-2">
        <div aria-hidden="true" className="rb-panel pixelated h-12 w-12 shrink-0"
          style={{ backgroundImage: `url('${assetPath('/assets/characters/player/idle.png')}')`, backgroundSize: '600px 100px', backgroundPosition: '-26px -31px' }} />
        <div className="flex flex-col gap-1.5">
        <HpBar hud={hud} />
        <ManaBar hud={hud} />
        <XpBar hud={hud} />
        <RelicBoonRows hud={hud} />
        </div>
      </div>

      {/* top-right cluster */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <span className="sr-only">Soul shards</span>
          <img src={assetPath('/assets/icons/ghost.png')} alt="" draggable={false} className="pixelated h-6 w-6" />
          <span className="font-display text-lg font-bold tabular-nums text-[#b49ae8]">{hud.souls}</span>
        </div>
        <div className="flex items-center gap-2">
          <img src={assetPath('/assets/icons/gold.png')} alt="" className="pixelated h-6 w-6" draggable={false} />
          <span className="font-display text-lg font-bold tabular-nums text-[var(--gold)]">{hud.gold}</span>
        </div>
        <div className="text-right">
          <p className="rb-smallcaps text-[10px] text-[var(--bone)]">
            Floor {hud.floor} / {hud.maxFloor}
          </p>
          <p className="font-body text-[11px] italic text-[#c8bcae]">{hud.floorName}</p>
          {hud.pactCount > 0 && (
            <div className="mt-1 flex items-center justify-end gap-1" aria-label={`${hud.pactCount} pacts sworn`}>
              {Array.from({ length: Math.min(hud.pactCount, 6) }, (_, i) => (
                <img
                  key={i}
                  src={assetPath('/assets/icons/relic_shield.png')}
                  alt=""
                  draggable={false}
                  title="Pact sworn"
                  className="pixelated h-[14px] w-[14px]"
                />
              ))}
            </div>
          )}
        </div>
        <div className="rb-panel !p-1.5">
          <MinimapCanvas data={minimap} large={mapLarge} />
        </div>
      </div>

      {/* boss bar */}
      {boss && <BossBar boss={boss} />}

      {!boss && <p className="absolute left-1/2 top-5 -translate-x-1/2 bg-[var(--ink)]/80 px-3 py-1 text-center font-body text-sm text-[var(--gold)]">{hud.objective}</p>}
      {/* timed trial countdown: the sand itself, clear of the boss bar */}
      {hud.challengeMs !== null && hud.challengeMs > 0 && (
        <div
          className="absolute left-1/2 top-14 -translate-x-1/2 border border-[rgba(232,207,154,0.55)] bg-[rgba(20,14,29,0.9)] px-3 py-1"
          role="timer"
          aria-label={`Trial time remaining ${Math.ceil(hud.challengeMs / 1000)} seconds`}
        >
          <span className={cn('font-display text-sm font-bold tabular-nums tracking-widest', hud.challengeMs < 8000 ? 'text-[#d95252]' : 'text-[#e8cf9a]')}>
            {Math.floor(hud.challengeMs / 60000)}:{String(Math.floor((hud.challengeMs % 60000) / 1000)).padStart(2, '0')}
          </span>
        </div>
      )}
      {hud.boltCharge > 0 && <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center text-xs text-[var(--bone)]">
        {hud.boltCharge < 1 ? 'Charging Arcane Bolt' : hud.mana >= PLAYER_BASE.boltMana + PLAYER_BASE.boltChargeMana ? 'Release for piercing bolt' : 'Release for Arcane Bolt'}
        <div className="mt-1 h-1 bg-[var(--stone)]"><div className="h-full bg-[var(--gold)]" style={{ width: `${hud.boltCharge * 100}%` }} /></div>
      </div>}

      {/* room title card */}
      {roomTitle && (
        <div key={roomTitle.name} className="anim-rise absolute left-1/2 top-[15%] -translate-x-1/2 text-center">
          <div className="flex items-center gap-3">
            <span className="h-px w-14 bg-gradient-to-r from-transparent to-[rgba(217,173,98,0.6)]" />
            <h2 className="font-display text-xl font-bold tracking-[0.22em] text-[var(--bone)]">{roomTitle.name}</h2>
            <span className="h-px w-14 bg-gradient-to-l from-transparent to-[rgba(217,173,98,0.6)]" />
          </div>
          {roomTitle.sub && <p className="mt-1 font-body text-xs italic text-[#a89dbd]">{roomTitle.sub}</p>}
        </div>
      )}

      {/* floor transition card */}
      {floorCard && (
        <div key={floorCard.floor} className="anim-fade-in absolute inset-0 z-20 grid place-items-center bg-[rgba(10,7,15,0.6)]">
          <div className="text-center">
            <p className="rb-smallcaps text-xs text-[var(--gold)]">Descending</p>
            <h2 className="mt-2 font-display text-5xl font-extrabold tracking-[0.18em] text-[var(--bone)]">FLOOR {floorCard.floor}</h2>
            <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
            <p className="mt-3 font-body text-sm italic text-[#b7ab97]">{floorCard.name}</p>
          </div>
        </div>
      )}

      {/* toasts (below the minimap panel) */}
      <div className="absolute right-4 top-[286px] flex w-72 flex-col items-end gap-1.5">
        {toasts.map((t) => (
          <div key={t.id} className="anim-toast-in pointer-events-none flex items-center gap-2 border border-[rgba(217,173,98,0.4)] bg-[rgba(25,20,37,0.94)] px-3 py-1.5">
            {t.icon && <img src={assetPath(t.icon)} alt="" className="pixelated h-5 w-5" draggable={false} />}
            <span className="font-body text-xs text-[var(--bone)]">{t.text}</span>
          </div>
        ))}
      </div>

      {/* interaction prompt */}
      {prompt && (
        <div className="anim-float-soft absolute bottom-32 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2.5 border border-[rgba(217,173,98,0.5)] bg-[rgba(25,20,37,0.94)] px-4 py-2">
            <Keycap>E</Keycap>
            <span className="font-body text-sm text-[var(--bone)]">{prompt}</span>
          </div>
        </div>
      )}

      {/* bottom-center ability bar */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-end gap-2">
        <AbilitySlot def={{ key: 'LMB', icon: '/assets/icons/melee.png', label: 'Melee attack', slot: 'melee', cd: c.melee }} onCast={cmdCast} />
        <AbilitySlot def={{ key: 'RMB', icon: '/assets/icons/fireball.png', label: 'Fireball', slot: 'fireball', cd: c.fireball, mana: PLAYER_BASE.fireballMana, manaMax: hud.mana }} onCast={cmdCast} />
        <AbilitySlot def={{ key: '1', icon: '/assets/icons/frost.png', label: 'Frost Nova', slot: 'frost', cd: c.frost, mana: PLAYER_BASE.frostMana, manaMax: hud.mana }} onCast={cmdCast} />
        <AbilitySlot def={{ key: '2', icon: '/assets/icons/arcane.png', label: 'Arcane Bolt', slot: 'bolt', cd: c.bolt, mana: PLAYER_BASE.boltMana, manaMax: hud.mana }} onCast={cmdCast} />
        <AbilitySlot def={{ key: '3', icon: '/assets/icons/whirlwind.png', label: 'Whirlwind', slot: 'whirl', cd: c.whirl, mana: PLAYER_BASE.whirlMana, manaMax: hud.mana }} onCast={cmdCast} />
        <AbilitySlot def={{ key: 'SPC', icon: '/assets/icons/dodge.png', label: 'Dodge roll', slot: 'dodge', cd: c.dodge }} onCast={cmdCast} />

        <span className="mx-1 h-10 w-px bg-[rgba(217,173,98,0.25)]" aria-hidden="true" />

        <button
          type="button"
          aria-label={`Drink health potion (${hud.potions.health} left)`}
          onClick={() => cmdPotion('health')}
          disabled={hud.potions.health <= 0}
          className="pointer-events-auto group relative h-14 w-14 shrink-0 border border-[rgba(217,173,98,0.4)] bg-[rgba(30,24,44,0.92)] transition-[border-color,transform] hover:-translate-y-px hover:border-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <img src={assetPath('/assets/icons/health_potion.png')} alt="" className="pixelated mx-auto h-9 w-9" draggable={false} />
          <span className="rb-keycap absolute bottom-0.5 right-0.5 !px-1 !py-0 !text-[8px]">Q</span>
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] border border-[rgba(217,173,98,0.55)] bg-[#1c1729] px-1 text-center font-body text-[10px] font-bold tabular-nums text-[var(--bone)]">
            {hud.potions.health}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Drink mana potion (${hud.potions.mana} left)`}
          onClick={() => cmdPotion('mana')}
          disabled={hud.potions.mana <= 0}
          className="pointer-events-auto group relative h-14 w-14 shrink-0 border border-[rgba(217,173,98,0.4)] bg-[rgba(30,24,44,0.92)] transition-[border-color,transform] hover:-translate-y-px hover:border-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <img src={assetPath('/assets/icons/mana_potion.png')} alt="" className="pixelated mx-auto h-9 w-9" draggable={false} />
          <span className="rb-keycap absolute bottom-0.5 right-0.5 !px-1 !py-0 !text-[8px]">F</span>
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] border border-[rgba(217,173,98,0.55)] bg-[#1c1729] px-1 text-center font-body text-[10px] font-bold tabular-nums text-[var(--bone)]">
            {hud.potions.mana}
          </span>
        </button>
      </div>
    </div>
  );
}
