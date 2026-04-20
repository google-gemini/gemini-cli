# Headless mode reference

Headless mode provides a programmatic interface to Gemini CLI, returning
structured text or JSON output without an interactive terminal UI.

## Entering headless mode

Headless mode is triggered by any of the following:

- **Using the `-p` / `--prompt` flag:** This is the primary way to run in
  headless mode.

  ```bash
  gemini -p "Explain this codebase"
  ```

- **Non-TTY environment:** When stdin or stdout is not a terminal (for example,
  when piping input or output).

  ```bash
  echo "Summarize this" | gemini
  ```

- **CI environment:** When the `CI` or `GITHUB_ACTIONS` environment variable is
  set to `true`.

Note: Positional arguments (for example, `gemini "hello"`) default to
**interactive** mode when run in a TTY. Use `-p` / `--prompt` to force headless
mode.

## Piping input from stdin

When stdin is not a TTY, the CLI reads its content and prepends it to the
prompt. If you also pass `-p`, the stdin content and the prompt value are
combined:

```bash
cat error.log | gemini -p "Explain why this failed"
```

## Headless mode behavior

In headless mode the CLI processes a single prompt and exits. Key differences
from interactive mode:

- The `ask_user` tool is disabled because no human is present to respond.
- ANSI escape sequences are stripped from model output by default. Use
  `--raw-output` to preserve them (see the security warning below).
- Warnings and errors are written to stderr so they do not interfere with stdout
  output.

## Output formats

You can specify the output format using the `--output-format` (`-o`) flag. The
choices are `text` (default), `json`, and `stream-json`.

### Text output (default)

The model's response is printed directly to stdout as plain text. This is the
default when `--output-format` is not specified.

### JSON output

Use `--output-format json` to receive a single JSON object when the response is
complete.

- **Schema:**
  - `session_id`: (string) The session identifier.
  - `response`: (string) The model's final answer.
  - `stats`: (object) Token usage and API latency metrics.
  - `error`: (object, optional) Error details if the request failed.

### Streaming JSON output

Use `--output-format stream-json` to receive a stream of newline-delimited JSON
(JSONL) events as the response is generated.

- **Event types:**
  - `init`: Session metadata (session ID, model).
  - `message`: User and assistant message chunks (includes `delta: true` for
    incremental assistant tokens).
  - `tool_use`: Tool call requests with name, ID, and parameters.
  - `tool_result`: Output from executed tools (status and optional error).
  - `error`: Non-fatal warnings and system errors.
  - `result`: Final outcome with aggregated statistics.

## Raw output

By default, headless mode strips ANSI escape sequences from the model's output
to prevent phishing or command-injection attacks. To disable this sanitization,
pass `--raw-output`. A security warning is printed to stderr unless you also
pass `--accept-raw-output-risk`.

## Exit codes

The CLI returns the following exit codes in headless mode:

| Code  | Meaning                                                        |
| ----- | -------------------------------------------------------------- |
| `0`   | Success.                                                       |
| `1`   | General error (text mode only; JSON modes use specific codes). |
| `41`  | Authentication error.                                          |
| `42`  | Input error (invalid prompt or arguments).                     |
| `52`  | Configuration error.                                           |
| `53`  | Turn limit exceeded (`maxSessionTurns`).                       |
| `54`  | Fatal tool execution error (for example, disk full).           |
| `130` | Cancelled (SIGINT / Ctrl+C).                                   |

## Next steps

- Follow the [Automation tutorial](./tutorials/automation.md) for practical
  scripting examples.
- See the [CLI reference](./cli-reference.md) for all available flags.
