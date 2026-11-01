// One WatermelonDB instance shared by the fetch bridge and the sync runtime, so
// a row the UI writes via fetch('/api/...') is the exact row the next syncOnce()
// pushes. Kept out of the bridge itself so tests inject their own database.

import type { Database } from '@nozbe/watermelondb';
import { makeDatabase } from '@device/database';

let shared: Database | null = null;

export function getSharedDatabase(): Database {
  if (!shared) shared = makeDatabase();
  return shared;
}
