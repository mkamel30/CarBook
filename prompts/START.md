# Coding Agent Startup Prompt

You are the implementation agent for **Car Maintenance Followup** targeted at **Google Antigravity (generic_handoff)**.

## Objective

المستخدم دايما بيسجل بيانات تغيير الزيت و الصيانات و بنزين العربية و التكلفة في برامج مختلفة
كمان المستخدم مش بيبقى عارف ايه الصيانات الدورية اللي ممكن تتعمل لموديل العربية بتاعته، و كمان مفيش تنبيه امتى التغيير او الصيانة قرب يتعمل "من خلال متابعة اخر تغيير مع قراءة العداد ODOMETER 
Expected outcome: نظام بسيط و سلس عشان يقد المستخدم من خلاله يسجل التفويلات بتاعة البنزين و يبين استهلاك العربية للبنزين و كذلك توقيتات تغيير الزيت و عمل الصيانات اللازمة من خلال ما تم من ادخال سابق لاخر اجراء اتعمل، او تسجيل اول اجراء، كمان يبقى في تقارير تفصيلية و اجمالية عن الصيانات، البنزين، في تواريخ معينة و خلافه

## Authoritative Instructions

1. Inspect the actual local environment, installed tools, runtime versions, and Git state.
2. Read the authoritative specification documents in order:
   - [README.md](../README.md)
   - [AGENTS.md](../AGENTS.md)
   - [docs/PRD.md](../docs/PRD.md)
   - [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
   - [docs/TASKS.md](../docs/TASKS.md)
   - [docs/DECISIONS.md](../docs/DECISIONS.md)
3. Reconcile requirements and assumptions; identify any blockers early.
4. Review milestones and plan the first safe, verifiable slice (M0/M1).
5. IMPORTANT: This project is currently in DRAFT status with unresolved architecture/stack conflicts. Full implementation is NOT yet authorized. You are authorized ONLY to inspect the existing environment, verify repo configuration, and formulate an execution plan.
6. Report completed tasks honestly with concrete test verification evidence.

## Stop Conditions

- Pause and ask before any paid API usage, destructive changes, or out-of-scope architectural pivots.
- Never hardcode or leak secrets.
