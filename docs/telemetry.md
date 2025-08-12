# Gemini CLI Observability Guide

Telemetry provides data about Gemini CLI's performance, health, and usage. By enabling it, you can monitor operations, debug issues, and optimize tool usage through traces, metrics, and structured logs.

Gemini CLI's telemetry system is built on the **[OpenTelemetry] (OTEL)** standard, allowing you to send data to any compatible backend.

[OpenTelemetry]: https://opentelemetry.io/

## Enabling telemetry

You can enable telemetry in multiple ways. Configuration is primarily managed via the [`.gemini/settings.json` file](./cli/configuration.md) and environment variables, but CLI flags can override these settings for a specific session.

### Order of precedence

The following lists the precedence for applying telemetry settings, with items listed higher having greater precedence:

1.  **CLI flags (for `gemini` command):**
    - `--telemetry` / `--no-telemetry`: Overrides `telemetry.enabled`.
    - `--telemetry-target <local|gcp>`: Overrides `telemetry.target`.
    - `--telemetry-otlp-endpoint <URL>`: Overrides `telemetry.otlpEndpoint`.
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`: Overrides `telemetry.logPrompts`.
    - `--telemetry-outfile <path>`: Redirects telemetry output to a file. See [Exporting to a file](#exporting-to-a-file).

1.  **Environment variables:**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`: Overrides `telemetry.otlpEndpoint`.

1.  **Workspace settings file (`.gemini/settings.json`):** Values from the `telemetry` object in this project-specific file.

1.  **User settings file (`~/.gemini/settings.json`):** Values from the `telemetry` object in this global user file.

1.  **Defaults:** applied if not set by any of the above.
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**For the `npm run telemetry -- --target=<gcp|local>` script:**
The `--target` argument to this script _only_ overrides the `telemetry.target` for the duration and purpose of that script (i.e., choosing which collector to start). It does not permanently change your `settings.json`. The script will first look at `settings.json` for a `telemetry.target` to use as its default.

### Example settings

The following code can be added to your workspace (`.gemini/settings.json`) or user (`~/.gemini/settings.json`) settings to enable telemetry and send the output to Google Cloud:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### Exporting to a file

You can export all telemetry data to a file for local inspection.

To enable file export, use the `--telemetry-outfile` flag with a path to your desired output file. This must be run using `--telemetry-target=local`.

```bash
# Set your desired output file path
TELEMETRY_FILE=".gemini/telemetry.log"

# Run Gemini CLI with local telemetry
# NOTE: --telemetry-otlp-endpoint="" is required to override the default
# OTLP exporter and ensure telemetry is written to the local file.
gemini --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## Running an OTEL Collector

An OTEL Collector is a service that receives, processes, and exports telemetry data.
The CLI sends data using the OTLP/gRPC protocol.

Learn more about OTEL exporter standard configuration in [documentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Local

Use the `npm run telemetry -- --target=local` command to automate the process of setting up a local telemetry pipeline, including configuring the necessary settings in your `.gemini/settings.json` file. The underlying script installs `otelcol-contrib` (the OpenTelemetry Collector) and `jaeger` (The Jaeger UI for viewing traces). To use it:

1.  **Run the command**:
    Execute the command from the root of the repository:

    ```bash
    npm run telemetry -- --target=local
    ```

    The script will:
    - Download Jaeger and OTEL if needed.
    - Start a local Jaeger instance.
    - Start an OTEL collector configured to receive data from Gemini CLI.
    - Automatically enable telemetry in your workspace settings.
    - On exit, disable telemetry.

1.  **View traces**:
    Open your web browser and navigate to **http://localhost:16686** to access the Jaeger UI. Here you can inspect detailed traces of Gemini CLI operations.

1.  **Inspect logs and metrics**:
    The script redirects the OTEL collector output (which includes logs and metrics) to `~/.gemini/tmp/<projectHash>/otel/collector.log`. The script will provide links to view and a command to tail your telemetry data (traces, metrics, logs) locally.

1.  **Stop the services**:
    Press `Ctrl+C` in the terminal where the script is running to stop the OTEL Collector and Jaeger services.

### Google Cloud

Use the `npm run telemetry -- --target=gcp` command to automate setting up a local OpenTelemetry collector that forwards data to your Google Cloud project, including configuring the necessary settings in your `.gemini/settings.json` file. The underlying script installs `otelcol-contrib`. To use it:

1.  **Prerequisites**:
    - Have a Google Cloud project ID.
    - Export the `GOOGLE_CLOUD_PROJECT` environment variable to make it available to the OTEL collector.
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Authenticate with Google Cloud (e.g., run `gcloud auth application-default login` or ensure `GOOGLE_APPLICATION_CREDENTIALS` is set).
    - Ensure your Google Cloud account/service account has the necessary IAM roles: "Cloud Trace Agent", "Monitoring Metric Writer", and "Logs Writer".

1.  **Run the command**:
    Execute the command from the root of the repository:

    ```bash
    npm run telemetry -- --target=gcp
    ```

    The script will:
    - Download the `otelcol-contrib` binary if needed.
    - Start an OTEL collector configured to receive data from Gemini CLI and export it to your specified Google Cloud project.
    - Automatically enable telemetry and disable sandbox mode in your workspace settings (`.gemini/settings.json`).
    - Provide direct links to view traces, metrics, and logs in your Google Cloud Console.
    - On exit (Ctrl+C), it will attempt to restore your original telemetry and sandbox settings.

1.  **Run Gemini CLI:**
    In a separate terminal, run your Gemini CLI commands. This generates telemetry data that the collector captures.

1.  **View telemetry in Google Cloud**:
    Use the links provided by the script to navigate to the Google Cloud Console and view your traces, metrics, and logs.

1.  **Inspect local collector logs**:
    The script redirects the local OTEL collector output to `~/.gemini/tmp/<projectHash>/otel/collector-gcp.log`. The script provides links to view and command to tail your collector logs locally.

1.  **Stop the service**:
    Press `Ctrl+C` in the terminal where the script is running to stop the OTEL Collector.

## Logs and metric reference

The following section describes the structure of logs and metrics generated for Gemini CLI.

- A `sessionId` is included as a common attribute on all logs and metrics.

### Logs

Logs are timestamped records of specific events. The following events are logged for Gemini CLI:

- `gemini_cli.config`: This event occurs once at startup with the CLI's configuration.
  - **Attributes**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)

- `gemini_cli.user_prompt`: This event occurs when a user submits a prompt.
  - **Attributes**:
    - `prompt_length`
    - `prompt` (this attribute is excluded if `log_prompts_enabled` is configured to be `false`)
    - `auth_type`

- `gemini_cli.tool_call`: This event occurs for each function call.
  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", or "modify", if applicable)
    - `error` (if applicable)
    - `error_type` (if applicable)
    - `metadata` (if applicable, dictionary of string -> any)

- `gemini_cli.api_request`: This event occurs when making a request to Gemini API.
  - **Attributes**:
    - `model`
    - `request_text` (if applicable)

- `gemini_cli.api_error`: This event occurs if the API request fails.
  - **Attributes**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `gemini_cli.api_response`: This event occurs upon receiving a response from Gemini API.
  - **Attributes**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (if applicable)
    - `auth_type`

- `gemini_cli.flash_fallback`: This event occurs when Gemini CLI switches to flash as fallback.
  - **Attributes**:
    - `auth_type`

- `gemini_cli.slash_command`: This event occurs when a user executes a slash command.
  - **Attributes**:
    - `command` (string)
    - `subcommand` (string, if applicable)

### Metrics

Metrics are numerical measurements of behavior over time. The following metrics are collected for Gemini CLI:

- `gemini_cli.session.count` (Counter, Int): Incremented once per CLI startup.

- `gemini_cli.tool.call.count` (Counter, Int): Counts tool calls.
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", or "modify", if applicable)

- `gemini_cli.tool.call.latency` (Histogram, ms): Measures tool call latency.
  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject", or "modify", if applicable)

- `gemini_cli.api.request.count` (Counter, Int): Counts all API requests.
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (if applicable)

- `gemini_cli.api.request.latency` (Histogram, ms): Measures API request latency.
  - **Attributes**:
    - `model`

- `gemini_cli.token.usage` (Counter, Int): Counts the number of tokens used.
  - **Attributes**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", or "tool")

- `gemini_cli.file.operation.count` (Counter, Int): Counts file operations.
  - **Attributes**:
    - `operation` (string: "create", "read", "update"): The type of file operation.
    - `lines` (Int, if applicable): Number of lines in the file.
    - `mimetype` (string, if applicable): Mimetype of the file.
    - `extension` (string, if applicable): File extension of the file.
    - `ai_added_lines` (Int, if applicable): Number of lines added/changed by AI.
    - `ai_removed_lines` (Int, if applicable): Number of lines removed/changed by AI.
    - `user_added_lines` (Int, if applicable): Number of lines added/changed by user in AI proposed changes.
    - `user_removed_lines` (Int, if applicable): Number of lines removed/changed by user in AI proposed changes.
