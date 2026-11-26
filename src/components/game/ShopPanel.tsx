'use client';

import { useGameStore } from '@/lib/gameStore';
import { uiClick } from './shared';
import { Corners, DialogShell, GoldRule } from './shared';
import { cn } from '@/lib/utils';

export default function ShopPanel() {
  const shop = useGameStore((s) => s.shop);
  const cmdShopBuy = useGameStore((s) => s.cmdShopBuy);
  const cmdShopClose = useGameStore((s) => s.cmdShopClose);

  if (!shop) return null;

  return (
    <DialogShell label="Merchant" onEsc={cmdShopClose} z="z-40">
      <div className="rb-panel relative w-[min(560px,94vw)] p-7">
        <Corners />
        <h2 className="text-center font-display text-xl font-bold tracking-[0.22em] text-[var(--bone)]">
          THE WANDERING MERCHANT
        </h2>
        <p className="mt-1 text-center font-body text-xs italic text-[#a89dbd]">
          He was here before the seal. He will be here after.
        </p>
        <GoldRule className="mx-auto mt-3" />

        <div className="mt-4 flex items-center justify-center gap-2">
          <img src="/assets/icons/gold.png" alt="" className="pixelated h-5 w-5" draggable={false} />
          <span className="font-display text-base font-bold tabular-nums text-[var(--gold)]">{shop.gold}</span>
          <span className="rb-smallcaps text-[9px] text-[#8d8398]">your gold</span>
        </div>

        <ul className="rb-scroll mt-5 flex max-h-[42vh] flex-col gap-2.5 overflow-y-auto pr-1">
          {shop.wares.map((ware, i) => {
            const affordable = shop.gold >= ware.price;
            return (
              <li
                key={ware.id}
                className={cn(
                  'relative flex items-center gap-4 border p-3.5',
                  ware.sold ? 'border-[rgba(217,173,98,0.14)] bg-[rgba(20,16,30,0.6)]' : 'border-[rgba(217,173,98,0.3)] bg-[rgba(26,21,39,0.9)]',
                )}
              >
                <img
                  src={ware.icon}
                  alt=""
                  className={cn('pixelated h-12 w-12 shrink-0', ware.sold && 'opacity-35 grayscale')}
                  draggable={false}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('font-display text-sm font-bold tracking-wide', ware.sold ? 'text-[#6f6580]' : 'text-[var(--bone)]')}>
                    {ware.name}
                  </p>
                  <p className="font-body text-xs leading-snug text-[#a89dbd]">{ware.desc}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <img src="/assets/icons/gold.png" alt="" className="pixelated h-4 w-4" draggable={false} />
                    <span className="font-body text-sm font-semibold tabular-nums text-[var(--gold)]">{ware.price}</span>
                  </span>
                  {ware.sold ? (
                    <span className="rb-sold-stamp">SOLD</span>
                  ) : (
                    <button
                      type="button"
                      disabled={!affordable}
                      onClick={() => { uiClick(); cmdShopBuy(i); }}
                      className="rb-btn !px-4 !py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Buy
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <button type="button" className="rb-btn rb-btn-primary mt-6" autoFocus onClick={() => { uiClick(); cmdShopClose(); }}>
          Leave
        </button>
      </div>
    </DialogShell>
  );
}
