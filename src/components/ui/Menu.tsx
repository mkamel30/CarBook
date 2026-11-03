'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { useDialogBehaviour } from './Modal';

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

export interface MenuProps {
  /** Accessible name + tooltip of the trigger button. */
  triggerLabel: string;
  /** Icon/label rendered inside the trigger button. */
  triggerContent: React.ReactNode;
  /** Extra classes for the trigger so each header can size its own control. */
  triggerClassName?: string;
  /** Extra classes for the wrapper (used by the sidebar for full-width rows). */
  containerClassName?: string;
  /** aria-label of the opened panel (`role="menu"`). */
  ariaLabel: string;
  /** Optional visible heading row inside the panel. */
  title?: string;
  /** Optional explainer line rendered under the items. */
  hint?: string;
  /**
   * Which edge the panel aligns to. `end` (default) anchors it to the trailing
   * edge of the trigger — `left-0` in RTL, `right-0` in LTR, like the vehicle
   * menu in OverviewTab. `start` anchors to the leading edge instead, which
   * keeps left-hand triggers (the vehicle switcher) inside the viewport.
   */
  align?: 'start' | 'end';
  /** Extra classes for the panel. */
  panelClassName?: string;
  /**
   * Which side the panel opens on. `down` (default) for top chrome, `up` for
   * triggers pinned to the bottom of a column so the panel never leaves the
   * viewport.
   */
  drop?: 'down' | 'up';
  children: React.ReactNode;
}

/**
 * Small reusable dropdown primitive for header chrome (language, account,
 * vehicle switching).
 *
 * Behaviour kept in one place so every header gets the same contract:
 * - trigger is a real button with `aria-haspopup="menu"` + `aria-expanded`;
 * - panel is `role="menu"` with a labelled name;
 * - Escape closes and returns focus to the trigger, Tab stays inside the
 *   panel: both reused from `useDialogBehaviour` (Modal.tsx) with
 *   `autoFocusFirst: false`, exactly like ConfirmDialog;
 * - ArrowUp/ArrowDown (+ Home/End) walk the `role="menuitem"` rows with wrap;
 * - a mousedown outside the trigger/panel closes it (same pattern as the
 *   inline handler in OverviewTab);
 * - clicking any item closes the menu, so callers never have to.
 */
export const Menu: React.FC<MenuProps> = ({
  triggerLabel,
  triggerContent,
  triggerClassName = '',
  containerClassName = '',
  ariaLabel,
  title,
  hint,
  align = 'end',
  panelClassName = '',
  drop = 'down',
  children,
}) => {
  const { dir } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDialogBehaviour(open, panelRef, close, { autoFocusFirst: false });

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const items = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []);

  const focusItemAt = (index: number) => {
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length].focus({ preventScroll: true });
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const current = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(current <= 0 ? list.length - 1 : current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItemAt(list.length - 1);
    }
  };

  // The trigger keeps focus when the menu is opened with a tap, so the arrow
  // keys have to be handled there too before the first item is focused.
  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(items().length - 1);
    }
  };

  const endAlign = dir === 'rtl' ? 'left-0' : 'right-0';
  const startAlign = dir === 'rtl' ? 'right-0' : 'left-0';
  const alignClass = align === 'start' ? startAlign : endAlign;
  const dropClass =
    drop === 'up' ? 'bottom-full mb-1.5 max-h-[45vh]' : 'top-full mt-1.5 max-h-[70vh]';

  return (
    <div ref={containerRef} className={`relative shrink-0 ${containerClassName}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={triggerClassName}
      >
        {triggerContent}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest(MENU_ITEM_SELECTOR)) setOpen(false);
          }}
          className={`absolute ${dropClass} w-56 max-w-[calc(100vw-1.5rem)] overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl z-40 py-1.5 backdrop-blur-md outline-none animate-in fade-in zoom-in-95 duration-100 ${alignClass} ${panelClassName}`}
        >
          {title && (
            <p className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {title}
            </p>
          )}
          {children}
          {hint && (
            <p className="mt-1.5 mx-1.5 px-2 pt-2 border-t border-slate-800 text-[10px] leading-relaxed text-slate-500">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export interface MenuItemProps {
  /** Omit for a static info row (the signed-in identity line): it stays out of the arrow-key loop. */
  onClick?: () => void;
  /** Leading icon slot (kept at a fixed width so rows align). */
  icon?: React.ReactNode;
  /** Marks the active row: renders the Check icon and sets `aria-current`. */
  selected?: boolean;
  /** Red styling for destructive rows (sign out, delete). */
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const MenuItem: React.FC<MenuItemProps> = ({
  onClick,
  icon,
  selected = false,
  danger = false,
  className = '',
  children,
}) => {
  const isAction = Boolean(onClick);
  const rowClass = `w-full flex items-center gap-2.5 px-3.5 py-2 text-start text-xs font-medium transition ${
    isAction
      ? danger
        ? 'text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 active:scale-[0.99]'
        : 'text-slate-200 hover:bg-slate-800/80 hover:text-amber-400 active:scale-[0.99]'
      : 'text-slate-400 cursor-default'
  } ${className}`;

  const rowBody = (
    <>
      {icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {selected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
    </>
  );

  if (!isAction) {
    // Static info row (e.g. "Signed in as X"): not focusable, so the
    // ArrowUp/ArrowDown loop only walks real actions.
    return <div className={rowClass}>{rowBody}</div>;
  }

  return (
    <button
      type="button"
      role="menuitem"
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      className={rowClass}
    >
      {rowBody}
    </button>
  );
};

export default Menu;
