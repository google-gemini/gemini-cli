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
  - `result`: Final outcome with aggregated statistics.

## Exit codes

The CLI returns standard exit codes to indicate the result of the headless
execution:

- `0`: Success.
- `1`: General error or API failure.
- `42`: Input error (invalid prompt or arguments).
- `53`: Turn limit exceeded.

## Scripting examples
Use headless mode to summarize, analyze, and process data.
#### Summarize a text file
```bash
cat report.txt | gemini "Summarize this document in 3 bullet points"
```
### Analyze a code file
```bash
cat script.py | gemini "Review this code for potential bugs and security issues"
```
### Process CSV data
```bash
head -n 10 data.csv | gemini "Analyze this CSV structure and suggest improvements"
```
### Automated review script
```bash
cat > temp_code.txt
echo "What aspect should I review? (bugs/performance/security/readability)"
read review_type
cat temp_code.txt | gemini "Review this code for $review_type issues" > review_results.txt
echo "Review saved to review_results.txt"
```
## Scripting tips
* Use positional arguments for queries
* Chain with other CLI tools: grep, awk, sed
* Set API key as environment variable: export GEMINI_API_KEY="your-key"
* Add error handling: gemini ... || echo "Processing failed"
## Next steps
- Follow the [Automation tutorial](./tutorials/automation.md) for practical
  scripting examples.
- See the [CLI reference](./cli-reference.md) for all available flags.