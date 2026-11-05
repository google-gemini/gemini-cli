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

All behavioral evaluations are stored under the `evals/` directory.

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

### 4. `npm run eval:from-log`

Creates a reviewable behavioral eval draft from one turn in a local Gemini CLI
session. This workflow is deterministic and does not use an LLM or make network
requests. It is useful for carrying the original prompt and tool-call evidence
into an eval, but human judgment is still required to define correct behavior.

See [Drafting an Eval from a Session Log](#drafting-an-eval-from-a-session-log)
for the complete workflow.

---

## Drafting an Eval from a Session Log

A session log records what happened. It does not establish what should have
happened. `eval:from-log` therefore creates a fail-closed draft instead of
claiming to generate a finished regression eval.

The helper automates the mechanical parts with conservative checks:

- Load the repository's current JSONL and legacy JSON session formats.
- List individual plain-text user turns and their observed tool calls.
- Copy only fixture files explicitly selected from the original workspace.
- Render a valid `USUALLY_PASSES` eval with human-supplied tool expectations.
- Run structural validation on the generated source before previewing or writing
  it.

The helper deliberately cannot decide the intended behavior, recover an exact
starting workspace from partial tool output, judge the final answer, or prove a
regression. Those steps remain part of review and fail-before-fix validation.

### 1. Locate the Session and Original Workspace

Sessions are normally stored under the project-specific directory:

```text
~/.gemini/tmp/<project-identifier>/chats/session-*.jsonl
```

Use the CLI to find sessions associated with the current project:

```bash
gemini --list-sessions
```

Inside an interactive session, `/resume` opens the session browser. `/chat` is
an alias. Do not attach a raw session log to a public issue or pull request; it
may contain prompts, paths, tool arguments, tool output, or credentials.

Run `eval:from-log` from the Gemini CLI repository and pass the workspace in
which the session was recorded with `--workspace`. The workspace is used to
redact machine-specific paths, interpret displayed fixture candidates, and
verify the provenance of fixture files selected for the draft.

### 2. Inspect and Select One Turn

```bash
npm run eval:from-log -- \
  --log /path/to/session.jsonl \
  --workspace /path/to/original/workspace \
  --list-turns
```

The output lists eligible user message IDs, a prompt preview, observed tool
names and statuses, and possible fixture paths found in known tool arguments.
Possible paths are suggestions only and may include directories or glob
patterns. Only regular-file paths supplied explicitly with `--fixture` are read.

Only plain-text turns are supported. Multimodal turns are listed as unsupported
instead of being flattened into a potentially different prompt. When a session
contains several eligible turns, select exactly one with `--message-id`.
Persisted conversation-compression summaries are also excluded because they are
model- or system-generated, not original human requests. If compression merged a
summary with retained context, create a small synthetic reproduction instead of
trying to recover that prompt automatically.

### 3. State the Intended Behavior and Starting Files

The expected behavior must come from the contributor, issue, specification, or
maintainer decision, not from the observed trajectory. Supply at least one of:

- `--expect-tool <name>` for a tool that should be called.
- `--forbid-tool <name>` for a tool that must not be called.

Both options are repeatable. The helper resolves legacy aliases and rejects
unknown tool names or a tool that is both expected and forbidden. Assertions are
limited to tools known by the repository's eval validator. Runtime-only MCP or
extension tool names are unsupported unless registry and validator support is
added first.

Choose each required starting file explicitly with a workspace-relative path:

```bash
--fixture src/example.ts --fixture package.json
```

Fixture files are read from the selected workspace, never reconstructed from
`read_file`, `read_many_files`, shell, or MCP results in the log. This matters
because recorded output may be truncated, transformed, partial, or captured
after a mutation. The session project hash must match the selected workspace
before any fixture is accepted. Use `--no-fixtures-needed` only when the
behavior truly has no workspace setup.

### 4. Preview the Draft

Preview is the default and does not modify the repository:

```bash
npm run eval:from-log -- \
  --log /path/to/session.jsonl \
  --workspace /path/to/original/workspace \
  --message-id <user-message-id> \
  --name "uses one batched read for related files" \
  --expect-tool read_many_files \
  --forbid-tool read_file \
  --fixture src/a.ts \
  --fixture src/b.ts
```

Observed calls are printed as evidence but never converted into assertions.
Every generated string is escaped as TypeScript data, and the draft includes a
runtime error after its initial assertions. This guard makes the draft fail even
when its preliminary assertions pass.

### 5. Write Only After Reviewing the Preview

Writing requires both `--write` and an explicit repository-relative output path.
The path must be a direct child of `evals/`, end in `.eval.ts`, and not already
exist.

```bash
npm run eval:from-log -- \
  --log /path/to/session.jsonl \
  --workspace /path/to/original/workspace \
  --message-id <user-message-id> \
  --name "uses one batched read for related files" \
  --expect-tool read_many_files \
  --forbid-tool read_file \
  --fixture src/a.ts \
  --fixture src/b.ts \
  --output evals/batched-related-file-reads.eval.ts \
  --write
```

The command refuses path traversal and existing output files. It reports that
structural validation passed; this does not mean the behavioral eval passed. The
helper never runs the generated eval or contacts a model.

### 6. Complete the Eval Manually

Before submitting the generated file:

1. Review the prompt and every fixture for private or irrelevant information.
2. Replace broad tool-presence checks with precise arguments, ordering, file
   state, or other outcome assertions where appropriate.
3. Run the eval against the behavior before the fix and confirm that it fails at
   the intended assertion rather than at the generated runtime guard.
4. Remove the generated runtime guard, then rerun the pre-fix behavior and
   confirm that the intended failure remains.
5. Run the eval against the fix and confirm that it passes consistently.
6. Run `npm run eval:validate -- evals/<name>.eval.ts` and the normal repository
   checks before opening a pull request.

### Safety Limits

The helper applies conservative local checks, but these checks are not a
guarantee that content is safe to publish.

- It rejects common credential filenames, key files, binary files, invalid
  UTF-8, high-confidence secret patterns, oversized fixtures, and workspace
  escapes.
- It redacts the selected workspace and home directory when those exact paths
  appear in the prompt or fixtures.
- It accepts at most 10 fixtures, 100 KiB per fixture, and 500 KiB total.
- It refuses session files larger than 100 MiB and malformed or non-UTF-8
  session content.
- For rejected prompt or fixture content, it reports secret categories and line
  numbers without echoing matched values.
- It does not inspect or copy arbitrary tool results, model thoughts, or final
  prose into the generated eval.

Always inspect the complete preview. If the prompt or required fixtures contain
sensitive data, create a small synthetic reproduction manually instead.

Run `npm run eval:from-log -- --help` for the full option list and examples.

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
