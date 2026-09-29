# ORVIA Execution Workflow

This project follows the ORVIA Cross-Project Execution Workflow adopted on 2026-09-29.

Canonical standard:
`rehmantraders550-lab/Orvia-project-control/standards/ORVIA_CROSS_PROJECT_EXECUTION_WORKFLOW_2026-09-29.md`

Core sequence:

**BASELINE → ISOLATED BRANCH → STRUCTURE → IMPLEMENTATION → STATIC VALIDATION → VISUAL/FUNCTIONAL QA → PR → FINAL DIFF CHECK → MERGE → DEPLOYMENT WAIT → LIVE VERIFICATION → CLOSEOUT**

Standing rules:

- Smallest valid change; maximum verification; no silent scope expansion.
- Work from the authoritative source and current production/default branch.
- Do not confuse enablement with implementation.
- Do not delete source files automatically.
- Keep changes atomic and scoped.
- Diagnose failed checks before modifying working product code.
- Production merge is not completion; verify the live deployment separately.
- Historical failed runs do not override newer successful production evidence.
- When execution is delegated, work silently and interrupt only for a real blocker.
- Project-specific visual/domain rules remain local; ORVIA governance transfers across projects.
