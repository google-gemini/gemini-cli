# Headless mode reference

Headless mode provides a programmatic interface to Gemini CLI, returning
structured text or JSON output without an interactive terminal UI.

## Technical reference

Headless mode is triggered when the CLI is run in a non-TTY environment or when
providing a query with the `-p` (or `--prompt`) flag.

### Output formats

You can specify the output format using the `--output-format` flag.

#### JSON output

Returns a single JSON object containing the response and usage statistics.

- **Schema:**
  - `response`: (string) The model's final answer.
  - `stats`: (object) Token usage and API latency metrics.
  - `error`: (object, optional) Error details if the request failed.

#### Streaming JSON output

Returns a stream of newline-delimited JSON (JSONL) events.

- **Event types:**
  - `init`: Session metadata (session ID, model).
  - `message`: User and assistant message chunks.
  - `tool_use`: Tool call requests with arguments.
  - `tool_result`: Output from executed tools.
  - `error`: Non-fatal warnings and system errors.
  - `result`: Final outcome with aggregated statistics and per-model token usage
    breakdowns.

## Exit codes

Gemini CLI uses the following exit codes to indicate why the tool terminated
unexpectedly. You can use these codes to handle errors in scripts and automation
workflows.

| Exit code | Error type                 | Description                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | An error occurred during the authentication process.                                                |
| 42        | `FatalInputError`          | Invalid or missing input was provided to the CLI. (non-interactive mode only)                       |
| 44        | `FatalSandboxError`        | An error occurred with the sandboxing environment (e.g., Docker, Podman, or Seatbelt).              |
| 52        | `FatalConfigError`         | A configuration file (`settings.json`) is invalid or contains errors.                               |
| 53        | `FatalTurnLimitedError`    | The maximum number of conversational turns for the session was reached. (non-interactive mode only) |
| 54        | `FatalToolExecutionError`  | An error occurred during tool execution.                                                            |
| 130       | `FatalCancellationError`   | The operation was canceled by the user (e.g., SIGINT).                                              |

Exit code 0 indicates that Gemini CLI finished successfully. Exit code 1
indicates a general error or API failure occurred.

## Next steps

- Follow the [Automation tutorial](./tutorials/automation.md) for practical
  scripting examples.
- See the [CLI reference](./cli-reference.md) for all available flags.
