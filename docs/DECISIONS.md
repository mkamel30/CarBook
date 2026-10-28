# Architectural and Technical Decisions

**Project:** Car Maintenance Followup
**Date:** 2026-10-28T12:01:50.318Z

## Decision Register (Draft - Pending Approval)

| ID | Title | Decision | Rationale | Origin | Status |
|---|---|---|---|---|---|
| DEC-01 | Persistence Strategy | sqlite_local | Selected in discovery wizard answers | user_explicit | approved |
| DEC-02 | Application Architecture & Stack | Next.js (App Router) + TypeScript + Tailwind CSS + Drizzle ORM + SQLite + Vitest | Full-stack TypeScript with local SQLite ACID persistence, bilingual support, and headless testability | user_explicit | approved |
| DEC-03 | Coding Target Profile | antigravity | Configured coding agent target profile convention | user_explicit | approved |
| DEC-04 | Access Control & Authentication Strategy | Baseline Local Auth & Session Management + Shareable Buyer Inspection Report | Single-owner local auth baseline with session cookies; read-only vehicle history export for buyers | user_explicit | approved |
