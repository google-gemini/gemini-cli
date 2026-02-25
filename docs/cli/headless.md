# Headless mode reference

Headless mode provides a programmatic interface to Gemini CLI, returning
structured text or JSON output without an interactive terminal UI.

## Technical reference

Headless mode is triggered when the CLI is run in a non-TTY environment or when
providing a query as a positional argument without the interactive flag.

### Output formats

You can specify the output format using the `--output-format` flag.

#### JSON output

Returns a single JSON object containing the response and usage statistics.

- **Schema:**
  - `session_id`: (string, optional) Session ID.
  - `auth_method`: (string, optional) Authentication method. Emitted with
    `--debug`.
  - `user_tier`: (string, optional) User tier name. Emitted with `--debug`.
  - `response`: (string) The model's final answer.
  - `stats`: (object) Token usage and API latency metrics.
  - `stats.api_requests`: (number, optional) Total API requests. Emitted with
    `--debug`.
  - `stats.api_errors`: (number, optional) Total API errors. Emitted with
    `--debug`.
  - `stats.retry_count`: (number, optional) Total retries. Emitted with
    `--debug`.
  - `stats.loop_detected`: (boolean, optional) Whether a loop was detected.
    Emitted with `--debug`.
  - `stats.loop_type`: (string, optional) Loop classification. Emitted with
    `--debug`.
  - `error`: (object, optional) Error details if the request failed.

#### Streaming JSON output

Returns a stream of newline-delimited JSON (JSONL) events.

- **Event types:**
  - `init`: Session metadata (session ID, model). Includes `auth_method` and
    `user_tier` with `--debug`.
  - `message`: User and assistant message chunks.
  - `tool_use`: Tool call requests with arguments.
  - `tool_result`: Output from executed tools.
  - `error`: Non-fatal warnings and system errors.
  - `retry`: Retry attempt diagnostics. Emitted with `--debug`.
  - `loop_detected`: Loop detection diagnostics. Emitted with `--debug`.
  - `result`: Final outcome with aggregated statistics.

In debug mode (`--debug`), `result.stats` also includes `api_requests`,
`api_errors`, and `retry_count`.

## Exit codes

The CLI returns standard exit codes to indicate the result of the headless
execution:

- `0`: Success.
- `1`: General error or API failure.
- `42`: Input error (invalid prompt or arguments).
- `53`: Turn limit exceeded.

## Next steps

- Follow the [Automation tutorial](./tutorials/automation.md) for practical
  scripting examples.
- See the [CLI reference](./cli-reference.md) for all available flags.
