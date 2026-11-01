'use client';

import React, { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Basic focus management for dialogs/sheets: remembers the previously focused
 * element, moves focus into the panel on open (first field by default), and
 * contains Tab / Shift+Tab within it. Escape invokes onClose.
 */
export function useDialogBehaviour(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
  opts: { autoFocusFirst?: boolean } = {},
) {
  const { autoFocusFirst = true } = opts;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (autoFocusFirst) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!active || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open, panelRef, onClose, autoFocusFirst]);
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible name for the dialog (visible title text works well). */
  ariaLabel: string;
  /** Classes for the inner sheet/panel (replaces the old duplicated panel wrapper). */
  panelClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared modal shell: backdrop-tap close, Escape close, role="dialog"
 * aria-modal="true" and a basic focus trap on open. Used by the AddVehicle,
 * FuelLog and MaintenanceLog sheets.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, ariaLabel, panelClassName = '', children }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehaviour(isOpen, panelRef, onClose);

  const onBackdropMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={onBackdropMouseDown}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto shadow-2xl outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
