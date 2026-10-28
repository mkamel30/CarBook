# System Architecture

**Project:** Car Maintenance Followup
**Date:** 2026-10-28T12:01:50.318Z

## 1. Technical Baseline

- **Primary Stack:** no_preference
- **Data Persistence:** sqlite_local
- **UI Density & UX:** compact_workbench
- **Target Coding Agent:** Google Antigravity (generic_handoff)

## 2. Module Overview

The project is structured into modular application boundaries:
1. **Domain Layer:** Pure data models, schemas, and business invariant validation.
2. **Services & Business Logic Layer:** Workflow orchestration, core calculations, and data processing.
3. **Persistence Layer:** Data access layer (sqlite_local) with transactional boundaries.
4. **User Interface / Presentation:** Responsive interface components with localized typography.

## 3. Data Flow & Trust Boundaries

1. **Input Validation:** User inputs flow through schema validation before mutation.
2. **Transactional Persistence:** Validated state is committed to persisted storage (sqlite_local).
3. **Presentation:** Views and outputs reflect confirmed persistent state.

## 4. Architectural Invariants

1. Store validated structured data as the authoritative truth.
2. Keep business logic strictly independent from the UI and provider SDKs.
3. Keep all credentials securely isolated on the server in protected session memory; never persist or bundle secrets into client distributions.
4. Bounded retries (maximum 3 attempts with exponential backoff) strictly for safely retryable, idempotent operations; non-idempotent mutations must fail explicitly with transaction rollback rather than blind retries.
