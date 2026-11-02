'use client';

import React, { useEffect, useReducer, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

/**
 * Tiny pub/sub toast store so any component (page, tabs, modals) can raise a
 * message without prop-drilling. The single <ToastViewport /> mounted by
 * page.tsx renders the queue; entries auto-dismiss.
 */
let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function pushToast(message: string, variant: ToastVariant = 'success', ttlMs = 4200) {
  if (!message) return;
  const id = ++seq;
  items = [...items, { id, message, variant }].slice(-4);
  emit();
  setTimeout(() => dismissToast(id), ttlMs);
}

export const ToastViewport: React.FC = () => {
  const { t: translateToast } = useTranslation();
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [dir, setDir] = useState<'rtl' | 'ltr'>('ltr');

  useEffect(() => {
    listeners.add(forceRender);
    setDir(document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr');
    const observer = new MutationObserver(() => {
      setDir(document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    return () => {
      listeners.delete(forceRender);
      observer.disconnect();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-x-0 bottom-24 md:bottom-8 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none print:hidden"
      role="region"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.variant === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto w-full max-w-md flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-medium shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 ${
            t.variant === 'error'
              ? 'bg-rose-950/90 border-rose-700 text-rose-100'
              : 'bg-emerald-950/90 border-emerald-700 text-emerald-100'
          }`}
        >
          {t.variant === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 min-w-0 break-words leading-relaxed">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label={translateToast('aria_dismiss')}
            className={`shrink-0 p-0.5 rounded transition hover:bg-white/10 ${
              t.variant === 'error' ? 'text-rose-300' : 'text-emerald-300'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastViewport;
