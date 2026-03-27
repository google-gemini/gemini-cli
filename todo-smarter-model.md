# TODO Smarter Model: Current Gap Ledger

Updated: 2026-03-27 (Asia/Bangkok)

This file tracks the remaining gaps between user intent and the current patch
state for the XDG user-config migration work.

## Evidence reviewed

- Full session transcript in this thread.
- Current working tree and staged diff.
- Targeted audits of changed code, docs, tests, and PR text.
- Verification runs completed in this workspace:
  - `bun run build`
  - `bunx vitest run --config scripts/tests/vitest.config.ts scripts/tests/sandbox_command.test.ts scripts/tests/telemetry_utils.test.ts`
  - `bunx vitest run packages/core/src/utils/paths.test.ts packages/core/src/config/storage.test.ts packages/cli/src/utils/sandbox.test.ts`
  - `bunx vitest run packages/a2a-server/src/config/settings.test.ts packages/a2a-server/src/config/config.test.ts packages/a2a-server/src/config/extension.test.ts`
  - `bunx vitest run packages/cli/src/ui/utils/textOutput.test.ts packages/core/src/utils/stdio.test.ts packages/cli/src/utils/cleanup.test.ts`
  - `bunx vitest run integration-tests/user-policy.test.ts`
  - `bunx vitest run integration-tests/policy-headless.test.ts integration-tests/deprecation-warnings.test.ts`
  - `bunx vitest run packages/core/src/agents/registry.test.ts packages/core/src/policy/memory-manager-policy.test.ts`
  - `bunx vitest run packages/core/src/code_assist/oauth-credential-storage.test.ts`

## 1) Closed items

- [x] `scripts/telemetry_utils.js` runtime crash fixed.
  - `Storage.getGlobalGeminiDir()` is now used for user config resolution.
  - Import smoke test added in `scripts/tests/telemetry_utils.test.ts`.

- [x] `scripts/sandbox_command.js` `.env` precedence fixed.
  - Upward search now checks `./.gemini/.env`, then `./.env`, and only falls
    back to the selected user config `.env` after reaching the filesystem root.
  - Helper test added in `scripts/tests/sandbox_command.test.ts`.

- [x] macOS seatbelt templates now pass the selected user config directory as
      `USER_CONFIG_DIR`.
  - Built-in templates take `USER_CONFIG_DIR`.
  - Launcher passes the resolved real path of the chosen user config dir.

- [x] Realpath guard for dual-config warnings is implemented.
  - If XDG and legacy dirs resolve to the same real path, the warning is
    suppressed.

- [x] Wider-codebase drift in `packages/a2a-server` was fixed.
  - User settings now use `Storage.getGlobalGeminiDir()`.
  - User extensions now resolve from the selected user config dir.
  - User `.env` fallback now matches the main CLI logic.
  - Focused tests were added for settings, extensions, and `.env` lookup.

- [x] `integration-tests/user-policy.test.ts` is no longer coupled to piped
      stdout capture.
  - It now asserts policy behaviour through tool-call telemetry.
  - This avoids false failures in environments where nested child-process pipe
    capture returns empty output.

- [x] `integration-tests/policy-headless.test.ts` was aligned with the current
      headless execution path.
  - The test now pins the recorded model path.
  - It now asserts policy behaviour through tool-call telemetry rather than
    terminal output.

- [x] OpenTelemetry `metricReader` deprecation warning fixed.
  - `NodeSDK` now receives `metricReaders: [metricReader]`.
  - `integration-tests/deprecation-warnings.test.ts` passes.

- [x] The `save_memory` agent now gets exact dynamic policy access to the
      selected user config directory even when `XDG_CONFIG_HOME` points
      somewhere other than the default `~/.config`.
  - `AgentRegistry` now injects exact-path rules for the selected global
    `GEMINI.md` file and its parent directory.
  - A targeted registry test now covers the custom-XDG case.

- [x] OAuth credential migration and cleanup now preserve legacy compatibility
      when XDG and `~/.gemini` both exist.
  - File-based OAuth credential lookup now checks the selected user config path
    first and the legacy `~/.gemini` path second when they are distinct.
  - Cleanup removes both candidate legacy file locations.
  - Focused unit coverage was added in
    `packages/core/src/code_assist/oauth-credential-storage.test.ts`.

## 2) Remaining code or behaviour gaps

- [x] Linux sandboxing does not add any new broad user-config access for this
      change.
  - Bubblewrap access remains driven by workspace mounts, allowed paths, and
    explicitly granted additional permissions.
  - This XDG migration did not add a Linux-side blanket bind of `~/.config` or
    `~/.gemini`.

- [ ] macOS strict seatbelt reads are still broader than the selected user
      config directory.
  - The templates now write only to `USER_CONFIG_DIR`, but the strict macOS
    profiles still allow reads from all of `HOME_DIR/.config`.
  - That is broader than the migration itself requires and may still permit
    access to unrelated config under `~/.config`.

- [ ] Warning cadence is implemented, but not asserted at a higher level.
  - Unit tests cover the path-helper warning-once behaviour.
  - There is still no integration-level assertion proving the user-visible
    conflict warning appears once per process start when the conflict persists.

## 3) Documentation and PR-text gaps still open

- [x] The changed docs were re-reviewed for user-config wording consistency.
  - The main XDG/legacy passages now use the same canonical selection wording in
    `README.md`, `docs/cli/settings.md`, `docs/get-started/authentication.md`,
    and `docs/resources/faq.md`.
  - Project-level `.gemini` references that remain are intentional.

- [x] The PR text received a final precision pass against the latest selection
      logic.
  - The default-selection bullet now correctly covers all three cases: existing
    XDG dir, legacy fallback, and create-XDG-when-neither-exists.

## 4) Process and delivery gaps

- [x] Final holistic review summary has been prepared for delivery.
  - The review work now covers code, docs, tests, fixtures, sandbox behaviour,
    and the final docs/PR wording sweep.

- [x] A final closure matrix now exists.
  - See `closure-matrix-xdg-config-home.md` for the request-to-outcome mapping.

- [x] The earlier `.agents` shell-write failure is now understood.
  - Shell redirection works in `/tmp` and normal repo paths.
  - `.agents` is a separate read-only mount in this workspace, so `exec_command`
    shell redirection there returns `EROFS`.
  - Operational rule for this workspace: do not use shell redirection for
    `.agents/...`; use `apply_patch` instead.

- [ ] Create a reusable script and companion skill for precise single-line file
      edits and removals.
  - This should replace ad hoc shell or Python snippets for deterministic
    one-line mutations.

## 5) Review targets before git workflow resumes

1. [x] Decide whether to narrow the remaining broad `HOME_DIR/.config` read in
       the strict macOS seatbelt profiles, or leave it as an explicit follow-up.
   - Decision: leave it as an explicit follow-up for a separate macOS-focused
     change, rather than broadening or tightening strict profiles here without
     direct macOS validation.
2. [x] Complete the pedantic review and write the final findings-first summary.
3. [ ] Only after the above are closed, return to branch, commit, pull, push,
       and CI work.

## 6) Definition of done

- [x] Code, docs, tests, and PR text all describe the same user-config
      precedence.
- [x] Dual-config warning wording is correct, concrete, and user-visible.
- [x] Remaining `/\.gemini` references are either justified or fixed.
- [x] Sandbox privilege changes are minimum necessary, or any exception is
      explicitly documented.
- [x] The final review summary is delivered with findings first.
- [ ] Git workflow only resumes after the review gate passes.
