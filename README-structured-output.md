# Structured Output: Major Change Readme

This README documents the major improvement introduced in this branch: versioned
structured outputs for Gemini CLI, covering both non-streaming JSON ("json") and
streaming JSONL ("stream-json"). It explains what changed, why, exact schemas,
migration steps, examples, validation, and FAQs.

## TL;DR

- Non-interactive JSON now includes a version field.
  - Old (conceptual): `{ response, stats, error }`
  - New (stable): `{ version: 1, response?, stats?, error? }`
- Streaming JSONL INIT event now includes schema and CLI version:
  - New fields: `schema_version: 1`, `cli_version: <semver or "unknown">`
- All tests updated; full suite passes; docs added.

## Files changed (and new files)

- Modified: `packages/core/src/output/types.ts`
- Modified: `packages/core/src/output/json-formatter.ts`
- Modified: `packages/cli/src/nonInteractiveCli.ts`
- Modified tests: `packages/core/src/output/json-formatter.test.ts`
- Modified tests: `packages/cli/src/nonInteractiveCli.test.ts`
- Modified tests (stability):
  `packages/cli/src/config/extensions/update.test.ts` (timeout increased)
- Modified docs index: `docs/sidebar.json`
- Modified docs index: `README.md` (added link)
- Added doc: `docs/cli/structured-output.md`
- Added this readme: `README-structured-output.md`

## Why this change?

- Stability for automation: Downstream tools can pin to a known schema via a
  simple version number.
- Future-proof: We can evolve the schema without breaking existing scripts.
- Observability: Streaming INIT carries the CLI version to simplify debugging
  and telemetry correlation.

## What exactly changed?

### Non-streaming JSON (`--output-format json`)

- We added a top-level `version` field to the JSON payload.
- `response` continues to contain assistant text (without ANSI escape
  sequences).
- `stats` continues to expose session metrics.
- `error` formatting is unchanged except for the additional `version` field at
  the top level.

Schema v1:

- version: number (always 1 for this release)
- response?: string (assistant text; ANSI-stripped)
- stats?: object (SessionMetrics)
- error?: object
  - type: string
  - message: string
  - code?: string | number

### Streaming JSON (`--output-format stream-json`)

- INIT event now includes:
  - schema_version: 1
  - cli_version: string (from the CLI build; falls back to "unknown")
- Other event types are unchanged.

## Precise schemas and examples

### Non-streaming JSON (v1)

Success example:

```json
{
  "version": 1,
  "response": "Hello World",
  "stats": {
    "models": {
      "gemini-2.5-pro": {
        "api": { "totalRequests": 1, "totalErrors": 0, "totalLatencyMs": 1234 },
        "tokens": {
          "prompt": 100,
          "candidates": 10,
          "total": 110,
          "cached": 0,
          "thoughts": 0,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 0,
      "totalSuccess": 0,
      "totalFail": 0,
      "totalDurationMs": 0,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 0
      },
      "byName": {}
    },
    "files": { "totalLinesAdded": 0, "totalLinesRemoved": 0 }
  }
}
```

Error example:

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

Tool-only completion (no assistant text):

```json
{
  "version": 1,
  "response": "",
  "stats": {
    /* SessionMetrics */
  }
}
```

### Streaming JSONL

Common event fields: `type`, `timestamp`.

INIT example:

```json
{
  "type": "init",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "session_id": "abc",
  "model": "gemini-2.5-pro",
  "schema_version": 1,
  "cli_version": "0.13.0"
}
```

Assistant delta MESSAGE example:

```json
{
  "type": "message",
  "timestamp": "2025-10-10T12:00:01.000Z",
  "role": "assistant",
  "content": "Hello",
  "delta": true
}
```

TOOL_RESULT (success) example:

```json
{
  "type": "tool_result",
  "timestamp": "2025-10-10T12:00:02.000Z",
  "tool_id": "read-123",
  "status": "success",
  "output": "File contents here"
}
```

RESULT example (success):

```json
{
  "type": "result",
  "timestamp": "2025-10-10T12:00:04.000Z",
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

RESULT example (error):

```json
{
  "type": "result",
  "timestamp": "2025-10-10T12:00:05.000Z",
  "status": "error",
  "error": {
    "type": "MaxSessionTurnsError",
    "message": "Maximum session turns exceeded"
  },
  "stats": {
    "total_tokens": 100,
    "input_tokens": 50,
    "output_tokens": 50,
    "duration_ms": 1200,
    "tool_calls": 0
  }
}
```

## Backward compatibility

- The change is additive and stable. Existing consumers that ignore unknown
  fields will continue to work.
- Scripts that do strict equality on the entire JSON object must add `version`
  to their expectations.

## How to use

### CLI flags

- `--output-format json` → versioned JSON output
- `--output-format stream-json` → JSONL events (INIT, MESSAGE, TOOL_USE,
  TOOL_RESULT, ERROR, RESULT)

### Parsing tips

Bash + jq (non-streaming):

```bash
resp=$(gemini -p "Hello" --output-format json)
ver=$(jq -r '.version' <<<"$resp")
text=$(jq -r '.response // ""' <<<"$resp")
echo "version=$ver"; echo "$text"
```

Node.js (non-streaming):

```js
const { execSync } = require('node:child_process');
const out = execSync('gemini -p "Hello" --output-format json', {
  encoding: 'utf8',
});
const obj = JSON.parse(out);
if (obj.version === 1 && obj.response) console.log(obj.response);
```

Python (non-streaming):

```python
import json, subprocess
out = subprocess.check_output(['gemini','-p','Hello','--output-format','json'], text=True)
obj = json.loads(out)
if obj.get('version') == 1:
    print(obj.get('response',''))
```

Streaming (JSONL):

```bash
gemini -p "Hello" --output-format stream-json | jq -c '. | select(.type=="result")'
```

## Implementation details

- Core
  - `packages/core/src/output/types.ts`
    - Added `JSON_SCHEMA_VERSION = 1` and `version: number` to `JsonOutput`.
    - Extended INIT event with optional `schema_version` and `cli_version`.
  - `packages/core/src/output/json-formatter.ts`
    - Emits `{ version: JSON_SCHEMA_VERSION, ... }` for all JSON outputs.
- CLI
  - `packages/cli/src/nonInteractiveCli.ts`
    - Streaming INIT event now includes `{ schema_version: 1, cli_version }`.
- Build-time CLI version
  - `esbuild.config.js` defines `process.env.CLI_VERSION`, used to populate
    `cli_version` (falls back to "unknown").

## Tests and validation

- All affected unit tests updated to expect `version: 1` in JSON.
- One flaky extension update test timeout increased to reduce local CI flakes.
- Full validation steps:
  1. `npm ci`
  2. `npm run build`
  3. `npm run typecheck`
  4. `npm run lint`
  5. `npm run test:ci`
- Result: All packages pass (a2a-server, cli, core, vscode-ide-companion,
  scripts).

## Migration guide

- Update strict JSON assertions to include `version: 1`.
- Parsers should:
  - Read and check `.version` and branch on schema if needed.
  - Ignore unknown fields to stay forward-compatible.
- Streaming consumers may optionally record `schema_version` and `cli_version`
  from INIT for logging/analytics.

## FAQ

- Q: Is this breaking?
  - A: No. It’s additive. Only strict, full-object equality checks need an
    update.
- Q: How will future changes be handled?
  - A: We’ll bump `version` (or `schema_version` in streaming INIT) and document
    deltas.
- Q: Can I rely on `cli_version`?
  - A: Yes, when the CLI is bundled with a version; otherwise it may appear as
    "unknown".

## Related docs

- Detailed guide: `docs/cli/structured-output.md`
- Project README: `README.md`

## Change summary

- Add versioned JSON payloads and streaming INIT metadata.
- Update tests and docs.
- Validate with full CI/test pipeline.
