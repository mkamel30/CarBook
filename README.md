<div align="center">

# CarBook

### The service logbook your car actually deserves

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-LibSQL-003B57?logo=sqlite)](https://libsql.org/)
[![Tests](https://img.shields.io/badge/Tests-201%20passing-brightgreen?logo=vitest)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

**[English](README.md)** • **[العربية](README.ar.md)** • **[Architecture](docs/ARCHITECTURE.md)** • **[API](docs/API.md)** • **[Deployment](docs/DEPLOYMENT.md)**

</div>

---

## What CarBook is

CarBook is a personal vehicle logbook. It tracks what you put in the tank, what the workshop did to the car, and what is due next — then tells you the truth about the numbers instead of rounding them away.

It is written for one owner with real data, not for a fleet dashboard. Everything runs on a single SQLite file, there is no third-party backend service, and no analytics of any kind.

What you can do with it:

- **Log fuel with exact figures.** Liters and total cost calculate each other from the price per liter, and decimal fractions are kept as entered (`40.584 L` stays `40.584 L`).
- **Read real consumption.** Distance, L/100 km, km/L and cost per km are derived between *full-tank* fills only. A partial top-up is stored, but it is not shown as a consumption figure, because dividing by an unknown distance produces a number that looks precise and is not.
- **Itemise maintenance invoices.** Multiple spare parts per service, each marked new/OEM or imported/used, with parts and labor summed automatically.
- **Get schedule alerts.** Oil, filters, plugs, brakes, coolant and transmission fluid are evaluated against both mileage and elapsed time, and shown as *ok*, *due soon* or *overdue*. You can set the baseline yourself — if the plugs were actually changed at 50,000 km, say so, and the countdown starts there.
- **Keep factory specifications on hand.** Oil viscosity and capacity, ATF/CVT fluid, coolant and brake fluid standards, cold tire pressures, tank capacity, recommended octane, plug type and battery rating — looked up once and cached in the database.
- **Ask the AI car doctor.** It answers with your make, model, year, current odometer and last five services in the prompt, so the advice is about your car rather than cars in general.
- **Export and print.** Multi-sheet Excel workbooks (maintenance, fuel, specs) and an A4-styled inspection report for a buyer or an inspector.
- **Back up your records.** A JSON export of every vehicle, fill, invoice and schedule, and a restore that defaults to *merge* — it re-adds missing records and never overwrites what is already there. Preferences (fuel prices, theme, language) are not part of that file.

Three languages are built in: **Arabic** (RTL, Cairo font), **English**, and **Polish**. Four themes ship with it — Material 3 Expressive (default), Glassmorphism, Light Minimal and Terminal.

---

## How it is built

| Layer | Technology |
| :--- | :--- |
| Web app & API | Next.js 15.5 (App Router), React 19.3, TypeScript 5.7 |
| Styling | Tailwind CSS 3.4, CSS-variable themes, Lucide icons, Google Cairo |
| Database | SQLite via `@libsql/client`, Drizzle ORM for reads, parameterised SQL for the sync engine |
| Validation | Zod 3.24 (domain schemas on every write — REST and per-row sync pushes) |
| Spreadsheets | `xlsx` (SheetJS) |
| Device shell | Capacitor 8.6 + a separate Vite/React app in [`mobile/`](mobile/) with WatermelonDB 0.28 |
| Tests | Vitest 3 — 201 tests across 24 files (server workspace, at time of writing), plus a separate `mobile/` suite |

The repository has two applications in it:

```
src/            Next.js web app: UI, API routes, services, persistence
  app/api/        18 route files / 34 method handlers (vehicles, fuel,
                  maintenance, schedules, reports, settings,
                  settings/fuel-prices, backup, sync, auth/* incl.
                  token-login, ai/*)
  domain/         Zod schemas — the single definition of valid data
  persistence/    db.ts (connection + migrations), repository.ts, sync.ts
  services/       calculator, ai, aiOrchestrator, automotiveDatabase,
                  exportExcel, backup, auth, authz, deviceAuth, rateLimit,
                  geoPricing, presets
  i18n/           .cfg parser + ar/en/pl dictionaries (runtime source of truth)
  locales/        generated .cfg mirrors — pnpm gen:locales, never hand-edited
  theme/          theme context and token definitions
mobile/         Vite + React + WatermelonDB offline client (Capacitor target)
docs/           ARCHITECTURE.md, API.md, DEPLOYMENT.md
tests/          server-side suite
```

Full detail lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Accounts, tenancy and offline

CarBook started as a single-user local tool and grew an account system, so it is worth being precise about where it stands.

**Every row belongs to someone.** `vehicles.user_id` owns a car; fuel logs, maintenance logs and schedules inherit ownership through their vehicle. Each API handler resolves the caller first and checks record ownership second. A record you do not own and a record that does not exist both answer `404`, so ids cannot be probed to learn which is which. Anonymous callers get an empty list, never the unassigned legacy rows.

**Guest mode is a real account, not a null.** A device that has not signed in registers as `guest:<deviceId>` with `is_guest = 1`. Guest data is scoped, readable and syncable with no special cases, and linking to a real account reassigns the vehicles and their logs in one transaction, re-stamping the sync sequence so the account's other devices pull the merged history.

**Sync is a cursor, not a diff.** Each row carries `rev` (per-row version), `seq` (global monotonic counter) and `deleted` (tombstone); `sync_ts` decides last-write-wins. A device asks for everything with `seq > since`, pushes its dirty rows, applies the answer, then advances the cursor — and only clears a dirty flag for the exact revision the server accepted, so an edit made while the request was in flight is never lost.

**Honest status of the offline work.** The sync contract, the device data layer and the guest/linking flow are implemented and tested end to end in-process. The OAuth → device handoff **exists**: browser sign-in mints a single-use 10-minute code, the callback deep-links `carbook://login?code=…`, `MainActivity` parses it (a legacy `?token=` path for old installs stays readable only until the dual-read window closes, no earlier than 2026-12-01), and the app redeems it at `/api/auth/token-login` for its own session cookie — no durable token in any URL. Note that Google sign-in and the AI features require network by design; the logbook itself works offline on a device once the shell ships. What is *not* finished:

- The Capacitor shell still points at the remote site (`server.url`) instead of serving bundled assets, so true offline is not yet reachable on a phone. An offline-APK program is in progress (the `mobile/` shell mounts the real web UI over an on-device fetch bridge and the sync runtime); no finished on-device build is being claimed or promised.
- HTTPS is configured on the reference deployment (Let's Encrypt against an `sslip.io` name), and the `secure` session cookie depends on it — a self-host without TLS cannot sign in.

See the roadmap section in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Getting started

Prerequisites: Node.js ≥ 18.18 (developed on v24) and **pnpm** — the repository keeps a single `pnpm-lock.yaml` at the root and one in `mobile/` (the npm lockfile was deliberately dropped); CI installs with `pnpm install --frozen-lockfile`.

```bash
git clone https://github.com/mkamel30/CarBook.git
cd CarBook
pnpm install
cp .env.example .env.local
pnpm dev             # http://localhost:3070
```

The database is created on first run at `car_maintenance.db` in the project root. Point it somewhere else with `CARBOOK_DB_PATH` — that is how a deployment keeps data outside the checkout, and how the test suite avoids touching it.

Google sign-in needs real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` values and a registered redirect URI; with placeholders left in place Google answers `401 invalid_client`. Browsing works without signing in; on the web, saving data requires a session (the phone app instead registers a guest device identity automatically).

```bash
pnpm test            # 201 tests at time of writing: tests/ plus the colocated src/ suites
pnpm typecheck       # tsc --noEmit, strict
pnpm lint            # next lint — errors block, warnings ratchet down (237 at time of writing)
pnpm build           # production build
```

The mobile client is a separate workspace (the root `pnpm test` does not run it — CI runs both):

```bash
cd mobile
pnpm install
pnpm test            # device store semantics + device<->server e2e sync; growing with the offline program
pnpm build
```

---

## Security

What is actually enforced, and what is not:

- **Authorization on every route.** `requireUser` for the session, `requireOwnership` for the record, both in [`src/services/authz.ts`](src/services/authz.ts). Table names reaching SQL come from an allowlist, never from the request. Values are always parameterised.
- **Session handling.** A 7-day `httpOnly` `carbook_session` cookie for the browser, a 15-minute bearer token for the device shell. Every new cookie's JWT carries a `jti`, and logout revokes it server-side (a persisted, restart-safe deny-list) — a logged-out cookie stops working even if the client kept it. `JWT_SECRET` must stay stable across restarts or every session drops. In production the cookie is `secure`, which is why HTTPS is not optional.
- **Sign-in handoff.** The mobile OAuth handoff uses a single-use, 10-minute, SHA-256-stored authorization code redeemed at `/api/auth/token-login?code=…` — never a durable token in a URL. A state nonce (cookie + `state`, compared constant-time) gates the callback against CSRF. A legacy `?token=` dual-read stays open for older installs until 2026-12-01 at the earliest, so deploy the server before any APK ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- **Abuse throttling.** In-route sliding-window limiters ([`src/services/rateLimit.ts`](src/services/rateLimit.ts)) answer `429` with `Retry-After`: login and token-login 10/min per IP, device auth 20/min per IP, AI endpoints 10/min per user. Throttling only — the IP header is advisory and never an authorization input.
- **Device tokens.** Only the SHA-256 of a refresh token is stored. Tokens rotate on use; replaying an old one is treated as theft and revokes the device's sessions. A token is bound to the device that minted it.
- **AI requests.** Outgoing calls require plain HTTPS, refuse credentials embedded in the URL, and reject loopback, RFC 1918, CGNAT, link-local, IPv6 local/multicast and cloud-metadata addresses in every `inet_aton` spelling (dotted quad, decimal, octal, hex, abbreviated). Redirects are not followed, because following one would replay the bearer key to the redirect target. Every request carries a deadline. Retries are bounded at three, and a permanent failure (bad credentials, rejected URL) escapes the loop on the first attempt instead of burning quota three times.
  - *Known limit:* this validates the URL text. A hostname that resolves to a private address — DNS rebinding — needs resolve-then-dial at a layer that can hold a socket, which this one does not.
- **Secrets.** BYOK AI keys live in `app_settings` per user (one user's key is invisible to another), server keys in the environment; both are never bundled into client JavaScript, and `/api/settings` only ever returns a masked form. They are plaintext-at-rest — the codebase does not encrypt them and the docs and the `is_encrypted` column say so honestly.
- **No telemetry.** There is no analytics, no tracking, no third-party call except the AI provider you configure.

---

## Adding a language

The runtime dictionaries are TypeScript modules in [`src/i18n/`](src/i18n/) (`ar_cfg.ts`, `en_cfg.ts`, `pl_cfg.ts`), parsed from `.cfg` key-value text at load — they are the single source of truth. `src/locales/*.cfg` are **generated mirrors** for translators, produced by `pnpm gen:locales` and marked "do not edit by hand"; a parity test in `tests/i18n.test.ts` fails CI if they ever drift from the dictionaries.

To add a language: copy an existing dictionary, register it in `SUPPORTED_LANGUAGES` in [`src/i18n/config.ts`](src/i18n/config.ts), and translate. Missing keys fall back English → Arabic → the literal key, so a half-finished translation still renders.

Content strings should branch on `lang !== 'ar'` (Arabic versus the English fallback), not on `lang === 'en'` — the latter silently shows English to every other locale.

---

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, data model, sync protocol, security model, test map
- [docs/API.md](docs/API.md) — every endpoint, its contract and its auth requirement
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — self-hosting runbook, environment reference, backup, roadmap
- [README.ar.md](README.ar.md) — Arabic documentation

---

## License

MIT — see [LICENSE](LICENSE) (Copyright (c) 2026 Mostafa Kamel).
