# Gemini CLI Observability Guide

Telemetry provides crucial data about the Gemini CLI's performance, health, and usage. By enabling it, you can monitor operations, debug issues, and optimize tool usage through traces, metrics, and structured logs.

This entire system is built on the **[OpenTelemetry] (OTEL)** standard, allowing you to send data to any compatible backend, from your local terminal to a cloud service.

[OpenTelemetry]: https://opentelemetry.io/

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

This is the simplest way to inspect events, metrics, and traces without any external tools.
This setup prints all telemetry from the Gemini CLI to your terminal using a local collector.

**1. Create a Configuration File**

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

This setup sends all telemetry to Google Cloud for robust, long-term analysis.

**1. Prerequisites**

- A Google Cloud Project ID.
- **APIs Enabled**: Cloud Trace, Cloud Monitoring, Cloud Logging.
- **Authentication**: A Service Account with the roles `Cloud Trace Agent`, `Monitoring Metric Writer`, and `Logs Writer`. Ensure your environment is authenticated (e.g., via `gcloud auth application-default login` or a service account key file).

**2. Set environment variables**

Set the `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GOOGLE_GENAI_USE_VERTEXAI` environment variables:

```bash
GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
GOOGLE_GENAI_USE_VERTEXAI=true
```

**3. Create a Configuration File**

Create `.gemini/otel/collector-gcp.yaml`:

```bash
cat <<EOF > .gemini/otel/collector-gcp.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"

processors:
  batch:
    timeout: 1s

exporters:
  googlecloud:
    project: "${GOOGLE_CLOUD_PROJECT}"
    metric:
      prefix: "custom.googleapis.com/gemini_cli"
    log:
      default_log_name: "gemini_cli"
  debug:
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
      exporters: [googlecloud]
EOF
```

**4. Run the Collector**

You can run the collector for Google Cloud using either Docker or a locally installed `otelcol` binary.

**_Option 1: Use Docker _**

This method encapsulates the collector and its dependencies within a container.

1.  **Run the Collector**:
    Choose the command that matches your authentication method.

    - **If using Application Default Credentials (`gcloud auth application-default login`)**:

      ```bash
      docker run --rm --name otel-collector-gcp \
        -p 4317:4317 \
        --user "$(id -u):$(id -g)" \
        -v "$HOME/.config/gcloud/application_default_credentials.json":/etc/gcp/credentials.json:ro \
        -e "GOOGLE_APPLICATION_CREDENTIALS=/etc/gcp/credentials.json" \
        -v "$(pwd)/.gemini/otel/collector-gcp.yaml":/etc/otelcol-contrib/config.yaml \
        otel/opentelemetry-collector-contrib:latest --config /etc/otelcol-contrib/config.yaml
      ```

    - **If using a Service Account Key File**:
      ```bash
      docker run --rm --name otel-collector-gcp \
        -p 4317:4317 \
        -v "/path/to/your/sa-key.json":/etc/gcp/sa-key.json:ro \
        -e "GOOGLE_APPLICATION_CREDENTIALS=/etc/gcp/sa-key.json" \
        -v "$(pwd)/.gemini/otel/collector-gcp.yaml":/etc/otelcol-contrib/config.yaml \
        otel/opentelemetry-collector-contrib:latest --config /etc/otelcol-contrib/config.yaml
      ```

2.  **Check Status**:
    Your telemetry data will now appear in Google Cloud Trace, Monitoring, and Logging.

3.  **Stop the Collector**:
    ```bash
    docker stop otel-collector-gcp
    ```

**_Option 2: Use `otelcol-contrib`_**

Use this method if you prefer not to use Docker.

1.  **Run the Collector**:

    ```bash
    ./otelcol-contrib --config="file:$(pwd)/.gemini/otel/collector-gcp.yaml"
    ```

2.  **Check Status**:
    Your telemetry data will now appear in Google Cloud Trace, Monitoring, and Logging.

3.  **Stop the Collector**:
    Press `Ctrl+C` in the terminal where the collector is running.

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
