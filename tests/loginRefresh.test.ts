import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Contract test for the login data-refresh bug: after the Google handoff the
 * shell re-pulls the account rows into the local DB, then fires the
 * `carbook:handoff {kind:'signedin'}` event. The shared page must RE-READ the
 * vehicle list on that event (it previously only re-read auth), otherwise the
 * freshly synced data stays invisible until a full reload — which is exactly why
 * the owner saw data only after logging out.
 *
 * No DOM environment exists in this repo (no jsdom / testing-library), so — like
 * the other UI-only fixes — the contract is asserted against the source that
 * carries the fix, not a rendered tree.
 */
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE_SRC = read('src/app/page.tsx');
const SHELL_SRC = read('mobile/src/main.tsx');

describe('signed-in handoff refreshes the vehicle list', () => {
  it('the signedin branch calls BOTH loadAuth() and loadVehicles()', () => {
    const idx = PAGE_SRC.indexOf("detail?.kind === 'signedin'");
    expect(idx, 'signedin handoff branch present').toBeGreaterThan(-1);
    const branch = PAGE_SRC.slice(idx, idx + 240);
    expect(branch).toMatch(/loadAuth\(\)/);
    expect(branch).toMatch(/loadVehicles\(\)/);
  });

  it('the shell re-pulls BEFORE it announces the sign-in', () => {
    // onLinked rewinds the cursor and syncs; the signedin note must fire only
    // after the awaited handoff, so the rows already exist when loadVehicles runs.
    expect(SHELL_SRC).toMatch(/sinceStore\.save\(0\)/);
    expect(SHELL_SRC).toMatch(/syncNow\(\)/);
    const signedin = SHELL_SRC.indexOf("kind: 'signedin'");
    const handoff = SHELL_SRC.indexOf('runAccountHandoff');
    expect(signedin).toBeGreaterThan(-1);
    expect(handoff).toBeGreaterThan(-1);
    expect(signedin).toBeGreaterThan(handoff);
  });
});
