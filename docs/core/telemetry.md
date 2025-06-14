# Gemini CLI Observability Guide

Telemetry provides crucial data about the Gemini CLI's performance, health, and usage. By enabling it, you can monitor operations, debug issues, and optimize tool usage through traces, metrics, and structured logs.

This entire system is built on the **[OpenTelemetry] (OTEL)** standard, allowing you to send data to any compatible backend, from your local terminal to a cloud service.

[OpenTelemetry]: https://opentelemetry.io/

## Quick Start

### Telemetry with Google Cloud

1.  **Ensure Prerequisites:**
    Ensure that:
    - You have exported the `GOOGLE_CLOUD_PROJECT` environment variable.
    - You have authenticated with Google Cloud and have the necessary IAM roles.
      For full details, see the [Google Cloud](#google-cloud) prerequisites.
2.  **Run the Script:** Execute the following command from the project root:
    ```bash
    ./scripts/telemetry_gcp.js
    ```
3.  **Run Gemini CLI:** In a separate terminal, run your Gemini CLI commands. This will generate telemetry data that the collector will capture.
4.  **View Data:** The script will provide links to view your telemetry data (traces, metrics, logs) in the Google Cloud Console.
5.  **Details:** Refer to documentation for telemetry in [Google Cloud](#google-cloud).

### Local Telemetry with Jaeger UI (for Traces)

1.  **Run the Script:** Execute the following command from the project root:
    ```bash
    ./scripts/local_telemetry.js
    ```
2.  **Run Gemini CLI:** In a separate terminal, run your Gemini CLI commands. This will generate telemetry data that the collector will capture.
3.  **View Logs/Metrics:** Check the `.gemini/otel/collector.log` file for raw logs and metrics.
4.  **View Traces:** Open your browser and go to `http://localhost:16686` to see traces in the Jaeger UI.
5.  **Details:** Refer to documentation for telemetry in [Local](#local).

## Enabling Telemetry

You can enable telemetry in multiple ways. [Configuration](configuration.md) is primarily managed via the `.gemini/settings.json` file and environment variables, but CLI flags can override these settings for a specific session.

> **A Note on Sandbox Mode:** Telemetry is not compatible with sandbox mode at this time. Turn off sandbox mode before enabling telemetry. Tracked in #894.

**Order of Precedence:**

1.  **CLI Flag (`--telemetry`):** These override all other settings for the current session.
2.  **Workspace Settings File (`.gemini/settings.json`):** If no CLI flag is used, the `telemetry` value from this project-specific file is used.
3.  **User Settings File (`~/.gemini/settings.json`):** If not set by a flag or workspace settings, the value from this global user file is used.
4.  **Default:** If telemetry is not configured by a flag or in any settings file, it is disabled.

Add these lines to enable telemetry by in workspace (`.gemini/settings.json`) or user (`~/.gemini/settings.json`) settings:

```json
{
  "telemetry": true,
  "sandbox": false
}
```

## Running an OTEL Collector

An OTEL Collector is a service that receives, processes, and exports telemetry data.
The CLI sends data using the OTLP/gRPC protocol.

Learn more about OTEL exporter standard configuration in [documentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Configuration

1. Install [otelcol-contrib] or use [docker]

[otelcol-contrib]: https://github.com/open-telemetry/opentelemetry-collector-contrib
[docker]: https://www.docker.com/

2. Create a folder for the OTEL configurations:

```
mkdir .gemini/otel
```

### Local

Use the `scripts/local_telemetry.js` script that automates the entire process of setting up a local telemetry pipeline, including configuring the necessary settings in your `.gemini/settings.json` file. The script installs `otelcol-contrib` (The OpenTelemetry Collector) and `jaeger` (The Jaeger UI for viewing traces). To use it:

1.  **Run the Script**:
    Execute the script from the root of the repository:

    ```bash
    ./scripts/local_telemetry.js
    ```

    The script will:

    - Download Jaeger and OTEL if needed.
    - Start a local Jaeger instance.
    - Start an OTEL collector configured to receive data from the Gemini CLI.
    - Automatically enable telemetry in your workspace settings.
    - On exit, disable telemetry.

2.  **View Traces**:
    Open your web browser and navigate to **http://localhost:16686** to access the Jaeger UI. Here you can inspect detailed traces of Gemini CLI operations.

3.  **Inspect Logs and Metrics**:
    The script redirects the OTEL collector's output (which includes logs and metrics) to `.gemini/otel/collector.log`. You can monitor this file to see the raw telemetry data:
    ```bash
    tail -f .gemini/otel/collector.log
    ```
4.  **Stop the Services**:
    Press `Ctrl+C` in the terminal where the script is running to stop the OTEL Collector and Jaeger services.

### Google Cloud

For a streamlined setup targeting Google Cloud, use the `scripts/telemetry_gcp.js` script which automates setting up a local OpenTelemetry collector that forwards data to your Google Cloud project.

1.  **Prerequisites**:

    - Ensure you have a Google Cloud Project ID.
    - Export the `GOOGLE_CLOUD_PROJECT` environment variable to make it available to the OTEL collector.
      ```bash
      export GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Authenticate with Google Cloud (e.g., run `gcloud auth application-default login` or ensure `GOOGLE_APPLICATION_CREDENTIALS` is set).
    - Ensure your account/service account has the necessary roles: "Cloud Trace Agent", "Monitoring Metric Writer", and "Logs Writer".

2.  **Run the Script**:
    Execute the script from the root of the repository:

    ```bash
    ./scripts/telemetry_gcp.js
    ```

    The script will:

    - Download the `otelcol-contrib` binary if needed.
    - Start an OTEL collector configured to receive data from the Gemini CLI and export it to your specified Google Cloud project.
    - Automatically enable telemetry and disable sandbox mode in your workspace settings (`.gemini/settings.json`).
    - Provide direct links to view traces, metrics, and logs in your Google Cloud Console.
    - On exit (Ctrl+C), it will attempt to restore your original telemetry and sandbox settings.

3.  **Run Gemini CLI:**
    In a separate terminal, run your Gemini CLI commands. This will generate telemetry data that the collector will capture.

4.  **View Telemetry in Google Cloud**:
    Use the links provided by the script to navigate to the Google Cloud Console and view your traces, metrics, and logs.

5.  **Inspect Local Collector Logs**:
    The script redirects the local OTEL collector\'s output to `.gemini/otel/collector-gcp.log`. You can monitor this file for detailed information or troubleshooting:

    ```bash
    tail -f .gemini/otel/collector-gcp.log
    ```

6.  **Stop the Service**:
    Press `Ctrl+C` in the terminal where the script is running to stop the OTEL Collector.

## Data Reference: Logs & Metrics

A `sessionId` is included as a common attribute on all logs and metrics.

### Logs

These are timestamped records of specific events.

- `gemini_cli.config`: Fired once at startup with the CLI's configuration.

  - **Attributes**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_user_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)

- `gemini_cli.user_prompt`: Fired when a user submits a prompt.

  - **Attributes**:
    - `prompt_length`
    - `prompt` (except if `log_user_prompts_enabled` is false)

- `gemini_cli.tool_call`: Fired for every function call.

  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", or "modify", optional)
    - `error` (optional)
    - `error_type` (optional)

- `gemini_cli.api_request`: Fired when making a request to the Gemini API.

  - **Attributes**:
    - `model`
    - `request_text` (optional)

- `gemini_cli.api_error`: Fired if the API request fails.

  - **Attributes**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`

- `gemini_cli.api_response`: Fired upon receiving a response from the Gemini API.
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
    - `response_text` (optional)

### Metrics

These are numerical measurements of behavior over time.

- `gemini_cli.session.count` (Counter, Int): Incremented once per CLI startup.

- `gemini_cli.tool.call.count` (Counter, Int): Counts tool calls.

  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", or "modify", optional)

- `gemini_cli.tool.call.latency` (Histogram, ms): Measures tool call latency.

  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject", or "modify", optional)

- `gemini_cli.api.request.count` (Counter, Int): Counts all API requests.

  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (optional)

- `gemini_cli.api.request.latency` (Histogram, ms): Measures API request latency.

  - **Attributes**:
    - `model`

- `gemini_cli.token.usage` (Counter, Int): Counts the number of tokens used.
  - **Attributes**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", or "tool")
