import { TILE } from './config';

interface SightGrid {
  walkableAtPx(x: number, y: number): boolean;
}

/** Visit each crossed cell, including both sides of a corner crossing. */
export function gridLineOfSight(world: SightGrid, x: number, y: number, endX: number, endY: number): boolean {
  if (!world.walkableAtPx(x, y) || !world.walkableAtPx(endX, endY)) return false;
  let col = Math.floor(x / TILE);
  let row = Math.floor(y / TILE);
  const lastCol = Math.floor(endX / TILE);
  const lastRow = Math.floor(endY / TILE);
  const dx = endX - x;
  const dy = endY - y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const stepX = dx ? TILE / Math.abs(dx) : Infinity;
  const stepY = dy ? TILE / Math.abs(dy) : Infinity;
  let nextX = dx ? ((col + Number(dx > 0)) * TILE - x) / dx : Infinity;
  let nextY = dy ? ((row + Number(dy > 0)) * TILE - y) / dy : Infinity;
  while (col !== lastCol || row !== lastRow) {
    const crossX = col !== lastCol && (row === lastRow || nextX <= nextY);
    const crossY = row !== lastRow && (col === lastCol || nextY <= nextX);
    if (crossX && crossY && (!world.walkableAtPx((col + sx) * TILE, row * TILE) ||
        !world.walkableAtPx(col * TILE, (row + sy) * TILE))) return false;
    if (crossX) { col += sx; nextX += stepX; }
    if (crossY) { row += sy; nextY += stepY; }
    if (!world.walkableAtPx(col * TILE, row * TILE)) return false;
  }
  return true;
}
