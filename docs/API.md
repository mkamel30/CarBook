# CarBook REST API Reference

Sixteen route handlers under `/api`, served by the Next.js node runtime.

---

## Conventions

**Envelope.** Every route except `GET /api/auth/me` and `GET /api/auth/logout` answers with:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": "human-readable reason" }
```

`DELETE` handlers answer `{ "success": true, "message": "Deleted successfully" }`.

**Authentication.** A browser caller is identified by the `carbook_session` cookie; a device caller by an `Authorization: Bearer` access token. Both resolve to the same user record. Handlers call `requireUser(req)` (session only) or `getAuthenticatedUser(req)` (returns `null` instead of throwing).

**Ownership.** Handlers that touch a specific record call `requireOwnership(repo, table, id, userId)` first. `table` must be in the `OWNED_TABLES` allowlist in `src/persistence/repository.ts`.

**Status codes.**

| Code | Meaning |
| :--- | :--- |
| `400` | Missing or malformed parameter, failed Zod validation. |
| `401` | No session, expired token, or a guest account where a real one is required. |
| `404` | The record does not exist **or belongs to someone else.** These are deliberately indistinguishable so ids cannot be probed. `403` is never returned for a foreign record. |
| `500` | Unhandled failure. |

An anonymous `GET` on a collection returns an empty list, not the unassigned legacy rows.

---

## 1. Auth — `/api/auth/*`

### `GET /api/auth/login`
302-redirects to Google's consent screen with `scope=openid email profile`, `prompt=select_account`, `access_type=offline`.
- `500` if `GOOGLE_CLIENT_ID` is unset.

### `GET /api/auth/callback/google?code=…&state=…`
Exchanges the code, upserts the `users` row, sets the session cookie, and 302-redirects to the app origin. On failure redirects to `/?auth_error=<reason>` rather than answering JSON, because the browser is navigating.
- Origin resolution: `APP_ORIGIN` if set, otherwise `x-forwarded-proto` + `x-forwarded-host`, otherwise `localhost:3070`. Behind a reverse proxy, set `APP_ORIGIN` — inferred values are how open-redirect bugs happen.

### `GET /api/auth/me`
The one non-envelope route. Always `200`:
```json
{ "authenticated": false, "user": null }
{ "authenticated": true,  "user": { "id": "…", "email": "…", "name": "…", "picture": "…" } }
```

### `GET /api/auth/logout` · `POST /api/auth/logout`
Clears the cookie. `GET` redirects to `/`; `POST` answers `{ "success": true }`.

### `POST /api/auth/device`
Device session bootstrap. No authentication required.
```json
{ "deviceId": "stable-device-uuid" }
```
With a `refreshToken` in the body it refreshes instead of registering:
```json
{ "deviceId": "…", "refreshToken": "…" }
```
- **Returns:** `{ success: true, data: { accessToken, refreshToken, user } }`
- `accessToken` lives 15 minutes; `refreshToken` rotates on every use. Presenting an already-rotated token is treated as theft and revokes that device's sessions. A token is bound to the `deviceId` that minted it — presenting another device's token fails with *"does not belong to this device"*.

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

> **Not implemented:** there is no `PUT` or `DELETE` on this route. The web UI can create and list vehicles but cannot edit or delete one. Deletion is reachable only through the sync push path (`POST /api/sync` with a `delete` entry), which is why a device client can do what the browser cannot.

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
Tombstones the row (`deleted = 1`) so devices that already hold it learn to drop it.

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
Same contract as fuel: body plus `id`, and ownership checked on `maintenance_logs`.

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
      { "id": "gasoline_95", "name": "بنزين 95", "price": 17.00 }
    ]
  }
}
```
The raw key is never returned — only the masked form. `fuelTypes` falls back to the five built-in Egyptian grades when unset.

### `POST /api/settings`
```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-v1-…",
  "fuelTypes": [ { "id": "gasoline_92", "name": "Gasoline 92", "price": 15.25 } ]
}
```

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
    "vehicles":          { "upsert": [ { "id": "…", "name": "…", "rev": 3, "sync_ts": 1730000000000 } ], "delete": [ "id" ] },
    "fuel_logs":         { "upsert": [ ], "delete": [ ] },
    "maintenance_logs":  { "upsert": [ ], "delete": [ ] },
    "maintenance_schedules": { "upsert": [ ], "delete": [ ] }
  }
}
```
- `deviceId` is required; `since` defaults to `0`, which pulls the entire history.
- Pushed rows use **database snake_case** column names, restricted to the business columns each table declares in `SYNC_TABLES`. Sync columns (`seq`, `deleted`) are assigned server-side and ignored if sent.
- `delete` entries may be a bare id string or `{ id, updatedAt }`.

**Response:**
```json
{
  "success": true,
  "data": {
    "serverSeq": 480,
    "pulled": {
      "vehicles": { "upsert": [ ], "deleted": [ "id" ] }
    },
    "rejected": [ { "table": "fuel_logs", "id": "…", "reason": "vehicle not owned" } ]
  }
}
```
Pushes are applied and the pull is computed in one transaction, so `serverSeq` is a safe cursor: everything at or below it has been seen. The client stores it and sends it as `since` next time.

A `rejected` entry is not an error — the sync as a whole succeeded. The client keeps that row dirty and retries.

---

## 10. AI — `/api/ai/*`

All three require authentication. All three treat AI output as a *proposal*: the response is validated against the Zod schema before anything is stored, and a failure falls back to the local automotive database rather than answering with nothing.

### `POST /api/ai/lookup`
Stateless spec lookup — no vehicle record needed.
```json
{ "make": "Toyota", "model": "Corolla", "year": 2019 }
```
Resolution order: cross-user `global_vehicle_specs_cache` → preseeded record (exact model match, year inside the record's range) → live provider call if a key exists → heuristic proposal. `Corolla` never matches `Corolla Cross`.

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

| Route | Methods | Auth |
| :--- | :--- | :--- |
| `/api/auth/login` | GET | none |
| `/api/auth/callback/google` | GET | none |
| `/api/auth/me` | GET | none (reports state) |
| `/api/auth/logout` | GET, POST | none |
| `/api/auth/device` | POST, PUT, DELETE | POST: none · PUT/DELETE: bearer |
| `/api/vehicles` | GET, POST | session |
| `/api/fuel` | GET, POST, PUT, DELETE | session + ownership |
| `/api/maintenance` | GET, POST, PUT, DELETE | session + ownership |
| `/api/schedules` | GET, PATCH | session + ownership |
| `/api/reports` | GET | session + ownership |
| `/api/settings` | GET, POST | session |
| `/api/backup` | GET, POST | session |
| `/api/sync` | POST | session or bearer |
| `/api/ai/lookup` | POST | session |
| `/api/ai/manual` | POST | session + ownership |
| `/api/ai/doctor` | POST | session + ownership |
