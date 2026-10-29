# CarBook Architecture & Technical Specification

> **Version:** 1.0.0  
> **Target:** Local-First Web Application (Desktop & Mobile Responsive)  
> **Core Principle:** Offline-First, Privacy-Preserving, Zero-External-Dependency for Core Operations.

---

## 1. Architectural Philosophy

CarBook is built with an **Offline-First Clean Architecture** design. Unlike cloud-dependent fleet management platforms, CarBook preserves the user's vehicle history locally in SQLite, requiring zero cloud accounts or mandatory remote telemetry. 

External AI services (Google Gemini & OpenRouter) are strictly opt-in and handled via isolated server-side endpoints, ensuring API credentials never leak into client web bundles.

---

## 2. Layered Structure

The project strictly decouples presentation from core domain logic and persistence:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│    Next.js 15 App Router • React 19 • Tailwind CSS • Cairo   │
│         Dynamic RTL / LTR Multilingual Context (i18n)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON API
┌──────────────────────────────▼──────────────────────────────┐
│                    Application API Layer                    │
│     /api/vehicles • /api/fuel • /api/maintenance            │
│     /api/schedules • /api/reports • /api/ai/doctor /manual  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Services & Business Logic                  │
│   • Calculator: Fuel efficiency (L/100km, km/L, cost/km)    │
│   • Evaluator: Mileage & time-based alert status            │
│   • AI Gateway: Bounded retries, SSRF protection, Zod check │
│   • i18n Engine: .cfg key-value configuration parser        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Domain & Validation Layer                  │
│       Zod Schemas: Vehicles, Specs, FuelLogs, Maintenance    │
│            Immutable business rules & data contracts        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                     Persistence Layer                       │
│    LibSQL / SQLite • Drizzle ORM • ACID Transactions        │
│          Automatic schema migrations & fallback SQLite       │
└─────────────────────────────────────────────────────────────┘
```

### A. Domain Layer (`src/domain/`)
- Pure data models and business invariant validation using **Zod**.
- Enforces non-negative odometer readings, non-empty vehicle names, chronological date validations, and structured OEM specs schemas (`VehicleSpecs`).

### B. Business Logic & Calculation Engine (`src/services/`)
- **Calculator (`calculator.ts`):**
  - Bidirectional calculations between fuel quantity (liters) and total cost.
  - Per-fill consumption:
    $$\text{L/100km} = \left(\frac{\text{Liters Used}}{\text{Distance Traveled (km)}}\right) \times 100$$
    $$\text{Cost/km} = \frac{\text{Total Cost}}{\text{Distance Traveled (km)}}$$
  - Schedule status classification: `ok`, `due_soon` ($\le 1,000$ km or $\le 30$ days), or `overdue`.
- **AI Gateway (`ai.ts`):**
  - Bounded retries (maximum 3 attempts with model fallbacks).
  - Strict SSRF protection (rejects loopback IPs `127.0.0.1`, `localhost`, `169.254.169.254` and non-HTTPS protocols).
  - Schema-grounded response extraction with resilient JSON fence parsing.
- **i18n Engine (`src/i18n/`):**
  - Config file parser for `.cfg` format (ignores comments `#`, whitespace, handles quoted/unquoted values).
  - Zero-overhead client bundling for instant offline translation.

### C. Persistence Layer (`src/persistence/`)
- Powered by **LibSQL client** (`@libsql/client`) providing zero-native-compilation SQLite operations on Windows, Linux, and macOS.
- Integrated schema migrations ensure backward compatibility when new fields are added (e.g. `specs` in `vehiclesTable`, `parts_list` in `maintenanceLogsTable`).
- Repository pattern (`StorageRepository`) encapsulates all SQL queries and transactions.

### D. Presentation & UI Layer (`src/app/`)
- **Tailwind CSS** with custom dark palette tailored for high-contrast garage and automotive readability.
- **Bi-directional Layout Support (RTL / LTR):**
  - Native CSS logical properties (`text-start`, `text-end`, dynamic border placement).
  - Google Cairo font optimized for Arabic and Latin character sets.

---

## 3. Security Architecture

1. **Zero Credential Exposure:**
   - All AI API keys are stored in the local SQLite table `app_settings` or server environment variables.
   - API keys are never bundled into client-side JavaScript or returned raw over `/api/settings` (only masked strings like `sk-or-v1-••••` are exposed for UI indication).
2. **SSRF Guardrails:**
   - Outgoing requests to AI providers validate protocol (`https:`) and hostnames, preventing server-side request forgery into private intranets or cloud metadata endpoints.
3. **Bounded Retries & Error Boundaries:**
   - External network calls fail gracefully with explicit user-friendly error banners rather than hanging client state or infinite retry loops.

---

## 4. Verification & Testing Strategy

- **Unit & Integration Suite (`vitest`):**
  - `tests/baseline.test.ts`: Baseline environment sanity.
  - `tests/storage.test.ts`: In-memory SQLite repository operations, vehicle creation, fuel logging, maintenance with multi-part items, and settings persistence.
  - `tests/calculator.test.ts`: Consumption algorithms, maintenance alert rules, bounded retries, SSRF rejection, OEM specs validation, and AI doctor prompt groundings.
  - `tests/i18n.test.ts`: `.cfg` parser syntax, comment filtering, and key-value mapping.
- **Static Typing (`tsc --noEmit`):**
  - Strict TypeScript mode enabled across all files with zero type errors.
