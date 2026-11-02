import { useEffect, useState } from 'react';
import { useTranslation } from '@app/i18n/context';
import type { SyncBoot, SyncState, SyncPhase } from '../offline/syncBoot';

// A tiny offline/synced status chip for the app shell. The shared web UI is
// Tailwind-driven, but this widget lives in the Capacitor shell (no Tailwind
// pipeline), so it is fully styled inline using the app's own Material tokens
// (slate-900 surface #0f172a, amber/emerald/rose accents) to honour the
// "style every widget" rule.

interface Palette {
  dot: string;
  border: string;
  text: string;
}

const PALETTE: Record<SyncPhase, Palette> = {
  idle: { dot: '#64748b', border: 'rgba(100,116,139,0.5)', text: '#cbd5e1' },
  offline: { dot: '#f59e0b', border: 'rgba(245,158,11,0.55)', text: '#fcd34d' },
  syncing: { dot: '#38bdf8', border: 'rgba(56,189,248,0.55)', text: '#bae6fd' },
  synced: { dot: '#10b981', border: 'rgba(16,185,129,0.55)', text: '#a7f3d0' },
  error: { dot: '#f43f5e', border: 'rgba(244,63,94,0.55)', text: '#fecdd3' },
};

type ChipNote = { key: string; vars?: Record<string, string | number> };

export function StatusChip({ boot }: { boot: SyncBoot }) {
  const { t } = useTranslation();
  const [state, setState] = useState<SyncState>(boot.getStatus());
  const [note, setNote] = useState<ChipNote | null>(null);

  useEffect(
    () =>
      boot.subscribe((s) => {
        setState(s);
        if (s.phase === 'synced') setNote(null);
      }),
    [boot],
  );

  // Auth handoff outcomes (mobile/src/main.tsx): a failed code redemption or a
  // burned bearer must be visible, never a silent half-login. Held as a
  // dictionary key so switching language re-labels the chip immediately.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { kind?: string; stage?: string; reason?: string; guest?: boolean }
        | undefined;
      if (detail?.kind === 'failed') {
        setNote({ key: 'handoff_login_failed', vars: { stage: detail.stage ?? '', reason: detail.reason ?? '' } });
      } else if (detail?.kind === 'unauthorized') {
        setNote({ key: detail.guest ? 'handoff_signin_required' : 'handoff_session_ended' });
      } else if (detail?.kind === 'signedin') {
        setNote(null);
      }
    };
    window.addEventListener('carbook:handoff', handler);
    return () => window.removeEventListener('carbook:handoff', handler);
  }, []);

  const palette = note ? PALETTE.error : PALETTE[state.phase];
  const spinning = !note && state.phase === 'syncing';

  return (
    <button
      type="button"
      onClick={() => boot.syncNow().catch(() => {})}
      aria-live="polite"
      title={t('sync_tap_hint')}
      style={{
        position: 'fixed',
        // Below the sticky top bar AND the content's pill row, so the chip
        // never covers interactive UI (it used to sit on the header row).
        top: 'calc(6.5rem + env(safe-area-inset-top))',
        insetInlineEnd: 'calc(0.75rem + env(safe-area-inset-right))',
        zIndex: 80,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        maxInlineSize: 'min(70vw, 20rem)',
        padding: '0.3rem 0.6rem',
        borderRadius: 9999,
        fontSize: '0.7rem',
        fontWeight: 600,
        lineHeight: 1.2,
        fontFamily: 'system-ui, sans-serif',
        color: palette.text,
        background: 'rgba(15,23,42,0.92)',
        border: `1px solid ${palette.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          inlineSize: '0.5rem',
          blockSize: '0.5rem',
          borderRadius: '9999px',
          background: palette.dot,
          flexShrink: 0,
          boxShadow: `0 0 6px ${palette.dot}`,
          animation: spinning ? 'carbook-chip-pulse 0.9s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {note ? t(note.key, note.vars) : t(state.messageKey, state.messageVars)}
      </span>
    </button>
  );
}

export default StatusChip;
