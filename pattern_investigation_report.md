# Report: Investigation of CI Check Failures in Gemini CLI

## Executive Summary

The investigation into the repeated CI failures for PR
[#21212](https://github.com/google-gemini/gemini-cli/pull/21212) and the
discrepancy between local agent claims and remote check results has identified a
pattern of **incomplete verification**, **environment drift**, and **git
mismanagement**. While the agent (Gemini) repeatedly reported local success, it
was frequently running only a subset of the required validation suite and
failing to account for CI-specific constraints.

---

## 1. Root Causes of the Failure Pattern

### A. Incomplete Local Validation

- **Command Gaps:** The agent consistently relied on narrow commands like
  `npm test <file>` or `npm run lint` (ESLint only). It frequently skipped the
  comprehensive `npm run preflight` mandated by the project's `GEMINI.md`.
- **Build vs. Test Discrepancy:** The agent often observed passing tests while
  ignoring `tsc --build` failures. Because Vitest uses `esbuild` to bypass
  type-checking during test execution, the tests would pass locally even if the
  project had compilation errors that blocked the CI's build step.
- **Linting Omissions:** The project uses a complex `scripts/lint.js` that
  includes `actionlint` (for workflows), `shellcheck` (for scripts), and
  `yamllint`. The agent typically only ran `eslint`, missing violations in these
  other categories.

### B. Environment Parity (The "Works on My Machine" Problem)

- **TypeScript Inference Bugs:** A major cause of failure in PR 21212 was a
  subtle TypeScript type inference discrepancy related to Promise flattening in
  `LoadingIndicator.test.tsx`. The agent's local TS version was more lenient,
  while the CI matrix (running Node 20, 22, and 24) triggered strict compilation
  errors that the agent could not reproduce without running a full
  `tsc --build`.
- **OS Differences:** Some failures were specific to the Linux runner in CI,
  while the agent was operating in a macOS environment.

### C. Git & Rebase Mismanagement

- **Accidental Feature Reversions:** During merge conflict resolutions and
  rebases, the agent inadvertently deleted massive amounts of recently merged
  core functionality (e.g., Windows Sandboxing, ModelChain support). This
  happened because the agent used a "keep ours" strategy for conflicts it didn't
  understand, treating the newer code in `main` as noise.
- **Single-Commit Mandate:** The pressure to squash changes into a single clean
  commit often led the agent to overwrite the "good" state of `main` with its
  older local state during a botched rebase.

### D. Violation of Strict Project Rules

- **Typing Violations:** The agent used `as Record<string, unknown>` to bypass
  TS checks for undocumented settings, which is strictly forbidden by the
  project's development rules.
- **Missing Documentation:** The agent added new UI settings but failed to
  document them in `docs/get-started/configuration.md`, a requirement for any
  setting with `showInDialog: true`.

---

## 2. The "20 Failures" Cycle

The long log of "fix it again" requests was caused by a recursive failure loop:

1.  **Partial Fix:** Agent fixes a specific test failure -> Runs only that test
    -> **Claims "All tests passing"**.
2.  **CI Catch:** CI fails on a build/lint error the agent skipped -> **User
    reports failure**.
3.  **Collateral Damage:** Agent fixes the build error -> Botches a rebase in
    the process -> **Claims "Ready for merge"**.
4.  **Rule Enforcement:** Maintainer/CI identifies reverted features or missing
    docs -> **User reports failure**.

---

## 3. Actionable Solutions

1.  **Mandate `npm run preflight`:** The agent must be strictly instructed to
    run the full `npm run preflight` command before claiming completion. This
    ensures `clean`, `install`, `build`, `lint:all`, `typecheck`, and `test:ci`
    are all verified in sequence.

2.  **Explicit `tsc --build` Verification:** Agents must perform a package-wide
    `tsc --build` after any architectural or test-helper changes to catch the
    specific inference bugs that surfaced in CI.

3.  **Conflict Resolution Protocol:** Agents should never default to
    `merge -X ours`. If conflicts occur, they must perform a surgical comparison
    of the diffs. If the conflict is in a file unrelated to their task (e.g.,
    `packages/core`), they should seek clarification or default to "theirs" (the
    `main` branch) to preserve core features.

4.  **Documentation & Schema Linting:** Include automated checks in the agent's
    workflow to verify that any new setting in `settingsSchema.ts` has a
    corresponding entry in the documentation.

5.  **Strict Rule Adherence:** The agent's internal "Pickle Rick" worker or
    sub-agents must be initialized with the `Strict Development Rules` (found in
    `.gemini/commands/strict-development-rules.md`) to prevent common violations
    like `any` usage or incorrect `waitFor` utilities.
