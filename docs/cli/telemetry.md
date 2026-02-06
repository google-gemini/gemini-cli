# Observability with OpenTelemetry

Learn how to enable and setup OpenTelemetry for Gemini CLI.

- [Observability with OpenTelemetry](#observability-with-opentelemetry)
  - [Key benefits](#key-benefits)
  - [OpenTelemetry integration](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Google Cloud telemetry](#google-cloud-telemetry)
    - [Prerequisites](#prerequisites)
    - [Authenticating with CLI Credentials](#authenticating-with-cli-credentials)
    - [Direct export (recommended)](#direct-export-recommended)
    - [Collector-based export (advanced)](#collector-based-export-advanced)
    - [Monitoring Dashboards](#monitoring-dashboards)
  - [Local telemetry](#local-telemetry)
    - [File-based output (recommended)](#file-based-output-recommended)
    - [Collector-based export (advanced)](#collector-based-export-advanced-1)
  - [Logs and metrics](#logs-and-metrics)
    - [Logs](#logs)
      - [Sessions](#sessions)
      - [Approval Mode](#approval-mode)
      - [Tools](#tools)
      - [Files](#files)
      - [API](#api)
      - [Model routing](#model-routing)
      - [Chat and streaming](#chat-and-streaming)
      - [Resilience](#resilience)
      - [Extensions](#extensions)
      - [Agent runs](#agent-runs)
      - [IDE](#ide)
      - [UI](#ui)
    - [Metrics](#metrics)
      - [Custom](#custom)
        - [Sessions](#sessions-1)
        - [Tools](#tools-1)
        - [API](#api-1)
        - [Token usage](#token-usage)
        - [Files](#files-1)
        - [Chat and streaming](#chat-and-streaming-1)
        - [Model routing](#model-routing-1)
        - [Agent runs](#agent-runs-1)
        - [UI](#ui-1)
        - [Performance](#performance)
      - [GenAI semantic convention](#genai-semantic-convention)

## Key benefits

- **🔍 Usage analytics**: Understand interaction patterns and feature adoption
  across your team
- **⚡ Performance monitoring**: Track response times, token consumption, and
  resource utilization
- **🐛 Real-time debugging**: Identify bottlenecks, failures, and error patterns
  as they occur
- **📊 Workflow optimization**: Make informed decisions to improve
  configurations and processes
- **🏢 Enterprise governance**: Monitor usage across teams, track costs, ensure
  compliance, and integrate with existing monitoring infrastructure

## OpenTelemetry integration

Built on **[OpenTelemetry]** — the vendor-neutral, industry-standard
observability framework — Gemini CLI's observability system provides:

- **Universal compatibility**: Export to any OpenTelemetry backend (Google
  Cloud, Jaeger, Prometheus, Datadog, etc.)
- **Standardized data**: Use consistent formats and collection methods across
  your toolchain
- **Future-proof integration**: Connect with existing and future observability
  infrastructure
- **No vendor lock-in**: Switch between backends without changing your
  instrumentation

[OpenTelemetry]: https://opentelemetry.io/

## Configuration

All telemetry behavior is controlled through your `.gemini/settings.json` file.
Environment variables can be used to override the settings in the file.

| Setting        | Environment Variable             | Description                                         | Values            | Default                 |
| -------------- | -------------------------------- | --------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`      | `GEMINI_TELEMETRY_ENABLED`       | Enable or disable telemetry                         | `true`/`false`    | `false`                 |
| `target`       | `GEMINI_TELEMETRY_TARGET`        | Where to send telemetry data                        | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `GEMINI_TELEMETRY_OTLP_ENDPOINT` | OTLP collector endpoint                             | URL string        | `http://localhost:4317` |
| `otlpProtocol` | `GEMINI_TELEMETRY_OTLP_PROTOCOL` | OTLP transport protocol                             | `"grpc"`/`"http"` | `"grpc"`                |
| `outfile`      | `GEMINI_TELEMETRY_OUTFILE`       | Save telemetry to file (overrides `otlpEndpoint`)   | file path         | -                       |
| `logPrompts`   | `GEMINI_TELEMETRY_LOG_PROMPTS`   | Include prompts in telemetry logs                   | `true`/`false`    | `true`                  |
| `useCollector` | `GEMINI_TELEMETRY_USE_COLLECTOR` | Use external OTLP collector (advanced)              | `true`/`false`    | `false`                 |
| `useCliAuth`   | `GEMINI_TELEMETRY_USE_CLI_AUTH`  | Use CLI credentials for telemetry (GCP target only) | `true`/`false`    | `false`                 |

**Note on boolean environment variables:** For the boolean settings (`enabled`,
`logPrompts`, `useCollector`), setting the corresponding environment variable to
`true` or `1` will enable the feature. Any other value will disable it.

For detailed information about all configuration options, see the
[Configuration guide](../get-started/configuration.md).

## Google Cloud telemetry

### Prerequisites

Before using either method below, complete these steps:

1. Set your Google Cloud project ID:
   - For telemetry in a separate project from inference:
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-telemetry-project-id"
     ```
   - For telemetry in the same project as inference:
     ```bash
     export GOOGLE_CLOUD_PROJECT="your-project-id"
     ```

2. Authenticate with Google Cloud:
   - If using a user account:
     ```bash
     gcloud auth application-default login
     ```
   - If using a service account:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
     ```
3. Make sure your account or service account has these IAM roles:
   - Cloud Trace Agent
   - Monitoring Metric Writer
   - Logs Writer

4. Enable the required Google Cloud APIs (if not already enabled):
   ```bash
   gcloud services enable \
     cloudtrace.googleapis.com \
     monitoring.googleapis.com \
     logging.googleapis.com \
     --project="$OTLP_GOOGLE_CLOUD_PROJECT"
   ```

### Authenticating with CLI Credentials

By default, the telemetry collector for Google Cloud uses Application Default
Credentials (ADC). However, you can configure it to use the same OAuth
credentials that you use to log in to the Gemini CLI. This is useful in
environments where you don't have ADC set up.

To enable this, set the `useCliAuth` property in your `telemetry` settings to
`true`:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp",
    "useCliAuth": true
  }
}
```

**Important:**

- This setting requires the use of **Direct Export** (in-process exporters).
- It **cannot** be used with `useCollector: true`. If you enable both, telemetry
  will be disabled and an error will be logged.
- The CLI will automatically use your credentials to authenticate with Google
  Cloud Trace, Metrics, and Logging APIs.

### Direct export (recommended)

Sends telemetry directly to Google Cloud services. No collector needed.

1. Enable telemetry in your `.gemini/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp"
     }
   }
   ```
2. Run Gemini CLI and send prompts.
3. View logs and metrics:
   - Open the Google Cloud Console in your browser after sending prompts:
     - Logs: https://console.cloud.google.com/logs/
     - Metrics: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list

### Collector-based export (advanced)

For custom processing, filtering, or routing, use an OpenTelemetry collector to
forward data to Google Cloud.

1. Configure your `.gemini/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "useCollector": true
     }
   }
   ```
2. Run the automation script:
   ```bash
   npm run telemetry -- --target=gcp
   ```
   This will:
   - Start a local OTEL collector that forwards to Google Cloud
   - Configure your workspace
   - Provide links to view traces, metrics, and logs in Google Cloud Console
   - Save collector logs to `~/.gemini/tmp/<projectHash>/otel/collector-gcp.log`
   - Stop collector on exit (e.g. `Ctrl+C`)
3. Run Gemini CLI and send prompts.
4. View logs and metrics:
   - Open the Google Cloud Console in your browser after sending prompts:
     - Logs: https://console.cloud.google.com/logs/
     - Metrics: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list
   - Open `~/.gemini/tmp/<projectHash>/otel/collector-gcp.log` to view local
     collector logs.

### Monitoring Dashboards

Gemini CLI provides a pre-configured
[Google Cloud Monitoring](https://cloud.google.com/monitoring) dashboard to
visualize your telemetry.

This dashboard can be found under **Google Cloud Monitoring Dashboard
Templates** as "**Gemini CLI Monitoring**".

![Gemini CLI Monitoring Dashboard Overview](/docs/assets/monitoring-dashboard-overview.png)

![Gemini CLI Monitoring Dashboard Metrics](/docs/assets/monitoring-dashboard-metrics.png)

![Gemini CLI Monitoring Dashboard Logs](/docs/assets/monitoring-dashboard-logs.png)

To learn more, check out this blog post:
[Instant insights: Gemini CLI’s new pre-configured monitoring dashboards](https://cloud.google.com/blog/topics/developers-practitioners/instant-insights-gemini-clis-new-pre-configured-monitoring-dashboards/).

## Local telemetry

For local development and debugging, you can capture telemetry data locally:

### File-based output (recommended)

1. Enable telemetry in your `.gemini/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".gemini/telemetry.log"
     }
   }
   ```
2. Run Gemini CLI and send prompts.
3. View logs and metrics in the specified file (e.g., `.gemini/telemetry.log`).

### Collector-based export (advanced)

1. Run the automation script:
   ```bash
   npm run telemetry -- --target=local
   ```
   This will:
   - Download and start Jaeger and OTEL collector
   - Configure your workspace for local telemetry
   - Provide a Jaeger UI at http://localhost:16686
   - Save logs/metrics to `~/.gemini/tmp/<projectHash>/otel/collector.log`
   - Stop collector on exit (e.g. `Ctrl+C`)
2. Run Gemini CLI and send prompts.
3. View traces at http://localhost:16686 and logs/metrics in the collector log
   file.

## Logs and metrics

The following section describes the structure of logs and metrics generated for
Gemini CLI.

The `session.id`, `installation.id`, and `user.email` (available only when
authenticated with a Google account) are included as common attributes on all
logs and metrics.

### Logs

Logs are timestamped records of specific events. The following events are logged
for Gemini CLI, grouped by category.

#### Sessions

Captures startup configuration and user prompt submissions.

- `gemini_cli.config`: Emitted once at startup with the CLI configuration.
  - **Attributes**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `log_user_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)
    - `mcp_servers_count` (int)
    - `extensions` (string)
    - `extension_ids` (string)
    - `extension_count` (int)
    - `mcp_tools` (string, if applicable)
    - `mcp_tools_count` (int, if applicable)
    - `output_format` ("text", "json", or "stream-json")

- `gemini_cli.user_prompt`: Emitted when a user submits a prompt.
  - **Attributes**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string; excluded if `telemetry.logPrompts` is `false`)
    - `auth_type` (string)

#### Approval Mode

Tracks changes and duration of approval modes.

##### Lifecycle

- `approval_mode_switch`: Approval mode was changed.
  - **Attributes**:
    - `from_mode` (string)
    - `to_mode` (string)

- `approval_mode_duration`: Duration spent in an approval mode.
  - **Attributes**:
    - `mode` (string)
    - `duration_ms` (int)

##### Execution

These events track the execution of an approval mode, such as Plan Mode.

- `plan_execution`: A plan was executed and the session switched from plan mode
  to active execution.
  - **Attributes**:
    - `approval_mode` (string)

#### Tools

Captures tool executions, output truncation, and Edit behavior.

- `gemini_cli.tool_call`: Emitted for each tool (function) call.
  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` ("accept", "reject", "auto_accept", or "modify", if applicable)
    - `error` (if applicable)
    - `error_type` (if applicable)
    - `prompt_id` (string)
    - `tool_type` ("native" or "mcp")
    - `mcp_server_name` (string, if applicable)
    - `extension_name` (string, if applicable)
    - `extension_id` (string, if applicable)
    - `content_length` (int, if applicable)
    - `metadata` (if applicable)

- `gemini_cli.tool_output_truncated`: Output of a tool call was truncated.
  - **Attributes**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `gemini_cli.edit_strategy`: Edit strategy chosen.
  - **Attributes**:
    - `strategy` (string)

- `gemini_cli.edit_correction`: Edit correction result.
  - **Attributes**:
    - `correction` ("success" | "failure")

- `gen_ai.client.inference.operation.details`: This event provides detailed
  information about the GenAI operation, aligned with [OpenTelemetry GenAI
  semantic conventions for events].
  - **Attributes**:
    - `gen_ai.request.model` (string)
    - `gen_ai.provider.name` (string)
    - `gen_ai.operation.name` (string)
    - `gen_ai.input.messages` (json string)
    - `gen_ai.output.messages` (json string)
    - `gen_ai.response.finish_reasons` (array of strings)
    - `gen_ai.usage.input_tokens` (int)
    - `gen_ai.usage.output_tokens` (int)
    - `gen_ai.request.temperature` (float)
    - `gen_ai.request.top_p` (float)
    - `gen_ai.request.top_k` (int)
    - `gen_ai.request.max_tokens` (int)
    - `gen_ai.system_instructions` (json string)
    - `server.address` (string)
    - `server.port` (int)

#### Files

Tracks file operations performed by tools.

- `gemini_cli.file_operation`: Emitted for each file operation.
  - **Attributes**:
    - `tool_name` (string)
    - `operation` ("create" | "read" | "update")
    - `lines` (int, optional)
    - `mimetype` (string, optional)
    - `extension` (string, optional)
    - `programming_language` (string, optional)

#### API

Captures Gemini API requests, responses, and errors.

- `gemini_cli.api_request`: Request sent to Gemini API.
  - **Attributes**:
    - `model` (string)
    - `prompt_id` (string)
    - `request_text` (string, optional)

- `gemini_cli.api_response`: Response received from Gemini API.
  - **Attributes**:
    - `model` (string)
    - `status_code` (int|string)
    - `duration_ms` (int)
    - `input_token_count` (int)
    - `output_token_count` (int)
    - `cached_content_token_count` (int)
    - `thoughts_token_count` (int)
    - `tool_token_count` (int)
    - `total_token_count` (int)
    - `response_text` (string, optional)
    - `prompt_id` (string)
    - `auth_type` (string)
    - `finish_reasons` (array of strings)

- `gemini_cli.api_error`: API request failed.
  - **Attributes**:
    - `model` (string)
    - `error` (string)
    - `error_type` (string)
    - `status_code` (int|string)
    - `duration_ms` (int)
    - `prompt_id` (string)
    - `auth_type` (string)

- `gemini_cli.malformed_json_response`: `generateJson` response could not be
  parsed.
  - **Attributes**:
    - `model` (string)

#### Model routing

- `gemini_cli.slash_command`: A slash command was executed.
  - **Attributes**:
    - `command` (string)
    - `subcommand` (string, optional)
    - `status` ("success" | "error")

- `gemini_cli.slash_command.model`: Model was selected via slash command.
  - **Attributes**:
    - `model_name` (string)

- `gemini_cli.model_routing`: Model router made a decision.
  - **Attributes**:
    - `decision_model` (string)
    - `decision_source` (string)
    - `routing_latency_ms` (int)
    - `reasoning` (string, optional)
    - `failed` (boolean)
    - `error_message` (string, optional)

#### Chat and streaming

- `gemini_cli.chat_compression`: Chat context was compressed.
  - **Attributes**:
    - `tokens_before` (int)
    - `tokens_after` (int)

- `gemini_cli.chat.invalid_chunk`: Invalid chunk received from a stream.
  - **Attributes**:
    - `error.message` (string, optional)

- `gemini_cli.chat.content_retry`: Retry triggered due to a content error.
  - **Attributes**:
    - `attempt_number` (int)
    - `error_type` (string)
    - `retry_delay_ms` (int)
    - `model` (string)

- `gemini_cli.chat.content_retry_failure`: All content retries failed.
  - **Attributes**:
    - `total_attempts` (int)
    - `final_error_type` (string)
    - `total_duration_ms` (int, optional)
    - `model` (string)

- `gemini_cli.conversation_finished`: Conversation session ended.
  - **Attributes**:
    - `approvalMode` (string)
    - `turnCount` (int)

- `gemini_cli.next_speaker_check`: Next speaker determination.
  - **Attributes**:
    - `prompt_id` (string)
    - `finish_reason` (string)
    - `result` (string)

#### Resilience

Records fallback mechanisms for models and network operations.

- `gemini_cli.flash_fallback`: Switched to a flash model as fallback.
  - **Attributes**:
    - `auth_type` (string)

- `gemini_cli.ripgrep_fallback`: Switched to grep as fallback for file search.
  - **Attributes**:
    - `error` (string, optional)

- `gemini_cli.web_fetch_fallback_attempt`: Attempted web-fetch fallback.
  - **Attributes**:
    - `reason` ("private_ip" | "primary_failed")

#### Extensions

Tracks extension lifecycle and settings changes.

- `gemini_cli.extension_install`: An extension was installed.
  - **Attributes**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)

- `gemini_cli.extension_uninstall`: An extension was uninstalled.
  - **Attributes**:
    - `extension_name` (string)
    - `status` (string)

- `gemini_cli.extension_enable`: An extension was enabled.
  - **Attributes**:
    - `extension_name` (string)
    - `setting_scope` (string)

- `gemini_cli.extension_disable`: An extension was disabled.
  - **Attributes**:
    - `extension_name` (string)
    - `setting_scope` (string)

- `gemini_cli.extension_update`: An extension was updated.
  - **Attributes**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_previous_version` (string)
    - `extension_source` (string)
    - `status` (string)

#### Agent runs

- `gemini_cli.agent.start`: Agent run started.
  - **Attributes**:
    - `agent_id` (string)
    - `agent_name` (string)

- `gemini_cli.agent.finish`: Agent run finished.
  - **Attributes**:
    - `agent_id` (string)
    - `agent_name` (string)
    - `duration_ms` (int)
    - `turn_count` (int)
    - `terminate_reason` (string)

#### IDE

Captures IDE connectivity and conversation lifecycle events.

- `gemini_cli.ide_connection`: IDE companion connection.
  - **Attributes**:
    - `connection_type` (string)

#### UI

Tracks terminal rendering issues and related signals.

- `kitty_sequence_overflow`: Terminal kitty control sequence overflow.
  - **Attributes**:
    - `sequence_length` (int)
    - `truncated_sequence` (string)

### Metrics

Metrics are numerical measurements of behavior over time.

#### Custom

##### Sessions

Counts CLI sessions at startup.

- `gemini_cli.session.count` (Counter, Int): Incremented once per CLI startup.

##### Tools

Measures tool usage and latency.

- `gemini_cli.tool.call.count` (Counter, Int): Counts tool calls.
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "modify", or "auto_accept", if
      applicable)
    - `tool_type` (string: "mcp" or "native", if applicable)

- `gemini_cli.tool.call.latency` (Histogram, ms): Measures tool call latency.
  - **Attributes**:
    - `function_name`

##### API

Tracks API request volume and latency.

- `gemini_cli.api.request.count` (Counter, Int): Counts all API requests.
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (if applicable)

- `gemini_cli.api.request.latency` (Histogram, ms): Measures API request
  latency.
  - **Attributes**:
    - `model`
  - Note: Overlaps with `gen_ai.client.operation.duration` (GenAI conventions).

##### Token usage

Tracks tokens used by model and type.

- `gemini_cli.token.usage` (Counter, Int): Counts tokens used.
  - **Attributes**:
    - `model`
    - `type` ("input", "output", "thought", "cache", or "tool")
  - Note: Overlaps with `gen_ai.client.token.usage` for `input`/`output`.

##### Files

Counts file operations with basic context.

- `gemini_cli.file.operation.count` (Counter, Int): Counts file operations.
  - **Attributes**:
    - `operation` ("create", "read", "update")
    - `lines` (Int, optional)
    - `mimetype` (string, optional)
    - `extension` (string, optional)
    - `programming_language` (string, optional)

- `gemini_cli.lines.changed` (Counter, Int): Number of lines changed (from file
  diffs).
  - **Attributes**:
    - `function_name`
    - `type` ("added" or "removed")

##### Chat and streaming

Resilience counters for compression, invalid chunks, and retries.

- `gemini_cli.chat_compression` (Counter, Int): Counts chat compression
  operations.
  - **Attributes**:
    - `tokens_before` (Int)
    - `tokens_after` (Int)

- `gemini_cli.chat.invalid_chunk.count` (Counter, Int): Counts invalid chunks
  from streams.

- `gemini_cli.chat.content_retry.count` (Counter, Int): Counts retries due to
  content errors.

- `gemini_cli.chat.content_retry_failure.count` (Counter, Int): Counts requests
  where all content retries failed.

##### Model routing

Routing latency/failures and slash-command selections.

- `gemini_cli.slash_command.model.call_count` (Counter, Int): Counts model
  selections via slash command.
  - **Attributes**:
    - `slash_command.model.model_name` (string)

- `gemini_cli.model_routing.latency` (Histogram, ms): Model routing decision
  latency.
  - **Attributes**:
    - `routing.decision_model` (string)
    - `routing.decision_source` (string)

- `gemini_cli.model_routing.failure.count` (Counter, Int): Counts model routing
  failures.
  - **Attributes**:
    - `routing.decision_source` (string)
    - `routing.error_message` (string)

##### Agent runs

Agent lifecycle metrics: runs, durations, and turns.

- `gemini_cli.agent.run.count` (Counter, Int): Counts agent runs.
  - **Attributes**:
    - `agent_name` (string)
    - `terminate_reason` (string)

- `gemini_cli.agent.duration` (Histogram, ms): Agent run durations.
  - **Attributes**:
    - `agent_name` (string)

- `gemini_cli.agent.turns` (Histogram, turns): Turns taken per agent run.
  - **Attributes**:
    - `agent_name` (string)

##### Approval Mode

###### Execution

These metrics track the adoption and usage of specific approval workflows, such
as Plan Mode.

- `gemini_cli.plan.execution.count` (Counter, Int): Counts plan executions.
  - **Attributes**:
    - `approval_mode` (string)

##### UI

UI stability signals such as flicker count.

- `gemini_cli.ui.flicker.count` (Counter, Int): Counts UI frames that flicker
  (render taller than terminal).

##### Performance

Optional performance monitoring for startup, CPU/memory, and phase timing.

- `gemini_cli.startup.duration` (Histogram, ms): CLI startup time by phase.
  - **Attributes**:
    - `phase` (string)
    - `details` (map, optional)

- `gemini_cli.memory.usage` (Histogram, bytes): Memory usage.
  - **Attributes**:
    - `memory_type` ("heap_used", "heap_total", "external", "rss")
    - `component` (string, optional)

- `gemini_cli.cpu.usage` (Histogram, percent): CPU usage percentage.
  - **Attributes**:
    - `component` (string, optional)

- `gemini_cli.tool.queue.depth` (Histogram, count): Number of tools in the
  execution queue.

- `gemini_cli.tool.execution.breakdown` (Histogram, ms): Tool time by phase.
  - **Attributes**:
    - `function_name` (string)
    - `phase` ("validation", "preparation", "execution", "result_processing")

- `gemini_cli.api.request.breakdown` (Histogram, ms): API request time by phase.
  - **Attributes**:
    - `model` (string)
    - `phase` ("request_preparation", "network_latency", "response_processing",
      "token_processing")

- `gemini_cli.token.efficiency` (Histogram, ratio): Token efficiency metrics.
  - **Attributes**:
    - `model` (string)
    - `metric` (string)
    - `context` (string, optional)

- `gemini_cli.performance.score` (Histogram, score): Composite performance
  score.
  - **Attributes**:
    - `category` (string)
    - `baseline` (number, optional)

- `gemini_cli.performance.regression` (Counter, Int): Regression detection
  events.
  - **Attributes**:
    - `metric` (string)
    - `severity` ("low", "medium", "high")
    - `current_value` (number)
    - `baseline_value` (number)

- `gemini_cli.performance.regression.percentage_change` (Histogram, percent):
  Percent change from baseline when regression detected.
  - **Attributes**:
    - `metric` (string)
    - `severity` ("low", "medium", "high")
    - `current_value` (number)
    - `baseline_value` (number)

- `gemini_cli.performance.baseline.comparison` (Histogram, percent): Comparison
  to baseline.
  - **Attributes**:
    - `metric` (string)
    - `category` (string)
    - `current_value` (number)
    - `baseline_value` (number)

#### GenAI semantic convention

The following metrics comply with [OpenTelemetry GenAI semantic conventions] for
standardized observability across GenAI applications:

- `gen_ai.client.token.usage` (Histogram, token): Number of input and output
  tokens used per operation.
  - **Attributes**:
    - `gen_ai.operation.name` (string): The operation type (e.g.,
      "generate_content", "chat")
    - `gen_ai.provider.name` (string): The GenAI provider ("gcp.gen_ai" or
      "gcp.vertex_ai")
    - `gen_ai.token.type` (string): The token type ("input" or "output")
    - `gen_ai.request.model` (string, optional): The model name used for the
      request
    - `gen_ai.response.model` (string, optional): The model name that generated
      the response
    - `server.address` (string, optional): GenAI server address
    - `server.port` (int, optional): GenAI server port

- `gen_ai.client.operation.duration` (Histogram, s): GenAI operation duration in
  seconds.
  - **Attributes**:
    - `gen_ai.operation.name` (string): The operation type (e.g.,
      "generate_content", "chat")
    - `gen_ai.provider.name` (string): The GenAI provider ("gcp.gen_ai" or
      "gcp.vertex_ai")
    - `gen_ai.request.model` (string, optional): The model name used for the
      request
    - `gen_ai.response.model` (string, optional): The model name that generated
      the response
    - `server.address` (string, optional): GenAI server address
    - `server.port` (int, optional): GenAI server port
    - `error.type` (string, optional): Error type if the operation failed

[OpenTelemetry GenAI semantic conventions]:
  https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-metrics.md
[OpenTelemetry GenAI semantic conventions for events]:
  https://github.com/open-telemetry/semantic-conventions/blob/8b4f210f43136e57c1f6f47292eb6d38e3bf30bb/docs/gen-ai/gen-ai-events.md
