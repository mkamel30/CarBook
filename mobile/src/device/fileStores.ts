// File-backed adapters for the runtime's persistence interfaces — for Node (vitest,
// future CLI tooling) only. The Capacitor build must swap these for a Preferences-
// or Keystore-backed SessionStore/DeviceIdStore (WP3 wires that at the auth handoff);
// nothing in runtime.ts or the app data layer imports this module.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionStore, StoredSession } from './session';
import type { DeviceIdStore } from './runtime';

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    if (err instanceof SyntaxError) return null; // torn file — treat as empty
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), 'utf8');
}

/** StoredSession persisted as JSON at `file`. */
export function makeFileSessionStore(file: string): SessionStore {
  return {
    async load() {
      return readJson<StoredSession>(file);
    },
    async save(session) {
      await writeJson(file, session);
    },
    async clear() {
      await fs.rm(file, { force: true });
    },
  };
}

/** Device id persisted as JSON at `file`. */
export function makeFileDeviceIdStore(file: string): DeviceIdStore {
  return {
    async load() {
      const v = await readJson<{ deviceId?: string }>(file);
      return v?.deviceId ?? null;
    },
    async save(deviceId) {
      await writeJson(file, { deviceId });
    },
  };
}
