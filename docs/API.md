# CarBook REST API Reference

Eighteen route files expose **34 method handlers** under `/api`, served by the Next.js node runtime (`src/app/api/**/route.ts`; see the full index at the bottom).

---

## Conventions

**Envelope.** JSON responses use:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": "human-readable reason" }
```

Exceptions: `GET /api/auth/me` answers its own shape (`{ authenticated, user }`, §1); `GET /api/auth/login` and `GET /api/auth/callback/google` redirect (the browser is navigating); `GET /api/auth/logout` redirects; `GET /api/backup` streams the file directly. `DELETE` handlers answer `{ "success": true, "message": "…" }` (`"Vehicle deleted successfully"` on vehicles, `"Deleted successfully"` elsewhere).

**Authentication.** A browser caller is identified by the `carbook_session` cookie; a device caller by an `Authorization: Bearer` access token. Both resolve to the same user record (`src/services/auth.ts`). Handlers call `requireUser(req)` (session only) or `getAuthenticatedUser(req)` (returns `null` instead of throwing).

**Ownership.** Handlers that touch a specific record call `requireOwnership(repo, table, id, userId)` first (`src/services/authz.ts`). `table` must be in the `OWNED_TABLES` allowlist in `src/persistence/repository.ts`.

**Status codes.**

| Code | Meaning |
| :--- | :--- |
| `400` | Missing or malformed parameter, failed Zod validation. |
| `401` | No session, expired/revoked token, or a guest account where a real one is required. |
| `404` | The record does not exist **or belongs to someone else.** These are deliberately indistinguishable so ids cannot be probed. `403` is never returned for a foreign record. |
| `429` | Abuse throttle tripped (`Retry-After` header in seconds). Guarded in-route, per limiter instance: `login` and `token-login` 10/min per IP, `auth/device` 20/min per IP, `ai/*` 10/min per user per endpoint (anonymous keyed by IP). Implemented in `src/services/rateLimit.ts`; the IP comes from the first `X-Forwarded-For` hop and is advisory — a throttling budget, never an authorization input. |
| `500` | Unhandled failure. |

An anonymous `GET` on a collection returns an empty list, not the unassigned legacy rows.

---

## 1. Auth — `/api/auth/*`

### `GET /api/auth/login`
302-redirects to Google's consent screen with `scope=openid email profile`, `prompt=select_account`, `access_type=offline`.
- A CSRF state gate is always on: the route mints a random nonce, mirrors it in a short-lived `httpOnly` cookie scoped to `/api/auth/callback` (10 min) **and** inside the opaque JSON `state` handed to Google (`{ source, nonce }`). `source` is `?source=` or inferred from the `Android` user agent.
- `500` if `GOOGLE_CLIENT_ID` is unset. `429` past 10 starts/min per IP.

### `GET /api/auth/callback/google?code=…&state=…`
Requires the state nonce to equal the cookie nonce (constant-time); a missing, forged or mismatched state answers `400 { "error": "invalid_oauth_state" }` and burns the cookie. On pass it exchanges the code with Google, upserts the `users` row, and branches:

- **Web flow:** sets a fresh 7-day `carbook_session` cookie (`httpOnly`, `secure` in production, `sameSite=lax`) — the token carries a random `jti` so logout can revoke it — and 302-redirects to the app origin. A durable token is never placed in a URL.
- **App flow (mobile WebView/browser):** mints a **single-use authorization code** (`issueOneTimeCode`, `src/services/deviceAuth.ts` — 256-bit random, stored only as SHA-256(code) → userId in `auth_codes`, TTL 10 minutes) and returns an HTML interstitial that deep-links `carbook://login?code=…`. No session cookie is set here; the app redeems the code itself.

On failure redirects to `/?auth_error=<reason>` rather than answering JSON, because the browser is navigating.
- Origin resolution: `APP_ORIGIN` if set, otherwise `x-forwarded-proto` + `x-forwarded-host`, otherwise `localhost:3070`. Behind a reverse proxy, set `APP_ORIGIN` — inferred values are how open-redirect bugs happen.

### `GET /api/auth/token-login?code=…` — deep-link redemption (device)
`android/…/MainActivity.java` receives `carbook://login?code=…` and loads this URL in the app WebView so the redemption lands in the WebView's own cookie jar.

- **Primary path (`?code=`):** redeems the one-time code atomically (a `UPDATE … WHERE used = 0` whose change-count is checked, so a replay is impossible and spent/expired/unknown codes are an indistinguishable `401`). On success it mints the caller's own 7-day `carbook_session` cookie (with `jti`) and 302-redirects to `/`.
- **Legacy dual-read (`?token=`, removal no earlier than 2026-12-01):** older installed APKs still complete OAuth with a durable 30-day session JWT. That branch keeps verifying such tokens (a pre-T6 token has no `jti`, so it cannot be server-side revoked) and sets the cookie for the remainder of its own expiry. The callback stopped minting them — new installs only ever see `?code=`. See [DEPLOYMENT.md §11](DEPLOYMENT.md) for the server-before-APK deploy order this window requires.
- `429` past 10 redemptions/min per IP. No `code` and no `token` redirects to `/?auth_error=missing_token`; an invalid legacy token to `/?auth_error=invalid_token`.

### `GET /api/auth/me`
The one non-envelope data route. Always `200`:
```json
{ "authenticated": false, "user": null }
{ "authenticated": true,  "user": { "id": "…", "email": "…", "name": "…", "picture": "…", "guest": true } }
```
(`guest` appears only on guest-device identities.)

### `GET /api/auth/logout` · `POST /api/auth/logout`
Clears the cookie, and — for tokens minted with a `jti` (every token since the 7-day change) — **revokes the session server-side**: the `jti` is added to an in-process cache and persisted in the `revocations` table, which is rehydrated on every server start (`src/instrumentation.ts`), so a logged-out cookie stops working even if the client kept it and a restart cannot resurrect it. Legacy jti-less tokens can only be dropped client-side, exactly as before. `GET` redirects to `/`; `POST` answers `{ "success": true }`. Forged or already-invalid cookies create no revocation rows — the table cannot be grown by spam.

### `POST /api/auth/device`
Device session bootstrap. No authentication required.
```json
{ "deviceId": "stable-device-uuid" }
```
With a `refreshToken` in the body it refreshes instead of registering:
```json
{ "deviceId": "…", "refreshToken": "…" }
```
- **Returns:** `{ success: true, data: { accessToken, refreshToken, sessionId, user } }`
- `deviceId` must match `^[A-Za-z0-9._:-]{8,64}$`. First contact creates the guest identity `guest:<deviceId>` as a real `users` row.
- `accessToken` lives 15 minutes; `refreshToken` rotates on every use. Presenting an already-rotated token is treated as theft and revokes that device's sessions. A token is bound to the `deviceId` that minted it — presenting another device's token fails with *"does not belong to this device"*.
- `429` past 20 register/refresh attempts/min per IP (higher than login because several phones behind one NAT legitimately refresh together).

### `PUT /api/auth/device`
Links a guest device to the signed-in account. Requires a **real** (non-guest) bearer token.
```json
{ "deviceId": "…" }
```
- **Returns:** the merge result: reassigned vehicles and their logs, in one transaction, with `seq` re-stamped so the account's other devices pull the merged history.
- `401` if the caller is anonymous or is still a guest.

### `DELETE /api/auth/device?sessionId=<id>`
Signs one device out without touching the others. Requires a signed-in **non-guest** account.
- `401` if the caller is anonymous or is a guest; `400` if `sessionId` is missing.

---

## 2. Vehicles — `/api/vehicles`

### `GET /api/vehicles`
Vehicles owned by the caller, with parsed `specs`. Anonymous callers get `[]`.

### `POST /api/vehicles`
Registers a vehicle. The body is validated against `vehicleSchema`; `id`, `createdAt` and `updatedAt` are assigned server-side and `user_id` is taken from the session, never from the body.
```json
{
  "name": "Family SUV",
  "make": "Hyundai",
  "model": "Tucson",
  "year": 2023,
  "licensePlate": "456 DEF",
  "initialOdometer": 20000,
  "currentOdometer": 20000,
  "recommendedOil": "5W-30"
}
```

Default maintenance schedules are **not** created here. They are seeded lazily by the first `GET /api/schedules` for the vehicle — see §5.

### `PUT /api/vehicles`
Edits a vehicle. Body is the fields above plus `id`; `user_id`, `createdAt` and `updatedAt` are never taken from the body.
```json
{
  "id": "uuid",
  "name": "Family SUV (renamed)",
  "make": "Hyundai",
  "model": "Tucson",
  "year": 2023,
  "engineCc": "1999",
  "licensePlate": "456 DEF",
  "initialOdometer": 20000,
  "currentOdometer": 51200,
  "recommendedOil": "5W-30"
}
```
- Requires authentication and ownership of the vehicle (`404` for a foreign or missing id, `400` for a missing `id` or a Zod failure).
- **Returns:** `{ success: true, data: <updated Vehicle> }`. The row is re-validated against `vehicleSchema` after merging, and stamps `rev + 1`, a fresh `seq` and `sync_ts` — so every other device of the owner receives the edit on its next pull (`src/persistence/repository.ts`).

### `DELETE /api/vehicles?id=<id>`
Requires authentication and ownership. **Tombstones, never hard-deletes:** the vehicle *and all of its fuel logs, maintenance logs and schedules* are set to `deleted = 1, rev = rev + 1` with a fresh `seq` per row and `sync_ts = now`, in one write batch (`deleteVehicle`, `src/persistence/repository.ts`). Hard deletes would vanish from the global sequence, so other devices' `seq > since` pulls would never learn about them and could later resurrect them.
- **Returns:** `{ success: true, "message": "Vehicle deleted successfully" }`
- Tombstoned rows disappear from every read endpoint (`GET /api/vehicles`, fuel, maintenance, schedules, reports, backup — all filter `deleted = 0`) and arrive on other devices as `pulled.<table>.deleted` ids.
- The sync push path **refuses to resurrect** a tombstone: an upsert for a row the server already tombstoned is silently dropped (see §9), which is what keeps a stale offline device from "reviving" a deleted car.
- The web UI exposes both operations (vehicle card menu in `src/app/page.tsx`); deletion is also reachable through `POST /api/sync` with a `delete` entry.

---

## 3. Fuel logs — `/api/fuel`

All four methods require authentication and check ownership of the vehicle or the log.

### `GET /api/fuel?vehicleId=<id>`
Returns every fill for the vehicle in reverse chronological order, each enriched by `enrichFuelMetrics`:

| Field | Meaning |
| :--- | :--- |
| `distanceTraveledKm` | Odometer delta to the previous **full-tank** fill. |
| `litersPer100Km` | `(liters / distance) * 100`, or `null`. |
| `kmPerLiter` | `distance / liters`, or `null`. |
| `costPerKm` | `totalCost / distance`, or `null`. |

`null` is not a missing value — it means the row is a partial top-up and has no honest consumption figure. See [ARCHITECTURE.md §8](ARCHITECTURE.md).

### `POST /api/fuel`
```json
{
  "vehicleId": "uuid",
  "fillDate": "2026-10-29",
  "odometer": 52400,
  "liters": 42.5,
  "pricePerLiter": 17.00,
  "totalCost": 722.50,
  "isFullTank": true,
  "notes": "Gasoline 95"
}
```
Decimal fractions are stored exactly as sent — `40.584` stays `40.584`.

### `PUT /api/fuel`
Body is the same shape plus `id`. Re-evaluates every subsequent fill, because their baseline moved.

### `DELETE /api/fuel?id=<id>`
Tombstones the row (`deleted = 1, rev = rev + 1`, fresh `seq` and `sync_ts`) so devices that already hold it learn to drop it, then re-evaluates the vehicle's `current_odometer` as the max over the *remaining* live rows (and `initial_odometer`) — the vehicle row is stamped too, so the odometer correction also propagates. (`fuel_logs` has no `updated_at` column; `sync_ts` + `seq` carry the delete stamp.)

---

## 4. Maintenance — `/api/maintenance`

### `GET /api/maintenance?vehicleId=<id>`
Invoices for the vehicle, each with its `partsList` parsed from JSON.

### `POST /api/maintenance`
```json
{
  "vehicleId": "uuid",
  "serviceDate": "2026-10-20",
  "odometer": 50000,
  "serviceType": "oil_change",
  "title": "10,000 km Oil & Filter Service",
  "partsList": [
    { "id": "p1", "name": "Full Synthetic 0W-20 4L", "condition": "new", "cost": 1850 },
    { "id": "p2", "name": "OEM Oil Filter",          "condition": "new", "cost": 350 }
  ],
  "partsCost": 2200,
  "laborCost": 300,
  "totalCost": 2500,
  "workshop": "Authorized Service Center",
  "notes": "Inspected brake pads and fluid levels",
  "nextDueOdometer": 60000,
  "nextDueDate": "2027-04-20"
}
```
`condition` is `new` (OEM) or `used` (import/good-used). `totalCost` is expected to equal `partsCost + laborCost`.

### `PUT /api/maintenance` · `DELETE /api/maintenance?id=<id>`
Same contract as fuel: body plus `id`, ownership checked on `maintenance_logs`, PUT re-evaluates the vehicle odometer, DELETE tombstones (`deleted = 1` + fresh `seq`) instead of hard-deleting and re-evaluates the odometer the same way.

---

## 5. Schedules — `/api/schedules`

### `GET /api/schedules?vehicleId=<id>`
Returns the vehicle and its evaluated schedules:
```json
{
  "success": true,
  "data": {
    "vehicle": { },
    "schedules": [ { "schedule": { "id": "…", "itemCode": "engine_oil_filter", "intervalKm": 10000 }, "remainingKm": 4200, "remainingDays": null, "status": "ok", "alertMessageAr": "…", "alertMessageEn": "…" } ]
  }
}
```

If the vehicle has no schedules yet, this call seeds the nine presets from `src/services/presets.ts` first, using `initialOdometer` and the vehicle's creation date as the baseline. Seeding happens on read, not on vehicle creation, so a vehicle created through sync or restore is seeded on first view too.

`status` is one of:

| `status` | Condition |
| :--- | :--- |
| `overdue` | `remainingKm ≤ 0`, or a date interval is configured and `remainingDays ≤ 0`. Checked first. |
| `due_soon` | `remainingKm ≤ 1000`, or a date interval is configured and `remainingDays ≤ 14`. |
| `ok` | Neither of the above. |

`remainingDays` is `null` when the schedule has no `lastDoneDate` or no `intervalMonths`, and a `null` never triggers a time-based status — such a schedule is evaluated on mileage alone.

### `PATCH /api/schedules`
Sets the baseline by hand — for a car bought used, or a part replaced outside the app.
```json
{
  "id": "schedule-uuid",
  "lastDoneOdometer": 50000,
  "lastDoneDate": "2026-10-20",
  "intervalKm": 10000,
  "intervalMonths": 12
}
```
Requires ownership of `maintenance_schedules`.

---

## 6. Reports — `/api/reports`

### `GET /api/reports?vehicleId=<id>`
The consolidated inspection/resale document.
```json
{
  "success": true,
  "data": {
    "vehicle": { },
    "summary": {
      "totalFuelCost": 0,
      "totalFuelLiters": 0,
      "totalMaintenanceCost": 0,
      "totalExpenses": 0,
      "averageLitersPer100Km": 6.4,
      "fuelLogsCount": 0,
      "maintenanceLogsCount": 0
    },
    "fuelLogs": [ ],
    "maintenanceLogs": [ ],
    "schedules": [ ]
  }
}
```
`averageLitersPer100Km` averages only fills that produced a real figure, and is `null` when none did.

---

## 7. Settings — `/api/settings`

Settings are **per-user** (`app_settings` is keyed `(key, user_id)`); an absent per-user row falls back to the legacy global row (`user_id = ''`). `ai_provider` deliberately stays global — it is the server-wide fallback consumed by `resolveAiConfig`.

### `GET /api/settings`
```json
{
  "success": true,
  "data": {
    "provider": "gemini",
    "hasApiKey": true,
    "maskedApiKey": "sk-o...4f2a",
    "isServerManaged": false,
    "hasServerKey": true,
    "isAiReady": true,
    "fuelTypes": [
      { "id": "gasoline_95", "name": "بنزين 95", "price": 24.00 }
    ]
  }
}
```
`hasApiKey` / `maskedApiKey` reflect **the caller's own** `ai_api_key` row (global fallback if the user never saved one). The raw key is never returned — only the masked form. `fuelTypes` falls back to the official Egypt preset from `src/services/geoPricing.ts` (`getFuelPresetsByCountry('EG')` — the single source of truth, so server and client defaults cannot drift) when unset.

### `POST /api/settings`
```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-v1-…",
  "fuelTypes": [ { "id": "gasoline_92", "name": "Gasoline 92", "price": 22.25 } ]
}
```
Any subset of fields may be sent. `apiKey` and `fuelTypes` are written to the caller's own rows; `provider` writes the global row. Stored plaintext-at-rest — `is_encrypted` is recorded truthfully as `false` (`src/persistence/repository.ts`).

### `GET /api/settings/fuel-prices?country=EG&tz=…`
Requires authentication. Returns the official geo-pricing preset for a country plus the list of supported countries:
```json
{ "success": true, "data": { "current": { "countryCode": "EG", "currency": "EGP", "fuelTypes": [ … ] }, "supportedCountries": [ … ] } }
```
Country resolution order: explicit `?country=`, else `?tz=` mapped through the timezone table (e.g. `Africa/Cairo` → `EG`), else `EG`.

---

## 8. Backup — `/api/backup`

### `GET /api/backup`
Streams the whole account as a JSON attachment: `carbook-backup-<YYYY-MM-DD>.json`. Not enveloped — the body *is* the file.
```json
{
  "kind": "carbook-backup",
  "version": 1,
  "exportedAt": "2026-10-30T14:02:11.482Z",
  "counts": { "vehicles": 2, "maintenance_schedules": 18, "maintenance_logs": 9, "fuel_logs": 61 },
  "tables": { "vehicles": [ ], "maintenance_schedules": [ ], "maintenance_logs": [ ], "fuel_logs": [ ] }
}
```

Rows are exported in database snake_case, `id` first, with boolean columns decoded to real booleans, ordered by `rowid`. `counts` keys are the four syncable tables in restore order.

> **What a backup does not contain:** `app_settings`. Fuel grades and prices, the theme, the language preference and any user-supplied AI key are not exported and will not come back on restore — re-enter them on the new instance. A file-level copy of the database is the only complete backup; see [DEPLOYMENT.md §10](DEPLOYMENT.md).

### `POST /api/backup`
```json
{ "file": { }, "mode": "merge" }
```
- `mode` is `merge` (**default**) or `replace`.
  - `merge` re-adds missing records and never overwrites what already exists.
  - `replace` clears the account's rows first, children before vehicles so nothing is orphaned mid-flight.
- Rows are restored in dependency order and ownership is re-checked against vehicles restored *in the same run*, not only those already on disk.
- `400` if `mode` is anything else, or if `file.version` is newer than the server's — restore forward, not backward.
- **Returns:**
  ```json
  {
    "success": true,
    "data": {
      "mode": "merge",
      "removed": 0,
      "tables": {
        "vehicles":              { "inserted": 2, "skipped": 0 },
        "maintenance_schedules": { "inserted": 18, "skipped": 0 },
        "maintenance_logs":      { "inserted": 9, "skipped": 4 },
        "fuel_logs":             { "inserted": 61, "skipped": 0 }
      }
    }
  }
  ```
  `removed` is only non-zero for a `replace` restore. Restored rows are re-stamped into the sync sequence, so the account's other devices pick them up on their next pull.

---

## 9. Sync — `/api/sync`

### `POST /api/sync`
The whole offline protocol in one call. Requires authentication (a guest account counts — guests are real rows).
```json
{
  "deviceId": "stable-device-uuid",
  "since": 412,
  "pushed": {
    "vehicles":          { "upsert": [ { "id": "…", "name": "…", "updatedAt": 1730000000000 } ], "delete": [ "id", { "id": "…", "updatedAt": 1730000001000 } ] },
    "fuel_logs":         { "upsert": [ ], "delete": [ ] },
    "maintenance_logs":  { "upsert": [ ], "delete": [ ] },
    "maintenance_schedules": { "upsert": [ ], "delete": [ ] }
  }
}
```
- `deviceId` is required; `since` defaults to `0` (non-finite values are floored to `0`), which pulls the entire history.
- Pushed rows use **database snake_case** column names, restricted to the business columns each table declares in `SYNC_TABLES` (`src/persistence/sync.ts`). Sync columns (`rev`, `seq`, `deleted`, `sync_ts`) are owned by the server; `rev`/`deleted` sent by a client are ignored.
- `delete` entries may be a bare id string or `{ id, updatedAt }` — with an `updatedAt`, an older delete cannot erase a newer row.
- A vehicle and its children in one request: children whose parent is upserted *in the same call* pass the parent check, so "create a car plus its first logs offline" works in one round trip.

**Per-row validation before accept (mirrors the REST layer — "Zod parse on every write" includes pushes):**
1. Missing/non-string `id` → rejected `missing_id`.
2. **Tombstone is final:** the server already holds `deleted = 1` → the upsert is *silently dropped* (not rejected). Refusing resurrection is why stale devices cannot revive deleted rows.
3. **Clock clamp:** the row's `updatedAt`/`sync_ts` is trusted only up to server time + 60 s skew. Further in the future: an existing row keeps its current `sync_ts`, a new row is stamped with server now — a fast client clock can never outrank the server. Clamped into `(now, now+60s]` → capped to server now.
4. Server already newer-or-equal (`sync_ts >= ts`) → silently dropped; the client simply receives the authoritative row on the next pull. Not an error.
5. **Ownership:** vehicles must be unowned, `default`, or yours — else rejected `forbidden`. Child rows without any `vehicle_id` → `no_parent`; a `vehicle_id` you don't own (and not created in this same request) → `forbidden`.
6. **Domain validation:** required NOT-NULL columns are checked per row → `invalid_payload:<column>:required`; then a Zod validator built from the shared domain schemas (`SYNC_VALIDATORS`, transport fields relaxed: string ids, timestamp/specs as string-or-number) → `invalid_payload:<field.path>:<zod message>` (e.g. `invalid_payload:liters:Liters must be greater than zero`). Declared int/real columns are coerced first; unparseable values are left for Zod to refuse rather than reaching SQLite as `NaN`.

Accepted ops get a contiguous block of fresh `seq` values (one atomic counter reservation) and are applied in one write transaction — a rejected row never poisons its siblings.

**Response:**
```json
{
  "success": true,
  "data": {
    "serverSeq": 480,
    "pulled": {
      "vehicles": { "upsert": [ { "id": "…", "name": "…", "rev": 3, "updatedAt": 1730000000000, "deleted": 0 } ], "deleted": [ "id" ] }
    },
    "rejected": [
      { "table": "fuel_logs", "id": "…", "reason": "invalid_payload:liters:Liters must be greater than zero" },
      { "table": "fuel_logs", "id": "…", "reason": "forbidden" }
    ],
    "applied": [ { "table": "vehicles", "id": "…", "kind": "upsert" }, { "table": "fuel_logs", "id": "…", "kind": "delete" } ]
  }
}
```
- `pulled` holds every row (live or tombstoned) with `seq > since` that the user owns — children through their vehicle — grouped per table, ordered by `seq`. `deleted` is the tombstone id list.
- `serverSeq` is the counter value *after* this call's writes: everything at or below it is already visible to the device. The client applies the pull, then advances its stored cursor to it, and only then clears dirty flags.
- **`applied[]`** (additive — older clients ignore it) names every pushed row the server actually wrote, per row and per kind. Together with `rejected[]` it lets a device keep exactly the refused rows dirty instead of blindly clearing every pending change after a `200`.
- `rejected` reasons actually emitted are exactly: `missing_id`, `forbidden`, `no_parent`, `invalid_payload:<field>:<message>` (older documentation showed `"vehicle not owned"` — no such string exists in `src/persistence/sync.ts`). A rejection is not an error: the sync as a whole succeeded, and the client retries the refused row later.

The reference client (`src/sync/client.ts`, used unchanged by `mobile/`) implements the retry discipline: apply the pull **before** advancing the cursor (a crash mid-apply re-pulls safely), then an optional `remarkRejected()` hook on the local store re-marks exactly the rejected rows after `markSynced()` cleared the dirty set — so a refused change is retried, never silently acknowledged. `tests/syncCorrectness.test.ts` and `src/sync/client.test.ts` pin both halves.

---

## 10. AI — `/api/ai/*`

All three require authentication. All three answer `429` past 10 calls/min per user per endpoint (anonymous traffic keyed by IP; the guard runs first, before any provider work). All three treat AI output as a *proposal*: the response is validated against the Zod schema before anything is stored, and a failure falls back to the local automotive database rather than answering with nothing.

### `POST /api/ai/lookup`
Stateless spec lookup — no vehicle record needed.
```json
{ "make": "Toyota", "model": "Corolla", "year": 2019, "engineCc": "1600", "forceRefresh": false }
```
Resolution order: `global_vehicle_specs_cache` → preseeded record (exact model match, year inside the record's range) → live provider call if a key exists → heuristic proposal. The cache is **owner-scoped**: rows with `owner_user_id = ''` are the official/seeded catalog visible to everyone; AI-derived rows saved for a user are returned only to that user (and win over the global row for them). `Corolla` never matches `Corolla Cross`.

### `POST /api/ai/manual`
Same resolution, but persists the result onto the vehicle.
```json
{ "vehicleId": "uuid" }
```
- **Returns:** `{ success: true, data: <VehicleManualSpecs>, meta: { source, fromCache } }`
- `source` tells you whether the answer came from cache, the preseeded set, a live provider, or a heuristic — check it before presenting the numbers as factory-confirmed.
- Specs fields: `engineOilViscosity`, `engineOilCapacityLiters`, `transmissionFluidType`, `coolantType`, `brakeFluidType`, `tirePressurePsiFront`, `tirePressurePsiRear`, `fuelTankCapacityLiters`, `recommendedFuelOctane`, `sparkPlugType`, `batterySpec`, `generalNotesAr`.

### `POST /api/ai/doctor`
```json
{ "vehicleId": "uuid", "query": "Rattling noise from the front at low speed over bumps" }
```
- **Returns:** `{ success: true, data: { advice: "…" } }`
- The prompt is grounded in the vehicle's make, model, year, current odometer and last five services, so the advice is about *this* car. With no provider key it returns heuristic advice built from the same context, labelled as such.

---

## Route index

18 route files, 34 method handlers:

| Route | Methods | Auth |
| :--- | :--- | :--- |
| `/api/auth/login` | GET | none · 10/min per IP |
| `/api/auth/callback/google` | GET | none (Google handoff; state CSRF) |
| `/api/auth/token-login` | GET | none (one-time `?code=`; legacy `?token=` window) · 10/min per IP |
| `/api/auth/me` | GET | none (reports state) |
| `/api/auth/logout` | GET, POST | session (revokes `jti`) |
| `/api/auth/device` | POST, PUT, DELETE | POST: none · PUT/DELETE: signed-in non-guest · 20/min per IP |
| `/api/vehicles` | GET, POST, PUT, DELETE | session; PUT/DELETE + ownership |
| `/api/fuel` | GET, POST, PUT, DELETE | session + ownership |
| `/api/maintenance` | GET, POST, PUT, DELETE | session + ownership |
| `/api/schedules` | GET, PATCH | session + ownership |
| `/api/reports` | GET | session + ownership |
| `/api/settings` | GET, POST | session |
| `/api/settings/fuel-prices` | GET | session |
| `/api/backup` | GET, POST | session |
| `/api/sync` | POST | session or bearer |
| `/api/ai/lookup` | POST | session · 10/min per user |
| `/api/ai/manual` | POST | session + ownership · 10/min per user |
| `/api/ai/doctor` | POST | session + ownership · 10/min per user |
