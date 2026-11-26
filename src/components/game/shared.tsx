'use client';

/* Shared primitives for the Riftbound UI layer: themed building blocks
   used across menus, panels, and dialogs. */

import { useEffect, useRef, type ReactNode } from 'react';
import { gameAudio } from '@/game/audio';
import { cn } from '@/lib/utils';

/** Menu-style click feedback (requires audio unlocked by a prior gesture). */
export function uiClick(): void {
  gameAudio.play('click');
}

/** Formats a run duration as mm:ss (minutes unbounded). */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Gold L-shaped corner brackets (8px) for the double-frame panel look. */
export function Corners() {
  const base = 'pointer-events-none absolute h-[8px] w-[8px] border-[var(--gold)]';
  return (
    <>
      <span aria-hidden="true" className={cn(base, 'left-[3px] top-[3px] border-l border-t')} />
      <span aria-hidden="true" className={cn(base, 'right-[3px] top-[3px] border-r border-t')} />
      <span aria-hidden="true" className={cn(base, 'bottom-[3px] left-[3px] border-b border-l')} />
      <span aria-hidden="true" className={cn(base, 'bottom-[3px] right-[3px] border-b border-r')} />
    </>
  );
}

/** Keycap-styled key label. */
export function Keycap({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('rb-keycap', className)}>{children}</kbd>;
}

/** Thin gold hairlines meeting at a diamond - the gothic rule ornament. */
export function GoldRule({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex w-full max-w-[230px] items-center gap-3', className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[rgba(217,173,98,0.55)]" />
      <span className="block h-[6px] w-[6px] rotate-45 border border-[var(--gold)]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[rgba(217,173,98,0.55)]" />
    </span>
  );
}

interface DialogShellProps {
  children: ReactNode;
  /** Accessible name of the dialog. */
  label: string;
  /** Called when Escape is pressed while the dialog is open. */
  onEsc?: () => void;
  /** Tailwind z-index tier for the overlay. */
  z?: string;
  /** Backdrop classes (color / blur / tint). */
  backdrop?: string;
  /** Extra classes for the centered dialog box. */
  className?: string;
}

/**
 * Full-screen modal wrapper: dimmed backdrop, role="dialog" with
 * aria-modal, focuses the first actionable button on mount and
 * optionally handles Escape.
 */
export function DialogShell({
  children,
  label,
  onEsc,
  z = 'z-30',
  backdrop = 'bg-[rgba(10,7,15,0.72)]',
  className,
}: DialogShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>('button:not([disabled])');
    first?.focus();
  }, []);

  useEffect(() => {
    if (!onEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEsc();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEsc]);

  return (
    <div className={cn('fixed inset-0 grid place-items-center p-4 sm:p-6', z)}>
      <div aria-hidden="true" className={cn('anim-fade-in absolute inset-0', backdrop)} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn('anim-scale-in relative', className)}
      >
        {children}
      </div>
    </div>
  );
}
