# Repository Instructions

## Product

Build **Car Maintenance Followup**: turning verified requirements into a high-quality implementation.

See [docs/PRD.md](docs/PRD.md) for full scope and acceptance criteria.

## Core Rules

1. Preserve existing files and owner changes; do not rewrite or delete uninspected code.
2. Store project truth as validated structured data.
3. Treat AI output as proposed data, never as unverified authority.
4. Keep English engineering documents authoritative.
5. Never put secrets or credentials in client bundles, logs, Git, or prompts.
6. Verify external API and coding-target conventions before relying on them.
7. Do not mark tasks complete without concrete automated test evidence.
8. Use bounded retries and explicit failure states.

## Working Method

Review [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/TASKS.md](docs/TASKS.md) in that order.
Implement small changes, test them, inspect the interface, and review the diff.

> [!NOTE] Specification Approved
> Architecture decisions (DEC-01 to DEC-04) are approved. Implementation follows milestone order starting with M0 (TASK-01, TASK-02).

Target Profile: Google Antigravity (v1.0.0).
Instruction loading convention: Antigravity discovers AGENTS.md in project root or custom rules in .gemini/rules.
Skill path convention: Skills organized with SKILL.md under .gemini/skills/ or portable skills/ directory.

## Important References

- [docs/PRD.md](docs/PRD.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/TASKS.md](docs/TASKS.md)
- [docs/DESIGN.md](docs/DESIGN.md)
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)

## Prompts

- [prompts/START.md](prompts/START.md) — Initial environment inspection and first milestone execution.
- [prompts/PLAN.md](prompts/PLAN.md) — Scope interpretation and verification strategy.
- [prompts/IMPLEMENT.md](prompts/IMPLEMENT.md) — Task-specific execution rules and stop conditions.
- [prompts/REVIEW.md](prompts/REVIEW.md) — Structured findings, evidence, and verification.
- [prompts/RESUME.md](prompts/RESUME.md) — Resuming work from persisted state and last checkpoint.
