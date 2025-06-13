# Gemini CLI Observability Guide

Telemetry provides crucial data about the Gemini CLI's performance, health, and usage. By enabling it, you can monitor operations, debug issues, and optimize tool usage through traces, metrics, and structured logs.

This entire system is built on the **[OpenTelemetry] (OTEL)** standard, allowing you to send data to any compatible backend, from your local terminal to a cloud service.

[OpenTelemetry]: https://opentelemetry.io/

## Quick Start: Google Cloud Telemetry

This quick start guide helps you send Gemini CLI telemetry data directly to Google Cloud (Cloud Trace, Cloud Monitoring, Cloud Logging).

**Prerequisites:**

1.  **Google Cloud Project:** You need an active Google Cloud Project.
2.  **APIs Enabled:** Ensure the following APIs are enabled in your project:
    - Cloud Trace API
    - Cloud Monitoring API
    - Cloud Logging API

**Steps:**

1.  **Set Environment Variable:**
    Set the `GOOGLE_CLOUD_PROJECT` environment variable to your project ID.

    ```bash
    export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
    ```

2.  **Configure Gemini CLI Settings:**
    In your workspace (`.gemini/settings.json`) or user (`~/.gemini/settings.json`) settings file, enable telemetry. **Crucially, do not set `telemetryOtlpEndpoint`, or ensure it's an empty string.**

    ```json
    {
      "telemetry": true,
      "sandbox": false
      // "telemetryOtlpEndpoint": "" // Leave empty or omit this line
    }
    ```

    _Note: Telemetry is not compatible with sandbox mode at this time. Ensure `"sandbox": false`._

3.  **Run Gemini CLI:**
    That's it! The Gemini CLI will now automatically detect the `GOOGLE_CLOUD_PROJECT` variable and send telemetry data directly to your Google Cloud project.

For more detailed configuration options, including using a local collector, other OTLP backends, or advanced Google Cloud collector setups, please refer to the sections below.

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
  // Optional: Specify a custom OTLP/gRPC endpoint for your collector.
  // If commented out or empty, behavior depends on GOOGLE_CLOUD_PROJECT env var.
  // "telemetryOtlpEndpoint": "http://localhost:4317"
}
```

The Gemini CLI determines where to send telemetry data based on the following priority:

1.  **`telemetryOtlpEndpoint` in Settings**: If `telemetryOtlpEndpoint` is configured in `.gemini/settings.json` (and is a valid OTLP/gRPC endpoint), telemetry data will be sent to this specified endpoint. This is typically used for sending data to a local collector or a specific third-party observability platform.
    _Example for a local collector:_

    ```json
    {
      "telemetry": true,
      "sandbox": false,
      "telemetryOtlpEndpoint": "http://localhost:4317"
    }
    ```

2.  **`GOOGLE_CLOUD_PROJECT` Environment Variable**: If `telemetryOtlpEndpoint` is not set or is empty, the CLI checks for the `GOOGLE_CLOUD_PROJECT` environment variable. If this variable is set, telemetry data (traces, metrics, and logs) will be sent directly to the corresponding Google Cloud services (Cloud Trace, Cloud Monitoring, Cloud Logging) for that project.
    _To enable direct Google Cloud export, ensure `GOOGLE_CLOUD_PROJECT` is set in your environment and `telemetryOtlpEndpoint` is omitted or empty in your settings:_

    ```json
    {
      "telemetry": true,
      "sandbox": false
      // "telemetryOtlpEndpoint": "" // or omit the line
    }
    ```

3.  **Console Exporter (Default Fallback)**: If neither `telemetryOtlpEndpoint` is configured nor the `GOOGLE_CLOUD_PROJECT` environment variable is set, telemetry data will be exported to the console. This is useful for quick local debugging without setting up a collector or cloud services.

## Running an OTEL Collector (Optional)

While the Gemini CLI can send telemetry directly to Google Cloud (if `GOOGLE_CLOUD_PROJECT` is set) or to the console (as a fallback), you might choose to run an OpenTelemetry (OTEL) Collector in specific scenarios:

- **Local Debugging/Inspection**: To view all telemetry data locally in your terminal.
- **Custom Processing/Routing**: If you want to receive telemetry data, process it, and then forward it to one or more backends (including Google Cloud or other observability platforms).
- **Using a Non-GCP Backend**: If you want to send data to a different OTLP-compatible backend that requires a collector.

An OTEL Collector is a service that receives, processes, and exports telemetry data. When a collector is used, the CLI sends data to it using the OTLP/gRPC protocol.

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

To use a local collector, you must explicitly set the `telemetryOtlpEndpoint` in your `.gemini/settings.json` file to the collector's address (e.g., `"http://localhost:4317"`). See the "Enabling Telemetry" section for details on setting this value.

This setup then prints all telemetry from the Gemini CLI to your terminal using that local collector. It's the simplest way to inspect events, metrics, and traces locally without any external tools when you've configured the CLI to send data to it.

**1. Configure `telemetryOtlpEndpoint`**

Create the file `.gemini/otel/collector-local.yaml` with the following:

```bash
cat <<EOF > .gemini/otel/collector-local.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"

processors:
  batch:
    timeout: 1s

exporters:
  debug:
    verbosity: detailed

service:
  telemetry:
    logs:
      level: "debug"
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
EOF
```

**2. Run the Collector**

You can run the collector using `docker` or using the `otelcol-contrib` binary directly.

**_Option 1: Use Docker_**

This is the simplest method if you have Docker installed.

1.  **Run the Collector**:

    ```bash
    docker run --rm --name otel-collector-local \
      -p 4317:4317 \
      -v "$(pwd)/.gemini/otel/collector-local.yaml":/etc/otelcol-contrib/config.yaml \
      otel/opentelemetry-collector-contrib:latest
    ```

2.  **Stop the Collector**:
    ```bash
    docker stop otel-collector-local
    ```

**_Option 2: Use `otelcol-contrib`_**

Use this method if you prefer not to use Docker.

1.  **Run the Collector**:
    Once installed, run the collector with the configuration file you created earlier:

    ```bash
    ./otelcol-contrib --config="$(pwd)/.gemini/otel/collector-local.yaml"
    ```

2.  **Stop the Collector**:
    Press `Ctrl+C` in the terminal where the collector is running.

### Google Cloud

The Gemini CLI can send telemetry data directly to Google Cloud services (Cloud Trace, Cloud Monitoring, Cloud Logging) if the `GOOGLE_CLOUD_PROJECT` environment variable is set and no `telemetryOtlpEndpoint` is configured in your settings. This is the simplest way to integrate with Google Cloud.

**Direct Export to Google Cloud (Recommended for most GCP users):**

1.  **Prerequisites**:
    - A Google Cloud Project ID.
    - **APIs Enabled**: Ensure Cloud Trace API, Cloud Monitoring API, and Cloud Logging API are enabled in your Google Cloud project.
    - **Authentication**: The environment where the Gemini CLI runs must be authenticated to Google Cloud with permissions to write traces, metrics, and logs. This is typically handled via Application Default Credentials (e.g., by running `gcloud auth application-default login`) or a service account with the necessary roles (`Cloud Trace Agent`, `Monitoring Metric Writer`, `Logs Writer`).
2.  **Configuration**:

    - Set the `GOOGLE_CLOUD_PROJECT` environment variable to your project ID.
      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      # Optionally, set GOOGLE_CLOUD_LOCATION if needed by your setup
      # export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
      ```
    - Ensure `telemetryOtlpEndpoint` is **not set** or is empty in your `.gemini/settings.json` file.
      ```json
      {
        "telemetry": true,
        "sandbox": false
        // "telemetryOtlpEndpoint": "" // Ensure this is empty or commented out
      }
      ```

3.  **Run Gemini CLI**: With these settings, the CLI will automatically detect `GOOGLE_CLOUD_PROJECT` and send telemetry directly to Google Cloud. No separate collector is needed for this direct export.

**Using an OTEL Collector with Google Cloud (Advanced/Custom Scenarios):**

You might choose to use an OTEL Collector if you want to:

- Perform custom processing, batching, or filtering of telemetry data before sending it to Google Cloud.
- Aggregate telemetry from multiple sources before exporting.
- Send data to Google Cloud from an environment where the CLI cannot directly authenticate or reach Google Cloud endpoints, but the collector can.

If you opt for this route, the setup involves running an OTEL Collector configured to export data to Google Cloud. The Gemini CLI would then be configured to send its telemetry to this collector's endpoint.

**1. Prerequisites (for Collector Setup)**

- All prerequisites for direct export (Project ID, APIs enabled, Authentication for the _collector_).
- An OTEL Collector setup (e.g., `otelcol-contrib` binary or Docker).

**2. Configure Gemini CLI to Send to Your Collector**
Update your `.gemini/settings.json` to point `telemetryOtlpEndpoint` to your collector's listening address (e.g., `http://localhost:4317` if the collector is local).

```json
{
  "telemetry": true,
  "sandbox": false,
  "telemetryOtlpEndpoint": "http://localhost:4317" // Or your collector's address
}
```

**3. Create a Collector Configuration File**
Create `.gemini/otel/collector-gcp.yaml` for your collector. This file tells the collector to receive data (e.g., on `0.0.0.0:4317`) and export it to Google Cloud.
_(The existing `collector-gcp.yaml` content provided in the document can be used here, it correctly defines an OTLP receiver and a Google Cloud exporter.)_
Ensure the `project` field within the `googlecloud` exporter configuration in this YAML is correctly set, typically by referencing the `GOOGLE_CLOUD_PROJECT` environment variable available to the collector.

```bash
# Ensure GOOGLE_CLOUD_PROJECT is set in the environment where the collector runs
# export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"

cat <<EOF > .gemini/otel/collector-gcp.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317" # Collector listens on this endpoint

processors:
  batch:
    timeout: 1s

exporters:
  googlecloud:
    project: "${GOOGLE_CLOUD_PROJECT}" # Collector uses this to export to GCP
    metric:
      prefix: "custom.googleapis.com/gemini_cli"
    log:
      default_log_name: "gemini_cli"
  debug: # Optional: for debugging the collector itself
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [googlecloud]
    metrics:
      receivers: [otlp]
      exporters: [googlecloud]
    logs:
      receivers: [otlp]
      exporters: [googlecloud, debug] # Sending to GCP and console for debug
EOF
```

**4. Run the Collector**
You can run the collector for Google Cloud using either Docker or a locally installed `otelcol-contrib` binary, ensuring it has access to Google Cloud credentials and the `GOOGLE_CLOUD_PROJECT` environment variable.
_(The existing Docker and `otelcol-contrib` run commands provided in the document can be used here. Ensure the collector's environment has `GOOGLE_APPLICATION_CREDENTIALS` set if using a service account key, or that it can pick up ADC.)_

**_Option 1: Use Docker_**
(Ensure `GOOGLE_CLOUD_PROJECT` is available to the Docker container if your `collector-gcp.yaml` relies on it for the `project` field, or hardcode it in the YAML.)

- **If using Application Default Credentials (`gcloud auth application-default login`)**:

  ```bash
  docker run --rm --name otel-collector-gcp \
    -p 4317:4317 \
    --user "$(id -u):$(id -g)" \
    -v "$HOME/.config/gcloud/application_default_credentials.json":/etc/gcp/credentials.json:ro \
    -e "GOOGLE_APPLICATION_CREDENTIALS=/etc/gcp/credentials.json" \
    -e "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}" \ # Pass the env var
    -v "$(pwd)/.gemini/otel/collector-gcp.yaml":/etc/otelcol-contrib/config.yaml \
    otel/opentelemetry-collector-contrib:latest --config /etc/otelcol-contrib/config.yaml
  ```

- **If using a Service Account Key File**:
  ```bash
  docker run --rm --name otel-collector-gcp \
    -p 4317:4317 \
    -v "/path/to/your/sa-key.json":/etc/gcp/sa-key.json:ro \
    -e "GOOGLE_APPLICATION_CREDENTIALS=/etc/gcp/sa-key.json" \
    -e "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}" \ # Pass the env var
    -v "$(pwd)/.gemini/otel/collector-gcp.yaml":/etc/otelcol-contrib/config.yaml \
    otel/opentelemetry-collector-contrib:latest --config /etc/otelcol-contrib/config.yaml
  ```

**_Option 2: Use `otelcol-contrib`_**
(Ensure `GOOGLE_CLOUD_PROJECT` is set in the shell where you run this command.)

```bash
./otelcol-contrib --config="file:$(pwd)/.gemini/otel/collector-gcp.yaml"
```

With this collector setup, the Gemini CLI sends data to your collector, and the collector then forwards it to Google Cloud.

---

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
    - `file_filtering_allow_build_artifacts` (boolean)
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
