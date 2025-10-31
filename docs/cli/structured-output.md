# Structured Output Schema (v1)

This document describes the stable structured output formats produced by Gemini
CLI in non-interactive mode.

## Non-streaming JSON (`--output-format json`)

Gemini CLI now emits a versioned JSON object to stdout.

- version: 1
- response: string (optional) — assistant text with ANSI codes stripped
- stats: object (optional) — session metrics summary
- error: object (optional)
  - type: string
  - message: string
  - code: string | number (optional)

Example:

```json
{
  "version": 1,
  "response": "Hello World",
  "stats": {
    /* SessionMetrics */
  }
}
```

Errors:

```json
{
  "version": 1,
  "error": {
    "type": "Error",
    "message": "Invalid input provided",
    "code": 1
  }
}
```

Notes:

- All stdout content is valid JSON. Diagnostic logs are sent to stderr.
- Response text is sanitized to remove ANSI escape sequences.

## Streaming JSON (`--output-format stream-json`)

Each event is emitted as a single line of JSON (JSONL). The INIT event now
carries schema and CLI version metadata.

Common fields per event:

- type: "init" | "message" | "tool_use" | "tool_result" | "error" | "result"
- timestamp: ISO 8601 string

INIT event additions:

- schema_version: 1
- cli_version: string (Gemini CLI version, or "unknown")

Example INIT event:

```jsonl
{
  "type": "init",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "session_id": "abc",
  "model": "gemini-2.5-pro",
  "schema_version": 1,
  "cli_version": "0.13.0"
}
```

Result event includes aggregated stats:

```jsonl
{
  "type": "result",
  "timestamp": "...",
  "status": "success",
  "stats": {
    "total_tokens": 100,
    "input_tokens": 50,
    "output_tokens": 50,
    "duration_ms": 1200,
    "tool_calls": 2
  }
}
```

## Why this change?

- Stability: Downstream tooling can reliably parse versioned payloads.
- Compatibility: Future schema updates can increment the version without
  breaking consumers.
- Observability: Stream INIT event now carries CLI version for easier debugging.

## Migration

- If you previously parsed `{ response, stats }`, update your parser to read the
  new `version` field and ignore unknown fields.
- Streaming consumers may optionally read `schema_version` and `cli_version`
  from the INIT event.
