// Runtime-agnostic offline sync client.
//
// Deliberately has zero device/native dependencies: it orchestrates
//   collect local dirty rows -> POST /api/sync -> apply pulled rows -> advance cursor
// against an injected LocalStore. A WatermelonDB adapter, a Capacitor SQLite
// adapter, or a plain in-memory test double can all implement LocalStore.
//
// Types here mirror the server's /api/sync contract but are declared locally so
// the server's persistence layer (libsql) is never pulled into a client bundle.

export type SyncRow = Record<string, any> & { id: string };

export interface PushTablePayload {
  upsert?: SyncRow[];
  delete?: Array<{ id: string; updatedAt: number }>;
}

export type PushPayload = Record<string, PushTablePayload>;

export interface PulledTable {
  upsert: SyncRow[];
  deleted: string[];
}

export interface SyncResponseData {
  serverSeq: number;
  pulled: Record<string, PulledTable>;
  rejected?: Array<{ table: string; id: string; reason: string }>;
}

/** A device's local datastore, expressed as the minimum the sync loop needs. */
export interface LocalStore {
  /** Last serverSeq this device has acknowledged (pull cursor). */
  getSince(): number;
  /** Rows created/updated/deleted locally since the last successful sync. */
  collectDirty(): PushPayload | Promise<PushPayload>;
  /** Apply server changes; tombstones arrive as deleted ids. */
  applyPulled(pulled: Record<string, PulledTable>): void | Promise<void>;
  /** Commit the new cursor + clear dirty flags. Called only after a clean response. */
  markSynced(serverSeq: number): void | Promise<void>;
}

export interface SyncClientOptions {
  baseUrl: string;
  deviceId: string;
  fetchImpl?: typeof fetch;
  /** Authorization value for the API (session token / bearer). Sent as a header. */
  authToken?: string;
}

export interface SyncOutcome {
  serverSeq: number;
  pushedCount: number;
  pulledCount: number;
  rejected: NonNullable<SyncResponseData['rejected']>;
}

function countPush(pushed: PushPayload): number {
  let n = 0;
  for (const t of Object.keys(pushed)) {
    n += (pushed[t].upsert?.length || 0) + (pushed[t].delete?.length || 0);
  }
  return n;
}

function countPulled(pulled: Record<string, PulledTable>): number {
  let n = 0;
  for (const t of Object.keys(pulled)) n += (pulled[t].upsert?.length || 0) + (pulled[t].deleted?.length || 0);
  return n;
}

export async function syncOnce(
  store: LocalStore,
  opts: SyncClientOptions,
): Promise<SyncOutcome> {
  const doFetch = opts.fetchImpl ?? fetch;
  const pushed = await store.collectDirty();
  const since = store.getSince();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`;

  const res = await doFetch(`${opts.baseUrl.replace(/\/$/, '')}/api/sync`, {
    method: 'POST',
    headers,
    // cookie auth also works same-origin; bearer covers the bundled cross-origin client
    credentials: 'include',
    body: JSON.stringify({ deviceId: opts.deviceId, since, pushed }),
  });

  if (!res.ok) {
    throw new Error(`sync failed: ${res.status}`);
  }

  const json = await res.json();
  if (!json?.success) {
    throw new Error(json?.error || 'sync rejected');
  }

  const data = json.data as SyncResponseData;
  // Apply first, then advance the cursor only if applying didn't throw — so a
  // crash mid-apply leaves `since` unchanged and the pull is safely re-fetched.
  await store.applyPulled(data.pulled || {});
  await store.markSynced(data.serverSeq);

  return {
    serverSeq: data.serverSeq,
    pushedCount: countPush(pushed),
    pulledCount: countPulled(data.pulled || {}),
    rejected: data.rejected || [],
  };
}
