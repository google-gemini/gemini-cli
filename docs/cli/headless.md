# Headless mode

Headless mode lets you run Gemini CLI programmatically from command line scripts
and automation tools without an interactive UI. Use this mode for scripting,
automation, CI/CD pipelines, and building AI-powered tools.

## Overview

Headless mode provides an interface to Gemini CLI that integrates with standard
terminal workflows, such as piping and redirection.

- It accepts prompts via command line arguments or stdin.
- It returns structured output in text or JSON formats.
- It supports file redirection and standard piping.
- It enables complex automation and scripting workflows.
- It provides consistent exit codes for robust error handling.

## Basic usage

You can invoke headless mode by providing a query directly as a positional
argument or by piping text into the command.

### Direct prompts

Provide your query as a positional argument to run in headless mode when not
using a TTY:

```bash
gemini "What is machine learning?"
```

### Stdin input

Pipe input to Gemini CLI from your terminal to process text from other commands:

```bash
echo "Explain this code" | gemini
```

### Combining with file input

Read from files and process the content with Gemini:

```bash
cat README.md | gemini "Summarize this documentation"
```

## Output formats

Gemini CLI supports multiple output formats to accommodate both human-readable
logs and machine-readable data processing.

### Text output (default)

The default format provides standard human-readable text output:

```bash
gemini "What is the capital of France?"
```

Response format:

```
The capital of France is Paris.
```

### JSON output

The JSON format returns structured data that includes the model response, usage
statistics, and metadata. This format is ideal for programmatic processing and
automation scripts.

#### Response schema

The JSON output follows this high-level structure:

```json
{
  "response": "string", // The main AI-generated content
  "stats": {
    "models": {
      "[model-name]": {
        "api": {
          /* request counts, errors, latency */
        },
        "tokens": {
          /* prompt, response, cached, total counts */
        }
      }
    },
    "tools": {
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* accept, reject, modify, auto_accept counts */
      },
      "byName": {
        /* per-tool detailed stats */
      }
    },
    "files": {
      // File modification statistics
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    "type": "string", // Error type (for example, "ApiError" or "AuthError")
    "message": "string", // Human-readable error description
    "code": "number" // Optional error code
  }
}
```

#### Example usage

To request JSON output, use the `--output-format json` flag:

```bash
gemini "What is the capital of France?" --output-format json
```

Response:

```json
{
  "response": "The capital of France is Paris.",
  "stats": {
    "models": {
      "gemini-2.5-pro": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      },
      "gemini-2.5-flash": {
        "api": {
          "totalRequests": 1,
          "totalErrors": 0,
          "totalLatencyMs": 1879
        },
        "tokens": {
          "prompt": 8965,
          "candidates": 10,
          "total": 9033,
          "cached": 0,
          "thoughts": 30,
          "tool": 28
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

### Streaming JSON output

The streaming format returns real-time events as newline-delimited JSON (JSONL).
Each significant action emits immediately as it occurs. This format is ideal for
monitoring long-running operations and building event-driven pipelines.

#### When to use streaming JSON

Use `--output-format stream-json` when you need any of the following
capabilities:

- **Real-time progress monitoring:** See tool calls and responses as they
  happen.
- **Event-driven automation:** React to specific events (for example, tool
  failures).
- **Live UI updates:** Build interfaces showing AI agent activity in real-time.
- **Detailed execution logs:** Capture complete interaction history with
  timestamps.
- **Pipeline integration:** Stream events to logging or monitoring systems.

#### Event types

The streaming format emits six event types:

1. **`init`**: Session starts (includes `session_id` and `model`).
2. **`message`**: User prompts and assistant responses.
3. **`tool_use`**: Tool call requests with parameters.
4. **`tool_result`**: Tool execution results (success or error).
5. **`error`**: Non-fatal errors and warnings.
6. **`result`**: Final session outcome with aggregated statistics.

#### Basic usage

You can stream events directly to the console or save them to a file:

```bash
# Stream events to console
gemini --output-format stream-json "What is 2+2?"

# Save event stream to file
gemini --output-format stream-json "Analyze this code" > events.jsonl

# Parse with jq
gemini --output-format stream-json "List files" | jq -r '.type'
```

#### Example output

Each line in the output is a complete JSON event:

```jsonl
{"type":"init","timestamp":"2025-10-10T12:00:00.000Z","session_id":"abc123","model":"gemini-2.0-flash-exp"}
{"type":"message","role":"user","content":"List files in current directory","timestamp":"2025-10-10T12:00:01.000Z"}
{"type":"tool_use","tool_name":"Bash","tool_id":"bash-123","parameters":{"command":"ls -la"},"timestamp":"2025-10-10T12:00:02.000Z"}
{"type":"tool_result","tool_id":"bash-123","status":"success","output":"file1.txt\nfile2.txt","timestamp":"2025-10-10T12:00:03.000Z"}
{"type":"message","role":"assistant","content":"Here are the files...","delta":true,"timestamp":"2025-10-10T12:00:04.000Z"}
{"type":"result","status":"success","stats":{"total_tokens":250,"input_tokens":50,"output_tokens":200,"duration_ms":3000,"tool_calls":1},"timestamp":"2025-10-10T12:00:05.000Z"}
```

### File redirection

You can save output to files or pipe the results to other command-line tools:

```bash
# Save to file
gemini "Explain Docker" > docker-explanation.txt
gemini "Explain Docker" --output-format json > docker-explanation.json

# Append to file
gemini "Add more details" >> docker-explanation.txt

# Pipe to other tools
gemini "What is Kubernetes?" --output-format json | jq '.response'
gemini "Explain microservices" | wc -w
gemini "List programming languages" | grep -i "python"
```

## Configuration options

The following table summarizes the key command-line options for headless usage.

| Option                  | Description                        | Example                                         |
| ----------------------- | ---------------------------------- | ----------------------------------------------- |
| `--output-format`       | Specify output format (text, json) | `gemini "query" --output-format json`           |
| `--model`, `-m`         | Specify the Gemini model           | `gemini "query" -m gemini-2.5-flash`            |
| `--debug`, `-d`         | Enable debug mode                  | `gemini "query" --debug`                        |
| `--include-directories` | Include additional directories     | `gemini "query" --include-directories src,docs` |
| `--yolo`, `-y`          | Auto-approve all actions           | `gemini "query" --yolo`                         |
| `--approval-mode`       | Set approval mode                  | `gemini "query" --approval-mode auto_edit`      |

For complete details on all available configuration options, settings files, and
environment variables, see the
[Configuration guide](../get-started/configuration.md).

## Examples

The following examples demonstrate how to use Gemini CLI for common development
and automation tasks.

#### Code review

```bash
cat src/auth.py | gemini "Review this authentication code for security issues" > security-review.txt
```

#### Generate commit messages

```bash
result=$(git diff --cached | gemini "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### API documentation

```bash
result=$(cat api/routes.js | gemini "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### Batch code analysis

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | gemini "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### PR analysis

```bash
result=$(git diff origin/main...HEAD | gemini "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### Log analysis

```bash
grep "ERROR" /var/log/app.log | tail -20 | gemini "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### Release notes generation

```bash
result=$(git log --oneline v1.0.0..HEAD | gemini "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### Model and tool usage tracking

```bash
result=$(gemini "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Next steps

- Explore the [CLI Configuration](../get-started/configuration.md) guide.
- Learn about [Authentication](../get-started/authentication.md) methods.
- Reference the full list of [Commands](./commands.md).
- Check out [Tutorials](./tutorials.md) for step-by-step guides.
