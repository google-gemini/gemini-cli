# Ralph Wiggum mode

Ralph Wiggum mode is an iterative automation technique that lets Gemini CLI
repeatedly execute a prompt until a specific goal is met. This mode is designed
for tasks that benefit from persistent refinement, such as fixing failing tests
or performing complex refactoring.

> **Note:** This is a preview feature currently under active development.

## Overview

Inspired by the "Ralph Wiggum" technique, this mode treats failures as data and
uses a feedback loop to reach a successful state. When you enable Ralph Wiggum
mode, Gemini CLI enters YOLO (auto-approval) mode and continues to process the
provided prompt until it detects your specified completion string in the model's
output or reaches the maximum number of iterations.

## Usage

To use Ralph Wiggum mode, you must provide a prompt using the `-p` or `--prompt`
flag. You then configure the loop behavior using the following flags:

| Flag                   | Description                                                |
| :--------------------- | :--------------------------------------------------------- |
| `--ralph-wiggum`       | Enables the Ralph Wiggum iterative loop mode.              |
| `--completion-promise` | The string to look for in the output to signal completion. |
| `--max-iterations`     | The maximum number of times to run the loop (default: 10). |
| `--memory-file`        | Task-specific memory file (default: `memories.md`).        |

### Example

The following command attempts to fix tests by running the loop up to 5 times
until the string "TESTS PASSED" appears in the output, using a specific memory
file for this task:

```bash
gemini -p "Fix the tests in packages/core" \
  --ralph-wiggum \
  --completion-promise "TESTS PASSED" \
  --max-iterations 5 \
  --memory-file "fix-core-tests.md"
```

## How it works

When you run Gemini CLI with the `--ralph-wiggum` flag, the following process
occurs:

1.  **Enforces YOLO mode:** The tool automatically sets the approval mode to
    `yolo`. This ensures that tool calls (like writing files or running shell
    commands) are approved automatically to allow the automation to proceed
    without human intervention.
2.  **Iterative execution:** The CLI executes the provided prompt in a loop.
3.  **Completion check:** After each iteration, the CLI scans the full text of
    the assistant's response for the string provided in `--completion-promise`.
4.  **Loop termination:**
    - If the completion string is found, the loop exits successfully.
    - If the completion string is not found, the CLI starts a new iteration
      using the same initial prompt.
    - If the number of iterations reaches the `--max-iterations` limit, the loop
      stops.

## Persistent context (Memories)

To help the agent learn from previous attempts, Ralph Wiggum mode uses a
`memories.md` file in your current working directory.

- **Automatic creation:** If the file doesn't exist, the CLI creates it with a
  default header.
- **Context injection:** At the start of each iteration, the content of
  `memories.md` is read and prepended to your prompt.
- **Usage:** You (or the agent, via tool use) can write notes, error logs, or
  successful patterns into this file. This allows the agent to "remember" what
  failed in iteration 1 and avoid repeating the same mistake in iteration 2.

## Summary statistics

At the end of the execution, Ralph Wiggum mode provides a summary table in the
terminal. This table details the performance of each iteration, including:

- **Iteration number:** The sequence of the run.
- **Status:** Whether the iteration met the completion promise ("Success") or
  failed to do so ("Failed").
- **Tests Passed/Failed:** If the output contains recognizable test runner
  patterns (such as those from Vitest, Jest, or Mocha), the CLI extracts and
  displays the number of passing and failing tests.

### Example summary table

```text
--- Ralph Wiggum Mode Summary ---
| Iteration | Status  | Tests Passed | Tests Failed |
|-----------|---------|--------------|--------------|
| 1         | Failed  | 2            | 10           |
| 2         | Failed  | 8            | 4            |
| 3         | Success | 12           | 0            |
---------------------------------
```

## Best practices

To get the most out of Ralph Wiggum mode, we recommend the following:

- **Clear completion criteria:** Ensure your prompt instructs the model to emit
  a specific, unique string (like "ALL TESTS PASSED") only when the task is
  truly complete.
- **Incremental goals:** Use prompts that encourage the model to make small,
  verifiable changes in each iteration.
- **Safety nets:** Always set a reasonable `--max-iterations` limit to prevent
  unintended long-running processes.

## Development and rebuilding

If you're modifying Ralph Wiggum mode or enabling it in a development
environment, you must recompile the TypeScript source code.

### Full rebuild

To build all packages in the monorepo, run the following command from the root
directory:

```bash
npm run build
```

### Fast CLI rebuild

If you've already performed a full build and are only making changes to the CLI
package, you can run a targeted build:

```bash
npm run build -w @google/gemini-cli
```

### Running in development

After rebuilding, test your changes using the `npm run start` script:

```bash
npm run start -- -p "Your task" --ralph-wiggum --completion-promise "SUCCESS"
```
