import { useEffect, useRef } from 'react';
import { pushOverlay } from './overlayStack';

/**
 * Keep an overlay on the Back stack while it is open (§4).
 *
 * `onClose` is usually a fresh inline arrow every render; registering it directly
 * would tear down and re-push on each render and scramble the LIFO order for
 * nested overlays. So we register a STABLE wrapper (keyed only on `open`) that
 * always calls the latest callback through a ref.
 *
 * Call it once per closable overlay: `useOverlayRegistration(showX, () => setShowX(false))`.
 */
export function useOverlayRegistration(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    return pushOverlay(() => closeRef.current());
  }, [open]);
}
