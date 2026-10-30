# CarBook Architecture & Technical Specification

> **Version:** 2.0.0
> **Target:** Self-hosted web application with an offline-capable device client
> **Core principle:** Your data lives in one SQLite file you control. AI features are opt-in. Nothing phones home.

---

## 1. Why it is shaped this way

CarBook began as a single-user local tool: one Next.js process, one SQLite file, no accounts. It then grew two things the original design did not anticipate — a multi-account server deployment and a phone client that must work without a network.

Both additions were made without giving up the original property. There is still exactly one SQLite file, there is still no third-party backend service, and the AI providers are still strictly opt-in behind server-side endpoints. What changed is that rows now carry an owner, a version and a sync cursor.

Two consequences worth stating up front, because they explain several design choices below:

- **Offline is a data-shape problem, not a UI problem.** A client that can be offline for a week needs per-row versions, tombstones and a monotonic cursor. Half of the schema exists to serve that.
- **Tenancy came after the schema did.** So ownership is enforced in the application layer, and legacy rows with no owner are deliberately invisible rather than shared.

---

## 2. Layers

```
┌────────────────────────────────────────────────────────────────┐
│ Presentation        Next.js 15 App Router · React 19 · Tailwind │
│                     theme context (4) · i18n context (3 locales) │
└───────────────────────────────┬────────────────────────────────┘
                                │ fetch, JSON envelope
┌───────────────────────────────▼────────────────────────────────┐
│ API                 16 route handlers under src/app/api/         │
│                     auth · vehicles · fuel · maintenance ·        │
│                     schedules · reports · settings · backup ·     │
│                     sync · ai/{lookup,manual,doctor}              │
└───────────────────────────────┬────────────────────────────────┘
                                │ requireUser / requireOwnership
┌───────────────────────────────▼────────────────────────────────┐
│ Services            calculator · ai · aiOrchestrator ·            │
│                     automotiveDatabase · exportExcel · backup ·   │
│                     auth · authz · deviceAuth · notifications     │
└───────────────────────────────┬────────────────────────────────┘
                                │ Zod parse on every write
┌───────────────────────────────▼────────────────────────────────┐
│ Domain              src/domain/schemas.ts — the single definition │
│                     of what a valid vehicle, fill, invoice or     │
│                     factory-spec record looks like                │
└───────────────────────────────┬────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────┐
│ Persistence         db.ts (connection + migrations) ·             │
│                     repository.ts (Drizzle reads) ·               │
│                     sync.ts (parameterised SQL, transactions)     │
│                     SQLite via @libsql/client                     │
└─────────────────────────────────────────────────────────────────┘
```

Alongside it, a second application:

```
mobile/               Vite + React 18 + WatermelonDB 0.28 + LokiJS
  src/device/           localStore.ts (dirty tracking, cursor, conflict rules)
                        session.ts (device id, token storage, refresh)
                        schema.ts · models.ts · database.ts · writer.ts
  src/                  App.tsx, main.tsx
```

It is a separate project with its own `package.json`, `tsconfig.json` and Vitest config — but it does **not** duplicate the sync protocol. `mobile/src/device/localStore.ts` imports `src/sync/client.ts` from the parent repository through a relative path (`../../../src/sync/client`), which is why `mobile/vite.config.ts` sets `server.fs.allow: ['..']` and why the root `npm test` collects the mobile tests too. One contract, one implementation, two consumers.

---

## 3. Persistence

**SQLite through `@libsql/client`.** Chosen deliberately: it is a pure-JS/WSM client, so `npm install` needs no C++ toolchain on Windows, Linux or macOS. `better-sqlite3` is still listed in `package.json` but is not imported anywhere — it is dead weight awaiting removal.

**Two access styles, on purpose.**
- `repository.ts` uses Drizzle ORM for reads and simple writes (`eq`, `desc`, typed selects). It is the ergonomic path for the web UI.
- `sync.ts` uses raw parameterised SQL inside `client.batch(...)`. Cursor pulls, counter bumps and tombstone writes need exact control over ordering and atomicity, which an ORM abstraction would obscure.

**Migrations are additive and idempotent.** `db.ts` runs `CREATE TABLE IF NOT EXISTS` for the full schema, then a series of guarded `ALTER TABLE ... ADD COLUMN` statements for databases created before a column existed. Every one is wrapped in a try/catch that ignores "duplicate column". There is no down-migration and no migration history table; the file is the history.

**Tables:**

| Table | Purpose |
| :--- | :--- |
| `users` | Account rows. `id` is the Google `sub`, or `guest:<deviceId>` for an unregistered device. `is_guest` distinguishes them. |
| `vehicles` | The root owned entity. Carries `user_id`, cached `specs` JSON, and the four sync columns. |
| `fuel_logs` | Fill-ups. `is_full_tank` decides whether the row participates in consumption math. |
| `maintenance_logs` | Invoices. `parts_list` is a JSON array of itemised parts. |
| `maintenance_schedules` | Recurring service items with `interval_km` / `interval_months` and the last-done baseline. |
| `app_settings` | Key/value store. Holds fuel grades and prices, AI provider choice and masked key state, theme and language preference. |
| `global_vehicle_specs_cache` | Cross-user cache of factory specs keyed on `(make_normalized, model_normalized, year)`, with a `hit_count`. |
| `sync_counter` | One row, `id = 1`. The source of every `seq` value. |
| `device_sessions` | One row per signed-in device. Stores only the SHA-256 of the refresh token. |

The database path is resolved as `explicit argument → CARBOOK_DB_PATH → ./car_maintenance.db`. That ordering is what lets a deployment keep data outside the checkout, and what lets the test suite run against throwaway files.

---

## 4. Ownership and tenancy

`vehicles.user_id` is the only direct ownership column. Fuel logs, maintenance logs and schedules inherit ownership through their vehicle, so a single ownership check on the vehicle covers the whole subtree.

Every handler follows the same two steps: resolve the caller with `requireUser`, then resolve the record with `requireOwnership`. The second step is what makes a foreign id indistinguishable from a missing one — both answer `404`. Answering `403` would confirm the record exists.

Table names that reach SQL come from `OWNED_TABLES`, an allowlist in `repository.ts`, never from the request body. Values are always bound parameters.

An anonymous caller receives an empty list, not the legacy rows. Records created before the account system exist with `user_id IS NULL` and are intentionally unreachable until they are assigned.

**Guest mode.** A device that never signed in is still a real `users` row: `id = guest:<deviceId>`, `is_guest = 1`. This is the single most useful decision in the auth design — guest data is scoped, readable, syncable and exportable with zero special cases anywhere in the codebase. Linking a guest to a real account reassigns its vehicles and logs in one transaction and re-stamps their `seq` from `sync_counter`, so the account's other devices pull the merged history on their next sync instead of silently missing it.

---

## 5. Sync protocol

Sync is a **cursor**, not a diff. Each of the four syncable tables carries:

| Column | Meaning |
| :--- | :--- |
| `rev` | Per-row version. Incremented on every accepted write. |
| `seq` | Global monotonic position, drawn from `sync_counter`. `NULL` means "never synced". |
| `deleted` | Tombstone. Rows are never physically removed once they have a `seq`. |
| `sync_ts` | Wall-clock of the last write. Breaks ties: highest wins. |

A device calls `POST /api/sync` with `{ deviceId, since, pushed }`. The server applies the pushes inside one transaction, drawing a fresh `seq` for each accepted row, then returns `{ serverSeq, pulled, rejected }`: `pulled` holds every row with `seq > since` grouped by table, each with an `upsert` list and a `deleted` id list; `rejected` names any pushed row the server refused and why. The device applies the pull, then advances its stored cursor to `serverSeq`.

**The invariant that took the most work.** A pushed row stays dirty until the server acknowledges it, so "is dirty" says nothing about "was sent". The device records the local revision it pushed and compares on apply:

- local revision **equals** the pushed revision → nothing changed in flight → safe to overwrite with the server's value. This is how a lost last-write-wins race converges back to the server's authoritative row.
- local revision **differs** → the user edited while the request was in flight → skip, keep dirty, re-push next round.

Getting this wrong in either direction is silent data loss: the first version of this rule skipped *all* dirty rows, which meant a device that lost a race never adopted the server value and diverged permanently. `mobile/src/device/localStore.test.ts` pins both directions.

Rows created before sync existed are backfilled with a `seq` on first startup, so a client's very first `since = 0` pull receives the entire history.

---

## 6. Device layer

`mobile/` is a separate Vite project, not a build target of the Next.js app. It runs WatermelonDB over a LokiJS adapter in tests and over SQLite on a device.

Two WatermelonDB constraints shaped the schema:

- **`updated_at` is reserved.** WatermelonDB owns that column for its own sync, so business timestamps live in `created_at_iso` / `updated_at_iso` and map to the server's `created_at` / `updated_at` through an explicit key table.
- **Device-only columns.** `updated_at_sync` (the local revision), `_dirty` (`created` / `updated` / `deleted` / `''`) and `_deleted_at` exist only on the device and are never pushed.

Session handling: a stable device id, a refresh token in secure storage, and a 15-minute access token in memory. `POST /api/auth/device` registers or refreshes; the server stores only the SHA-256 of the refresh token, rotates it on every use, and treats a replayed token as theft — it revokes that device's sessions rather than quietly accepting the newer one. A token is bound to the device id that minted it, so presenting a phone's token from a desktop fails.

**Current state, plainly:** the sync contract, the device store and the guest/link flow are implemented and tested end to end in-process (`mobile/src/device/e2e.test.ts` drives a real `WMDBLocalStore` against a real `SyncService`). The Capacitor shell has not been flipped from `server.url` to a bundled `webDir`, so none of this code runs on a phone yet.

---

## 7. AI subsystem

Three capabilities, one gateway, one orchestrator.

**`services/ai.ts`** is the only module that talks to the network. It enforces HTTPS, rejects embedded credentials, blocks private and reserved address ranges, refuses to follow redirects, and applies a deadline to every request. Retries are bounded at three attempts with model rotation, and `NonRetryableAiError` exists so a permanent failure escapes the loop on the first try instead of burning quota three times.

**`services/aiOrchestrator.ts`** decides *whether* to call the network at all, using a four-tier key resolution: user BYOK key in settings → `SERVER_GEMINI_API_KEY` / `GEMINI_API_KEY` → `SERVER_OPENROUTER_API_KEY` / `OPENROUTER_API_KEY` → none. With no key it does not fail; it falls back to local data.

**`services/automotiveDatabase.ts`** is that fallback: 9 preseeded make/model/year records with full factory specs and maintenance schedules, plus heuristic generators for anything not in the list. Lookup normalises case and spacing, matches on exact model (so `Corolla` never leaks its specs into `Corolla Cross`), and requires the year to fall inside the record's range. A miss produces a heuristic proposal, clearly labelled as such, rather than a confident wrong answer.

**The rule that governs all of it:** AI output is a *proposal*, validated against the Zod schema before it is stored, and stored in a cache the user can inspect — never treated as authority.

---

## 8. Calculation engine

`services/calculator.ts` holds the numbers.

Liters and total cost are bidirectional from price per liter, with no rounding on input — `40.584 L` is stored as `40.584 L`.

Consumption is derived **between consecutive full-tank fills only**:

```
distance   = odometer[n] - odometer[prev full tank]
L/100 km   = (liters / distance) * 100
km/L       = distance / liters
cost/km    = totalCost / distance
```

A partial top-up is stored but produces no consumption figure. Dividing a known liter amount by an unknown distance yields a number that looks precise and is not; showing it would be worse than showing nothing.

Editing or deleting a historical fill re-evaluates every fill after it, because each one's baseline moved.

Schedule status is classified as `ok`, `due_soon` (≤ 1,000 km or ≤ 14 days remaining) or `overdue`, against both a mileage interval and an elapsed-time interval. `PATCH /api/schedules` lets the user set the `last_done_odometer` / `last_done_date` baseline directly, because a car bought used has a service history the default presets know nothing about.

---

## 9. Internationalisation and theming

**i18n.** Dictionaries are TypeScript modules in `src/i18n/` (`ar_cfg.ts`, `en_cfg.ts`, `pl_cfg.ts`) whose content is `.cfg` key-value text parsed at load by `src/i18n/parser.ts`. The parser is deliberately small: skip blank lines and lines starting with `#` or `;`, split on the **first** `=`, trim both halves, drop lines with no `=`. Values are taken literally — quoting is not stripped, so a value written as `"text"` keeps its quote characters. `src/locales/` holds the editable originals for Arabic and English; Polish exists only as its TS dictionary. `SUPPORTED_LANGUAGES` in `config.ts` is the registry.

Lookup in `context.tsx` is `t(key, fallback?)`: current locale → English → Arabic → the caller's `fallback` argument → the literal key. A half-finished translation therefore still renders.

Arabic sets `dir = rtl` and the Cairo font. Layout uses CSS logical properties (`text-start`, `border-s`) rather than physical left/right, which is what makes the flip free.

One convention that is easy to get wrong: content branches on `lang !== 'ar'`, never on `lang === 'en'`. The second form silently serves English to every locale that is not English.

**Theming.** `src/theme/context.tsx` defines four themes — Material 3 Expressive (default), Glassmorphism, Light Minimal, Terminal — as CSS custom-property token blocks. Components consume tokens, so adding a theme touches no component file.

---

## 10. Security model

What is enforced, and the limits of each control.

**Authorization.** `requireUser` / `requireOwnership` / `authErrorResponse` in `services/authz.ts`, applied in every data route. `tests/apiAuth.test.ts` (8 tests) pins the contract from both sides: anonymous writes are rejected on every mutating route, cross-tenant writes to fuel logs, maintenance logs and schedules answer `404`, the real owner can read/write/delete their own records, a session cookie and a bearer token authenticate identically, an unknown id is reported exactly like a foreign one, and an anonymous caller gets an empty vehicle list rather than the unassigned legacy rows.

**Sessions.** A custom HS256 JWT. The browser gets a 30-day `httpOnly` `carbook_session` cookie (`secure` in production, which is why HTTPS is not optional); the device gets a 15-minute bearer. `JWT_SECRET` must be stable across restarts or every session drops at once.

**Device tokens.** SHA-256 at rest, rotation on use, reuse detection, device binding. Rotated rows are kept with `revoked_at` set rather than deleted — a replayed token has to remain distinguishable from a token never seen before, or the theft signal is lost.

**SSRF.** Outgoing AI calls require plain HTTPS, reject userinfo in the URL, and reject loopback, RFC 1918, CGNAT, link-local, IPv6 local/multicast/v4-mapped and cloud-metadata ranges in every `inet_aton` spelling (dotted quad, decimal, octal, hex, abbreviated). Redirects are not followed, because following one replays the bearer key to the redirect target. *Known limit:* this validates URL text. A hostname that resolves to a private address — DNS rebinding — needs resolve-then-dial at a layer that can hold a socket, and this one cannot. `tests/aiSecurity.test.ts` (12 tests) pins the guard, the transport hardening and the retry classification.

**Secrets.** AI keys live in `app_settings` or the environment. They are never bundled into client JavaScript and `/api/settings` returns only a masked form.

**Excel export.** `services/exportExcel.ts` writes through SheetJS `json_to_sheet`, which emits strings as `t="str"` cells with no `<f>` element — nothing in the output is executable by a spreadsheet. `tests/export.test.ts` asserts that property directly rather than adding quote-prefix escaping that would corrupt legitimate values. There is no CSV export path in the application.

**No telemetry.** No analytics, no tracking pixels, no third-party call other than the AI provider you configure.

---

## 11. Test map

114 tests across 18 files. `npm test` at the repository root runs all of them, including the three under `mobile/` — the Vitest config sets no `include`, so the root run collects both trees. `cd mobile && npm test` runs the device subset alone (18 tests, 3 files).

| File | Covers |
| :--- | :--- |
| `tests/baseline.test.ts` | Harness sanity — one assertion that the runner works. |
| `tests/storage.test.ts` | Zod rejection of invalid domain data, vehicle creation, ACID fuel and maintenance writes that advance the odometer, settings persistence, schedule baseline updates, and owner resolution refusing unknown or unassigned rows. |
| `tests/calculator.test.ts` | Consumption between two full tanks, omission for partial fills while keeping the chain intact, alert classification, and the AI layer's bounded retry, SSRF rejection, OEM spec validation and doctor grounding. |
| `tests/i18n.test.ts` | `.cfg` parser: comments and blank lines, values containing `=`, and loading the Polish dictionary. |
| `tests/auth.test.ts` | JWT sign/verify, rejection of tampered tokens, tenant isolation, the legacy-claim gate from both sides (claims for the designated owner, refuses for anyone else), and nothing exposed to an anonymous visitor. |
| `tests/apiAuth.test.ts` | The route-level authorization contract — see §10. |
| `tests/aiOrchestrator.test.ts` | Keyless operation: preseeded specs served and cached in SQLite, heuristic specs for unknown models, schedule caching, and doctor advice. |
| `tests/aiSecurity.test.ts` | SSRF guard across every address spelling, redirect refusal, timeouts, and retry classification. |
| `tests/vehicleSpecs.test.ts` | Exact-match lookup, case and space normalisation, no prefix inheritance, inclusive year ranges, blank inputs, heuristic fallback. |
| `tests/export.test.ts` | Workbook and sheet structure for the dossier, maintenance and fuel exports in both languages, legacy parts formats, column auto-fit, and cell typing. |
| `tests/notifications.test.ts` | Notification support detection, and the urgent-schedule filter that prevents repeat alerts. |
| `src/persistence/sync.test.ts` | Server contract: push and pull, device-to-device propagation, a vehicle and its logs in one request, foreign-child rejection, last-write-wins in both directions, tombstones, cursor advance. |
| `src/services/backup.test.ts` | Tenant-scoped export, merge restore (recreates deleted rows, never overwrites a newer local edit), replace restore, refusal to land rows under a foreign vehicle, rejection of a non-CarBook file, and restored rows becoming visible through the sync cursor. |
| `src/services/deviceAuth.test.ts` | Guest registration, malformed device id rejection, refresh rotation, reuse detection revoking every session, two devices signed in at once, cross-device token rejection, and guest→account linking including its idempotent and refusal cases. |
| `src/sync/client.test.ts` | `syncOnce` ordering: apply pulled rows before advancing the cursor, do not advance if applying throws, surface HTTP and `success:false` failures, send a bearer token when given one. |
| `mobile/src/device/localStore.test.ts` | In-flight edit and delete survival, LWW convergence when a push loses, cursor persistence and reload. |
| `mobile/src/device/session.test.ts` | Register on first run, reuse an unexpired session without a network call, refresh when nearly stale, fall back to registering when the stored token is refused, link with the account token rather than the guest one. |
| `mobile/src/device/e2e.test.ts` | Device ⇄ server offline sync end to end: offline create reaching a second device, offline edit and stale edit under LWW, offline delete propagating, tenant isolation. |

`npm run typecheck` runs `tsc --noEmit` in strict mode across the whole tree; `mobile/` has its own. Both are clean.

---

## 12. Known gaps

Stated here so nobody has to rediscover them:

- **No vehicle edit or delete in the web UI.** `/api/vehicles` exposes `GET` and `POST` only. Deletion is reachable through the sync push path (and therefore from a device), but there is no browser affordance for either operation.
- **`better-sqlite3` is an unused dependency.** Declared, never imported.
- **The `@sync` alias in `mobile/` points nowhere.** `mobile/vite.config.ts` and `mobile/tsconfig.json` both map `@sync/*` to `mobile/src/sync/*`, a directory that does not exist. The device layer reaches the shared contract by relative path instead. Either create the directory or drop the alias.
- **No OAuth → device handoff.** `PUT /api/auth/device` requires a real account bearer token, and nothing delivers one to a phone after browser sign-in. A one-time-code redirect is the missing piece.
- **The Capacitor shell loads the remote site** (`server.url`), so no bundled web assets run on-device.
- **No LICENSE file.** Both READMEs say MIT; the file itself is absent.
- **DNS rebinding** is not defended against, as noted in §10.
