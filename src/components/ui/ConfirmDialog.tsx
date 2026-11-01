'use client';

import React, { useEffect, useReducer, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { useDialogBehaviour } from './Modal';

export interface ConfirmOptions {
  message: string;
  title?: string;
  /** Red styling for destructive actions (deletes, wipes). */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingRequest extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

/**
 * In-app replacement for window.confirm(). Promise-based store: callers do
 * `if (!(await askConfirm({ ... }))) return;` while the single
 * <ConfirmDialogHost /> mounted by page.tsx renders the actual dialog with
 * backdrop-click + Escape close, focus trap and a danger variant.
 */
let seq = 0;
let pending: PendingRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  // Defensive: if a second confirm arrives while one is open, deny the new one.
  if (pending) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { ...options, id: ++seq, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  if (!pending) return;
  const current = pending;
  pending = null;
  emit();
  current.resolve(ok);
}

export const ConfirmDialogHost: React.FC = () => {
  const { t, lang } = useTranslation();
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = Boolean(pending);
  const requestId = pending?.id ?? 0;

  useEffect(() => {
    listeners.add(forceRender);
    return () => {
      listeners.delete(forceRender);
    };
  }, []);

  useDialogBehaviour(open, panelRef, () => settle(false), { autoFocusFirst: false });

  // Move focus into the dialog when it opens; land on Cancel (index 0) so the
  // keyboard default is never the destructive action.
  useEffect(() => {
    if (!open) return;
    const focusTarget = panelRef.current?.querySelectorAll<HTMLElement>('button')[0];
    focusTarget?.focus({ preventScroll: true });
  }, [requestId, open]);

  const request = pending;
  if (!request) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(false);
      }}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-in fade-in duration-150"
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title || request.message}
        tabIndex={-1}
        className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3">
          {request.danger && (
            <div className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
          )}
          <div className="min-w-0">
            {request.title && <h3 className="text-sm font-bold text-slate-100 mb-1">{request.title}</h3>}
            <p className="text-xs text-slate-300 leading-relaxed break-words">{request.message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => settle(false)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition active:scale-95"
          >
            {request.cancelLabel || t('btn_cancel')}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition active:scale-95 shadow-sm ${
              request.danger
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
            }`}
          >
            {request.confirmLabel || t('btn_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogHost;
