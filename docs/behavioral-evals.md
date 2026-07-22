# Behavioral Evaluations & EDK Guide

This guide introduces the **Eval Development Kit (EDK)** and details how to
write, validate, run, and report on **behavioral evaluations** in the Gemini CLI
codebase.

---

## Overview

Behavioral evaluations are automated tests designed to assert on the
**behavior** of the Gemini CLI agent (e.g., verifying which tools are called,
checking call ordering, or avoiding destructive commands) rather than checking
the final prose output.

Evaluating agent behavior is critical because:

1. Model responses are non-deterministic, making exact prose matching highly
   fragile.
2. We must ensure the model utilizes the most efficient tools (e.g., batching
   files via `read_many_files` instead of sequential `read_file` calls).
3. We must enforce safety boundaries (e.g., preventing execution of raw shell
   commands when safe alternatives exist).

All behavioral evaluations are stored under the
[evals/](file:///c:/coding/gemini-cli/evals/) directory.

---

## EDK Developer Commands

The EDK provides CLI tools under `scripts/` to help contributors audit, check,
and monitor evals.

### 1. `npm run eval:inventory`

Scans all eval files under `evals/`, statically parses them, and provides a
structured overview of what exists in the repository.

- **Usage:**
  ```bash
  npm run eval:inventory
  ```
- **JSON Output:** For CI integration or inventory indexing, generate a
  machine-readable JSON report:
  ```bash
  npm run eval:inventory -- --json
  ```
- **Custom Root:** Run against another directory or repository:
  ```bash
  npm run eval:inventory -- --root /path/to/other/repo
  ```

---

### 2. `npm run eval:validate`

A lint-like checker that validates eval source files against standard structural
guidelines and best practices.

- **Usage:**
  ```bash
  npm run eval:validate
  ```
- **Custom Scopes:** Validate a specific file:
  ```bash
  npm run eval:validate -- evals/my-test.eval.ts
  ```

#### Validation Rules & Severities

| Rule ID              | Severity    | Description                                                                                                            |
| :------------------- | :---------- | :--------------------------------------------------------------------------------------------------------------------- |
| `file-naming`        | **Error**   | File must match `*.eval.ts` or `*.eval.tsx` naming conventions.                                                        |
| `valid-policy`       | **Error**   | Policy must be one of `ALWAYS_PASSES`, `USUALLY_PASSES`, or `USUALLY_FAILS`.                                           |
| `suite-metadata`     | **Error**   | Both `suiteName` and `suiteType` must be present as static string literals.                                            |
| `prompt-presence`    | **Error**   | Every eval case must have a non-empty `prompt` string.                                                                 |
| `case-name-static`   | **Error**   | The case name must be a static string literal, not computed dynamically.                                               |
| `invalid-tool-refs`  | **Error**   | All tools referenced in assertions must match known built-in or legacy tools.                                          |
| `positive-assertion` | **Error**   | Evaluation cases must assert on at least one tool call (e.g., check `waitForToolCall` has been invoked).               |
| `workspace-setup`    | **Error**   | Workspace behaviors (like file-system edits/reads) must set up a `files` object.                                       |
| `new-evals-policy`   | **Warning** | New evals must not use `ALWAYS_PASSES` policy initially (they should be promoted after nightly data proves stability). |

Warnings (`new-evals-policy`) will be logged with `⚠` and will **not** cause
the CLI process to exit with status `1`. Errors (`✗`) will block CI builds and
return exit status `1`.

---

### 3. `npm run eval:report`

Aggregates local vitest `report.json` artifacts, maps them against inventory
policies, and summarizes the pass rates per model.

- **Usage:**
  ```bash
  npm run eval:report
  ```
  By default, it scans `evals/logs/` recursively for `report.json` files.
- **Specifying Directory:**
  ```bash
  npm run eval:report -- /path/to/logs
  ```
- **JSON Output:**
  ```bash
  npm run eval:report -- --json
  ```

---

## Contributor Workflow

When writing a new behavioral evaluation, adhere to this workflow to ensure
high-quality, non-flaky test runs.

### Step-by-Step Guide

1. **Identify the Target Behavior**: Determine which tool calls need
   verification (e.g., `web_fetch` must be called).
2. **Author the Eval File**: Create your file under `evals/<name>.eval.ts`
   naming it properly.
3. **Configure Workspace Files**: If the eval reads or edits files, define them
   inside the `files` metadata field.
4. **Assert Behavior, Not Prose**: Ensure the `assert` block checks tool
   interactions using `rig.waitForToolCall` or similar. Do not check final
   prose.
5. **Run Locally**:
   ```bash
   RUN_EVALS=true npx vitest run evals/my-test.eval.ts
   ```
6. **Deflake**: Run your eval at least 3 times locally to verify it does not
   fail due to model variance.
7. **Run Validation**: Run `npm run eval:validate` to ensure no linting errors
   are present.

### Acceptance Criteria Checklist

- [ ] **Naming**: File ends with `.eval.ts` or `.eval.tsx`.
- [ ] **Policy**: New evals start as `USUALLY_PASSES`.
- [ ] **Metadata**: Static `suiteName` and `suiteType` (e.g. `'behavioral'`) are
      specified.
- [ ] **Assertions**: Uses `rig.waitForToolCall` or asserts tool arguments
      explicitly.
- [ ] **Clean workspace**: Does not write to files outside `rig.testDir`.

### Common Anti-Patterns to Avoid

- **Restricting core tools**: Never override `settings.tools.core` to limit
  tools. Evals must run against the default toolset.
- **Checking model prose**: Avoid `expect(result).toContain('something')` since
  model wording is non-deterministic.
- **Integration-only testing**: Evals that only write files without checking
  realistic model prompts are integration tests and belong under
  `integration-tests/`.

---

## CI & Dashboard Integration

You can easily automate behavioral evaluations or compile dashboard data using
EDK's JSON reporters.

### CI Validation Block

Add a step in your PR checks or GitHub workflows to automatically lint new evals
and block pull requests containing validation errors:

```yaml
- name: Run Eval Validator
  run: npm run eval:validate
```

### Publishing to a Dashboard

To record nightly performance metrics across multiple models:

1. Configure your workflow to run evaluations with the JSON reporter:
   ```bash
   cross-env GEMINI_MODEL=gemini-2.5-pro npx vitest run --config evals/vitest.config.ts --reporter=json --outputFile="evals/logs/eval-logs-gemini-2.5-pro/report.json"
   ```
2. Aggregate all test runs using the reporting tool:
   ```bash
   npm run eval:report -- evals/logs --json > aggregated_report.json
   ```
3. Upload `aggregated_report.json` to your dashboard storage backend to
   visualize pass rates over time.
