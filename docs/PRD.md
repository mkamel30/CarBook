# Product Requirements Document (PRD)

**Project:** Car Maintenance Followup
**Revision:** 1 (DRAFT)
**Date:** 2026-10-28T12:01:50.318Z

## 1. Problem Statement

المستخدم دايما بيسجل بيانات تغيير الزيت و الصيانات و بنزين العربية و التكلفة في برامج مختلفة
كمان المستخدم مش بيبقى عارف ايه الصيانات الدورية اللي ممكن تتعمل لموديل العربية بتاعته، و كمان مفيش تنبيه امتى التغيير او الصيانة قرب يتعمل "من خلال متابعة اخر تغيير مع قراءة العداد ODOMETER 

## 2. Target Users

اصحاب السيارات و المستخدمين، كمان الشخص اللي ممكن يشتري السيارة من مالك قديم من خلال تقارير مفصلة عن السيارة

## 3. Desired Outcome

نظام بسيط و سلس عشان يقد المستخدم من خلاله يسجل التفويلات بتاعة البنزين و يبين استهلاك العربية للبنزين و كذلك توقيتات تغيير الزيت و عمل الصيانات اللازمة من خلال ما تم من ادخال سابق لاخر اجراء اتعمل، او تسجيل اول اجراء، كمان يبقى في تقارير تفصيلية و اجمالية عن الصيانات، البنزين، في تواريخ معينة و خلافه

## 4. Scope & Features

### Core Must-Haves (v1.0)
1. **MPV**: MPV working structure

### Explicit Exclusions (Out of Scope)

#### Deferred Features (Future Scope):
cloud integration
vps deployment
android version

## 5. Constraints

#### 1. User-Reported Constraints & Facts:
- **User-Stated Narrative Constraints:** تشغيل محلي اولا و بعد كدة ممكن نعمل ابليكيشن على سرفر او برنامج اندرويد

#### 2. Derived Operational Constraints:
- **Derived Persistence Constraint:** Application state must be persisted locally in SQLite with ACID transaction safety across application restarts.

#### 3. Proposed Controls (Requiring Architecture Approval):
- **Proposed Storage Encryption Control (Requires Architectural Approval):** Local database encryption at rest should be evaluated if sensitive client or financial records are stored locally.

## 6. Requirements Register (Draft - Pending Approval)

| ID | Title | Priority | Category | Associated Criteria IDs |
|---|---|---|---|---|
| REQ-01 | Project Objective & Value | must_have | context | Delivers; Measures |
| REQ-02 | Target Users & Operational Scope | must_have | users | Enforces |
| REQ-03 | MPV | must_have | features | Verifiable |

### Requirements Traceability Matrix

| Requirement ID | Requirement Title | Source Question | Linked Criteria | Criterion Status | Mapping Basis | Mapping Status | Tasks | Coverage Status |
|---|---|---|---|---|---|---|---|---|
| REQ-01 | Project Objective & Value | q_problem_statement | General | Approved | None | None | TASK-01, TASK-02, TASK-03, TASK-06 | Uncovered |
| REQ-02 | Target Users & Operational Scope | q_target_audience | General | Approved | None | None | TASK-05 | Uncovered |
| REQ-03 | MPV | q_core_features_v1 | General | Approved | None | None | TASK-04 | Uncovered |

> [!NOTE] Semantic Coverage & Mapping Basis
> - **Total Requirements:** 3 (0 explicitly covered, 0 partially covered via proposed heuristic, 3 uncovered)
> - **Total Acceptance Criteria:** 0 (0 mapped, 0 unmapped)
> - **Proposed Heuristic vs Approved:** Keyword-derived criterion associations are algorithmic proposals intended for human review during task planning. Presence of a requirement or criterion in a table does NOT constitute verified semantic implementation coverage.
