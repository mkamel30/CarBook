import { I18nProvider } from '@app/i18n/context';
import { ThemeProvider } from '@app/theme/context';
import WorkbenchPage from '@app/app/page';
import { StatusChip } from './components/StatusChip';
import type { SyncBoot } from './offline/syncBoot';

// The Capacitor shell. It does NOT reimplement any UI: it mounts the SAME
// providers the web layout uses (ThemeProvider > I18nProvider, mirroring
// src/app/layout.tsx) around the REAL shared page component imported from
// '@app/app/page'. dir/lang are driven by I18nProvider at runtime, not by the
// hardcoded index.html default. The offline fetch bridge (patched in main.tsx)
// answers the page's /api fetches from WatermelonDB; the WP2 sync runtime boots
// in main.tsx and reports through the status chip.

interface AppProps {
  boot: SyncBoot | null;
}

export default function App({ boot }: AppProps) {
  return (
    <>
      {/* Keyframes for the sync chip (styled inline; Tailwind covers the shared UI). */}
      <style>{`@keyframes carbook-chip-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <ThemeProvider>
        <I18nProvider>
          <WorkbenchPage />
          {boot ? <StatusChip boot={boot} /> : null}
        </I18nProvider>
      </ThemeProvider>
    </>
  );
}
