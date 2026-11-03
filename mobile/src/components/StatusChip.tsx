import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@app/i18n/context';
import { useDialogBehaviour } from '@app/components/ui/Modal';
import type { SyncBoot, SyncState, SyncPhase } from '../offline/syncBoot';

// A tiny offline/synced status indicator for the app shell. The shared web UI is
// Tailwind-driven, but this widget lives in the Capacitor shell (no Tailwind
// pipeline), so it is fully styled inline using the app's own Material tokens
// (slate-900 surface #0f172a, amber/emerald/rose accents) to honour the
// "style every widget" rule.
//
// TWO STATES (owner item 10). Collapsed — the default and the resting state — is
// ONLY the coloured status dot: automatic sync (offline/syncBoot.ts) means the
// user never has to tap to upload, so the chip must stop spending its time as a
// banner across the app. Tapping the dot expands a small details panel (status
// line, auth-handoff note, last sync, queued items, the auto-sync explanation and
// a manual "sync now" action). Dismiss by tapping the dot again, tapping outside,
// or Escape.
//
// GEOMETRY of the collapsed dot. Nothing fixed near the top edge can be
// guaranteed pixel-free on a scrolling page, so the rule applied here is: the
// dot's whole footprint must sit in chrome gutters and card *padding*, never on a
// control. Vertically it starts below the sticky MobileTopBar's trailing buttons
// (alerts / language / settings / account, which end ~3.6rem under the inset);
// horizontally it hugs the very edge inside the page's own gutter (the tab body is
// padded 1rem and its cards pad another 0.75–1rem, so no button ever lives in the
// outer ~1.6rem of the inline end). That replaces the old 6.5rem banner position,
// which landed on top of the tab body's content — including the urgent-maintenance
// banner's action button. `env(safe-area-inset-*)` is kept on both axes.

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

const PENDING_REFRESH_MS = 2000;

/** Visually hidden but announced: keeps aria-live status changes reachable. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

function formatSyncTime(ms: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
      .format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function StatusChip({ boot }: { boot: SyncBoot }) {
  const { t, lang } = useTranslation();
  const [state, setState] = useState<SyncState>(boot.getStatus());
  const [note, setNote] = useState<ChipNote | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(boot.getStatus().pendingCount);
  const dotRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      boot.subscribe((s) => {
        setState(s);
        setPending(s.pendingCount);
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
        setOpen(true);
      } else if (detail?.kind === 'unauthorized') {
        setNote({ key: detail.guest ? 'handoff_signin_required' : 'handoff_session_ended' });
        setOpen(true);
      } else if (detail?.kind === 'signedin') {
        setNote(null);
      }
    };
    window.addEventListener('carbook:handoff', handler);
    return () => window.removeEventListener('carbook:handoff', handler);
  }, []);

  // The queue figure only matters while the details are open, and the boot's own
  // watcher is off when automatic post-write sync is disabled — so read it here.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const refresh = () => {
      boot
        .pendingCount()
        .then((n) => { if (alive) setPending(n); })
        .catch(() => { if (alive) setPending(null); });
    };
    refresh();
    const id = setInterval(refresh, PENDING_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open, boot]);

  const collapse = () => setOpen(false);
  // Escape closes, focus moves into the panel and stays there, and focus is
  // restored to the dot afterwards — the same conventions the app's modals use.
  useDialogBehaviour(open, panelRef, collapse, { autoFocusFirst: true });

  // Tap-outside dismiss. Capture phase, and the dot itself is excluded so the
  // pointerdown does not both close the panel and re-open it via `click`.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || dotRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const palette = note ? PALETTE.error : PALETTE[state.phase];
  const spinning = !note && state.phase === 'syncing';
  const statusLine = note ? t(note.key, note.vars) : t(state.messageKey, state.messageVars);
  const hint = t('sync_tap_hint');

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        // Collapsed dot: past the sticky top bar's buttons, inside the inline-end
        // gutter. See the GEOMETRY note above (the old 6.5rem banner position sat
        // on top of the tab body's content).
        top: 'calc(3.9rem + env(safe-area-inset-top))',
        insetInlineEnd: 'calc(0.15rem + env(safe-area-inset-right))',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '0.4rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <button
        ref={dotRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? 'carbook-sync-panel' : undefined}
        aria-label={hint}
        title={hint}
        style={{
          inlineSize: '1.9rem',
          blockSize: '1.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          borderRadius: 9999,
          background: 'rgba(15,23,42,0.85)',
          border: `1px solid ${palette.border}`,
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(6px)',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            inlineSize: '0.625rem',
            blockSize: '0.625rem',
            borderRadius: '9999px',
            background: palette.dot,
            boxShadow: `0 0 6px ${palette.dot}`,
            animation: spinning ? 'carbook-chip-pulse 0.9s ease-in-out infinite' : undefined,
          }}
        />
        {/* Screen-reader status line: the dot carries no text, so aria-live has
            something to announce when the phase changes. */}
        <span style={SR_ONLY}>{statusLine}</span>
      </button>

      {open ? (
        <div
          id="carbook-sync-panel"
          ref={panelRef}
          role="dialog"
          aria-label={t('sync_details_title')}
          tabIndex={-1}
          style={{
            inlineSize: 'min(20rem, calc(100vw - 1.5rem))',
            maxBlockSize: 'calc(100vh - 12rem)',
            overflowY: 'auto',
            padding: '0.7rem 0.8rem',
            borderRadius: '0.9rem',
            fontSize: '0.72rem',
            lineHeight: 1.45,
            color: '#e2e8f0',
            background: 'rgba(15,23,42,0.96)',
            border: `1px solid ${palette.border}`,
            boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(10px)',
            outline: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700, color: palette.text }}>{t('sync_details_title')}</span>
            <button
              type="button"
              onClick={collapse}
              style={btnStyle('#334155', '#e2e8f0')}
            >
              {t('sync_collapse')}
            </button>
          </div>

          <p style={{ margin: '0.5rem 0 0', color: palette.text, fontWeight: 600 }}>{statusLine}</p>

          {state.lastSyncedAt ? (
            <p style={{ margin: '0.35rem 0 0', color: '#94a3b8' }}>
              {t('sync_last_at', { time: formatSyncTime(state.lastSyncedAt, lang) })}
            </p>
          ) : null}

          {pending !== null ? (
            <p style={{ margin: '0.25rem 0 0', color: pending > 0 ? '#fcd34d' : '#94a3b8' }}>
              {t('sync_pending', { count: pending })}
            </p>
          ) : null}

          <p style={{ margin: '0.45rem 0 0', color: '#94a3b8' }}>{t('sync_auto_note')}</p>

          <button
            type="button"
            onClick={() => boot.syncNow().catch(() => {})}
            style={{ ...btnStyle('#f59e0b', '#0f172a'), fontWeight: 700, marginTop: '0.55rem' }}
          >
            {t('sync_btn_now')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function btnStyle(background: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.6rem',
    borderRadius: 9999,
    fontSize: '0.68rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    color,
    background,
    border: '1px solid rgba(148,163,184,0.35)',
    cursor: 'pointer',
  };
}

export default StatusChip;
