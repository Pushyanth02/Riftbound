'use client';

/* Minimap: canvas rendering of the discovered dungeon layout.
   Corridors only appear once one of their rooms has been discovered;
   special room contents carry icons; the player dot points where you head. */

import { useEffect, useRef } from 'react';
import type { MinimapData } from '@/game/types';

const W = 208;
const H = 150;

const COLOR = {
  corridor: '#221d2e',
  room: '#2a2538',
  roomCurrent: '#463d5e',
  roomBorder: '#544b68',
  currentBorder: '#d9ad62',
  clearedWash: 'rgba(217,173,98,0.16)',
  boss: '#d95252',
  bossCore: '#26101c',
  exit: '#d9ad62',
  treasure: '#9868e8',
  start: '#65d9d0',
  merchant: '#d9ad62',
  merchantCore: '#7c5c2a',
  champion: '#e0684f',
  boon: '#b48cf0',
  shrine: '#65d9d0',
  bone: '#e8dcc9',
};

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, fill: boolean): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawStar4(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  const outer = 3.6;
  const inner = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outer);
  ctx.lineTo(cx + inner, cy - inner);
  ctx.lineTo(cx + outer, cy);
  ctx.lineTo(cx + inner, cy + inner);
  ctx.lineTo(cx, cy + outer);
  ctx.lineTo(cx - inner, cy + inner);
  ctx.lineTo(cx - outer, cy);
  ctx.lineTo(cx - inner, cy - inner);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawMinimap(canvas: HTMLCanvasElement, data: MinimapData, scale: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  /* render at a higher internal resolution in large mode instead of
     scaling the layout math (which would overflow the canvas bounds) */
  const width = Math.round(W * scale * dpr);
  const height = Math.round(H * scale * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (data.width <= 0 || data.height <= 0) return;
  const pad = 8;
  const s = Math.min((W - pad * 2) / data.width, (H - pad * 2) / data.height);
  const ox = (W - data.width * s) / 2;
  const oy = (H - data.height * s) / 2;

  /* corridors first (under rooms) — hidden until a connected room is found */
  for (const c of data.corridors) {
    const roomA = data.rooms[c.roomA];
    const roomB = data.rooms[c.roomB];
    if (!roomA?.discovered && !roomB?.discovered) continue;
    ctx.fillStyle = COLOR.corridor;
    ctx.fillRect(ox + c.x * s, oy + c.y * s, Math.max(1, c.w * s), Math.max(1, c.h * s));
  }

  for (const r of data.rooms) {
    if (!r.discovered) continue;
    const x = ox + r.x * s;
    const y = oy + r.y * s;
    const w = Math.max(3, r.w * s);
    const h = Math.max(3, r.h * s);
    ctx.fillStyle = r.current ? COLOR.roomCurrent : COLOR.room;
    ctx.fillRect(x, y, w, h);
    if (r.current) {
      ctx.strokeStyle = COLOR.currentBorder;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    } else {
      ctx.strokeStyle = COLOR.roomBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    }
    if (r.cleared) {
      ctx.fillStyle = COLOR.clearedWash;
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = COLOR.boss;
    for (const t of r.lockedTiles) ctx.fillRect(ox + t.x * s, oy + t.y * s, Math.max(1, s), Math.max(1, s));
    const cx = x + w / 2;
    const cy = y + h / 2;

    /* room-type markers */
    if (r.type === 'boss') {
      ctx.fillStyle = COLOR.boss;
      ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
      ctx.fillStyle = COLOR.bossCore;
      ctx.fillRect(cx - 0.8, cy - 0.8, 1.6, 1.6);
    } else if (r.type === 'exit') {
      ctx.strokeStyle = COLOR.exit;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (r.type === 'treasure') {
      drawDiamond(ctx, cx, cy, 3.4, COLOR.treasure, true);
    } else if (r.type === 'start') {
      ctx.fillStyle = COLOR.start;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    /* content markers (the scene can set these dynamically) */
    if (r.icon === 'merchant') {
      ctx.fillStyle = COLOR.merchant;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR.merchantCore;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (r.icon === 'champion') {
      drawDiamond(ctx, cx, cy, 3.6, COLOR.champion, false);
      ctx.fillStyle = COLOR.champion;
      ctx.beginPath();
      ctx.arc(cx, cy, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (r.icon === 'boon') {
      drawStar4(ctx, cx, cy, COLOR.boon);
    } else if (r.icon === 'shrine') {
      ctx.fillStyle = COLOR.shrine;
      ctx.fillRect(cx - 0.8, cy - 3, 1.6, 6);
      ctx.fillRect(cx - 3, cy - 0.8, 6, 1.6);
    }
  }

  /* player: pulsing dot with a heading wedge */
  const px = ox + data.player.x * s;
  const py = oy + data.player.y * s;
  const pulse = 2.6 + Math.sin(performance.now() / 260) * 0.7;
  const heading = data.player.heading ?? 0;
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  ctx.fillStyle = COLOR.bone;
  ctx.beginPath();
  ctx.arc(px, py, 2.4, 0, Math.PI * 2);
  ctx.fill();
  /* small triangle pointing the way the player faces */
  ctx.beginPath();
  ctx.moveTo(px + dx * 11, py + dy * 11);
  ctx.lineTo(px + dx * 5 - dy * 3, py + dy * 5 + dx * 3);
  ctx.lineTo(px + dx * 5 + dy * 3, py + dy * 5 - dx * 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,220,201,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px, py, pulse + 1.6, 0, Math.PI * 2);
  ctx.stroke();
}

const LEGEND: { color: string; label: string; ring?: boolean }[] = [
  { color: '#d95252', label: 'Boss' },
  { color: '#e0684f', label: 'Champion' },
  { color: '#9868e8', label: 'Treasure' },
  { color: '#d9ad62', label: 'Merchant' },
  { color: '#b48cf0', label: 'Boon' },
  { color: '#65d9d0', label: 'Shrine' },
  { color: '#d95252', label: 'Sealed gate' },
  { color: '#e8cf9a', label: 'Exit', ring: true },
];

export default function MinimapCanvas({ data, large }: { data: MinimapData | null; large: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    drawMinimap(canvasRef.current, data, large ? 1.9 : 1);
  }, [data, large]);

  if (!data) return null;

  if (large) {
    return (
      <div className="anim-scale-in fixed inset-0 z-[8] grid place-items-center bg-[rgba(10,7,15,0.72)]">
        <div className="rb-panel p-4">
          <p className="rb-smallcaps mb-2 text-center text-[11px] text-[var(--gold)]">The Descent So Far</p>
          <canvas
            ref={canvasRef}
            className="pixelated block"
            style={{ width: W * 1.9, height: H * 1.9 }}
            aria-label="Dungeon minimap"
            role="img"
          />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {LEGEND.map((entry) => (
              <span key={entry.label} className="inline-flex items-center gap-1 text-[10px] text-[var(--bone)]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={entry.ring ? { border: '1.5px solid #e8cf9a' } : { background: entry.color }}
                />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="pixelated block"
      style={{ width: W, height: H }}
      aria-label="Dungeon minimap"
      role="img"
    />
  );
}
