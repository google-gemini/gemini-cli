# Headless mode reference

Headless mode provides a programmatic interface to Gemini CLI, returning
structured text or JSON output without an interactive terminal UI.

## Technical reference

Headless mode is triggered when the CLI is run in a non-TTY environment or when
providing a query with the `-p` (or `--prompt`) flag.

### Session persistence

By default, Gemini CLI records sessions under the user's `.gemini` directory so
they can be listed and resumed later. Use `--ephemeral` for one-off runs where
the current conversation should not be persisted to disk:

```bash
gemini --ephemeral -p "summarize this repository"
```

Ephemeral mode redirects every per-run write that would normally land under
`~/.gemini/tmp/<project_hash>/` to a process-local directory under the system
temp dir, and disables automatic checkpointing for the current process.
Concretely, this means the following are not persisted to your home directory
for the run:

- Chat history (the `chats/` JSONL).
- Conversation checkpoints used by `/restore`.
- Truncated tool outputs and tool-output masking dumps (`tool-outputs/`).
- RAG snippet trace logs (`logs/rag-trace.log`).
- Shell command history (`shell_history`).
- Plans, tracker, and tasks scratch directories created for the session.

Settings, authentication credentials, and the global project registry are still
read normally; only the per-run writes above are redirected. `--ephemeral`
cannot be combined with `--resume`, `--session-id`, or `--session-file`.

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
