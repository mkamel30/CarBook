// Device write-event bus (A3).
//
// Every offline write funnels through the four functions in device/writer.ts
// (localCreate / localUpdate / localMarkDeleted / localRestore) — the single
// choke point. Each one calls notifyDeviceWrite() after a successful batch, and
// the sync runtime subscribes here to schedule a debounced push the instant a
// row changes. This replaces the old 800 ms outbox POLL as the primary trigger:
// the poll ran a COUNT per table ~1.25×/s while the app was open purely to notice
// writes that we can be told about for free. The poll stays, but demoted to a
// slow safety net (see syncBoot) so a dropped event can never strand rows.
//
// Deliberately tiny and dependency-free so it works identically in the WebView
// and under node/vitest. Listeners are invoked defensively: a throwing subscriber
// must not break the writer.

type WriteListener = () => void;

const listeners = new Set<WriteListener>();

/** Fire after a local row reached the outbox. Swallows listener errors. */
export function notifyDeviceWrite(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A faulty subscriber must never fail the write that already committed.
    }
  }
}

/** Subscribe to write events; returns a teardown. */
export function onDeviceWrite(cb: WriteListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test seam: drop every subscriber so a case never leaks listeners. */
export function __clearDeviceWriteListeners(): void {
  listeners.clear();
}
