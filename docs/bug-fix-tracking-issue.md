# Bug fix tracking issue

Use the content below to open a single GitHub issue (e.g. **"Fix known bugs:
skipped tests, settings merge, context compression, and error handling"**) or to
track bug-fix work locally. Each section can also be split into separate issues
if preferred.

---

## Title (for GitHub)

**Fix known bugs: skipped tests, settings merge, context compression, and error
handling**

---

## Description

This issue tracks a set of bugs identified in the gemini-cli codebase (from
TODOs, skipped tests, and documented workarounds). Fixing them will improve
reliability, test coverage, and maintainability.

---

## 1. Integration / E2E test bugs (re-enable skipped tests)

These tests are currently skipped due to flakiness or environment issues. Fixing
the underlying causes would allow re-enabling them.

| Location                                                 | Issue / TODO       | Description                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integration-tests/run_shell_command.test.ts`            | TODO(#11062)       | **"should combine multiple --allowed-tools flags"** – Un-skip once reliable (e.g. hard-coded expectations).                                                                                              |
| `integration-tests/run_shell_command.test.ts`            | TODO(#11966)       | **"should reject chained commands when only the first segment is allowlisted in non-interactive mode"** – Deflake and re-enable once race is resolved.                                                   |
| `integration-tests/extensions-reload.test.ts`            | TODO(#14527)       | **Extension reload test** – Fails in Linux non-sandbox e2e and in sandbox mode (can't check local extension updates). Re-enable once fixed.                                                              |
| `integration-tests/context-compress-interactive.test.ts` | Inline TODO        | **"should handle compression failure on token inflation"** – Context compression is broken: it doesn’t include system instructions or tool counts, so it thinks compression is beneficial when it isn’t. |
| `integration-tests/stdin-context.test.ts`                | `describe.skip`    | **stdin context** – Fails in sandbox mode (Docker/Podman).                                                                                                                                               |
| `integration-tests/simple-mcp-server.test.ts`            | `describe.skip`    | **simple-mcp-server** – Entire describe is skipped.                                                                                                                                                      |
| `integration-tests/read_many_files.test.ts`              | `it.skip`          | **"should be able to read multiple files"**.                                                                                                                                                             |
| `integration-tests/file-system.test.ts`                  | `it.skip`          | **"should replace multiple instances of a string"**.                                                                                                                                                     |
| `integration-tests/replace.test.ts`                      | Multiple `it.skip` | **"should handle $ literally when replacing..."**, **"should insert a multi-line block..."**, **"should delete a block of text"**.                                                                       |
| `packages/core/src/core/client.test.ts`                  | `it.skip`          | **"will not attempt to compress context after a failure"**.                                                                                                                                              |
| `packages/cli/src/config/config.test.ts`                 | `it.skip`          | **"should combine and resolve paths from settings and CLI arguments"**.                                                                                                                                  |

**Suggested scope:** Start with one or two tests (e.g. #11062 or #11966), make
them stable, then un-skip. Document environment assumptions.

---

## 2. Settings / config merge bug

**Location:** `packages/core/src/config/config.ts` (around lines 989–1008)

**Problem:** Settings loading does not merge the default generation config with
the user’s settings. If the user provides any `generation` settings (e.g. only
`overrides`), default `aliases` are lost. A manual merge hack restores default
aliases/overrides when missing.

**References:**

- Comment: `HACK: The settings loading logic doesn't currently merge...`
- `TODO(12593): Fix the settings loading logic to properly merge defaults and remove this hack.`

**Suggested fix:** Implement proper default merging in the settings loading
layer so this hack can be removed.

---

## 3. Context compression logic bug

**Location:** `integration-tests/context-compress-interactive.test.ts` (lines
53–56) and related compression logic in core.

**Problem:** Context compression does not include system instructions or tool
counts when deciding if compression is beneficial, so it can incorrectly treat
compression as beneficial when it isn’t (token inflation case).

**Suggested fix:** Include system instructions and tool counts in the
compression benefit calculation and re-enable the skipped test **"should handle
compression failure on token inflation"**.

---

## 4. Error handling and edge cases

| Location                                       | Description                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/commands/types.ts`        | `TODO(abhipatel12): Ensure that config is never null` – Avoid null `config` in command context.                                                |
| `packages/cli/src/config/extension-manager.ts` | `TODO: Gracefully handle this call failing, we should back up the old...` – Handle extension manager call failures and back up previous state. |
| `packages/core/src/ide/ide-client.ts`          | `TODO(#3487): use the CLI version here` (two places) – Use CLI version for consistency.                                                        |
| `packages/core/src/agents/local-executor.ts`   | `TODO(joshualitt): This try / catch is inconsistent with the routing...` – Align error handling with routing.                                  |

---

## 5. Platform-specific tests (optional)

These are skipped or conditional on platform; fixing them would improve
cross-platform coverage:

- **Windows:** `packages/cli/src/utils/skillUtils.test.ts` – TODO issue 19388:
  enable linkSkill tests on Windows.
- **Windows:** `packages/cli/src/config/trustedFolders.test.ts` – TODO issue
  19387: enable symlink tests on Windows.

---

## Acceptance criteria (example)

- [ ] At least one of the skipped integration tests (sections 1 or 5) is fixed
      and re-enabled, with a short comment linking to this issue or the specific
      TODO.
- [ ] OR: Settings loading is fixed (section 2) and the config merge hack in
      `config.ts` is removed, with TODO(12593) resolved.
- [ ] OR: Context compression (section 3) is fixed and the skipped test
      **"should handle compression failure on token inflation"** is re-enabled.
- [ ] OR: One of the error-handling TODOs in section 4 is addressed (config null
      safety, extension-manager failure handling, or IDE client version).
- [ ] All changes pass `npm run preflight` and any new/updated tests are stable
      in CI where applicable.

---

## How to use this

1. **Single issue:** Copy the **Title** and **Description** plus the sections
   you care about into a new
   [GitHub issue](https://github.com/google-gemini/gemini-cli/issues/new) (e.g.
   using the Bug Report template and pasting this into "What happened?" /
   "Additional context" or as the main body).
2. **Multiple issues:** Create one issue per section (or per test) and link them
   to a parent "Bug fix” epic or project board.
3. **Local tracking:** Use this file as a checklist while working; open a PR
   that references the GitHub issue(s) you created.

Ensure any PR is linked to the corresponding issue(s) per
[CONTRIBUTING.md](../CONTRIBUTING.md).
