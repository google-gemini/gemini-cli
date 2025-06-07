# Gemini CLI Observability Guide

Telemetry provides crucial data about the Gemini CLI's performance, health, and usage. By enabling it, you can monitor operations, debug issues, and optimize tool usage through traces, metrics, and structured logs.

This entire system is built on the **[OpenTelemetry] (OTEL)** standard, allowing you to send data to any compatible backend, from your local terminal to a cloud service.

[OpenTelemetry]: https://opentelemetry.io/

## Quick Start: Enabling Telemetry

You can enable telemetry in multiple ways. [Configuration](configuration.md) is primarily managed via the `.gemini/settings.json` file and environment variables, but CLI flags can override these settings for a specific session.

**Order of Precedence:**

1.  **CLI Flag (`--telemetry`):** These override all other settings for the current session.
2.  **Workspace Settings File (`.gemini/settings.json`):** If no CLI flag is used, the `telemetry` value from this project-specific file is used.
3.  **User Settings File (`~/.gemini/settings.json`):** If not set by a flag or workspace settings, the value from this global user file is used.
4.  **Default:** If telemetry is not configured by a flag or in any settings file, it is disabled.

Add this line to enable telemetry by in workspace (`.gemini/settings.json`) or user (`~/.gemini/settings.json`) settings:

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

You can also control telemetry with the `GEMINI_TELEMETRY_ENABLED` environment variable.

#### Mode 1: Console Output (Default)

If you only set `"enabled": true` and do nothing else, the CLI will output all telemetry data directly to your console. This is the simplest way to inspect events, metrics, and traces without any external tools.

#### Mode 2: Sending to a Collector

To send data to a local or remote OpenTelemetry collector, set the following environment variable:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

The CLI sends data using the OTLP/gRPC protocol.

Learn more about OTEL exporter standard configuration in [documentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

## Running an OTEL Collector

An OTEL Collector is a service that receives, processes, and exports telemetry data. Below are common setups.

### Local

This setup prints all telemetry from the Gemini CLI to your terminal using a local Docker container.

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
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
    logs:
      receivers: [otlp]
      exporters: [debug]
EOF
```

**2. Run the Collector**

In your terminal, run this Docker command:

```bash
docker run --rm --name otel-collector-local \
  -p 4317:4317 \
  -v "$(pwd)/.gemini/otel/collector-local.yaml":/etc/otelcol-contrib/config.yaml \
  otel/opentelemetry-collector-contrib:latest
```

**3. Stop the Collector**

```bash
docker stop otel-collector-local
```

### Google Cloud

This setup sends all telemetry to Google Cloud for robust, long-term analysis.

**1. Prerequisites**

- A Google Cloud Project ID.
- **APIs Enabled**: Cloud Trace, Cloud Monitoring, Cloud Logging.
- **Authentication**: A Service Account with the roles `Cloud Trace Agent`, `Monitoring Metric Writer`, and `Logs Writer`. Ensure your environment is authenticated (e.g., via `gcloud auth application-default login` or a service account key file).

**2. Create a Configuration File**

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
    trace:
    metric:
      prefix: "custom.googleapis.com/gemini_code"
    log:
      default_log_name: "gemini_code"
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

**3. Run the Collector**

This command mounts your Google Cloud credentials into the container.

If using application default credentials:

```bash
docker run --rm --name otel-collector-gcp \
  -p 4317:4317 \
  -v "/home/user/.config/gcloud/application_default_credentials.json":/etc/gcp/credentials.json \
  -e "GOOGLE_APPLICATION_CREDENTIALS=/etc/gcp/credentials.json" \
  -v "$(pwd)/.gemini/otel/collector-gcp.yaml":/etc/otelcol-contrib/config.yaml \
  otel/opentelemetry-collector-contrib:latest --config /etc/otelcol-contrib/config.yaml
```

If using sevice account key:

```bash
docker run --rm --name otel-collector-gcp \
  -p 4317:4317 \
  -v "/path/to/your/sa-key.json":/etc/gcp/sa-key.json:ro \
  -e "GOOGLE_APPLICATION_CREDENTIALS=/etc/gcp/sa-key.json" \
  -v "$(pwd)/.gemini/otel/collector-gcp.yaml":/etc/otelcol-contrib/config.yaml \
  otel/opentelemetry-collector-contrib:latest --config /etc/otelcol-contrib/config.yaml
```

Your telemetry data will now appear in Cloud Trace, Monitoring, and Logging.

**3. Stop the Collector**

```bash
docker stop otel-collector-gcp
```

---

## Data Reference: Logs & Metrics

### Logs

These are timestamped records of specific events.

- `gemini_code.config`: Fired once at startup with the CLI's configuration.

  - **Attributes**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `vertex_ai_enabled` (boolean)
    - `log_user_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `file_filtering_allow_build_artifacts` (boolean)

- `gemini_code.user_prompt`: Fired when a user submits a prompt.

  - **Attributes**:
    - `prompt_char_count`
    - `prompt` (except if `log_user_prompts_enabled` is false)

- `gemini_code.tool_call`: Fired for every function call.

  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `error` (optional)
    - `error_type` (optional)

- `gemini_code.api_request`: Fired when making a request to the Gemini API.

  - **Attributes**:
    - `model`
    - `duration_ms`
    - `prompt_token_count`

- `gemini_code.api_error`: Fired if the API request fails.

  - **Attributes**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `attempt`

- `gemini_code.api_response`: Fired upon receiving a response from the Gemini API.
  - **Attributes**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `attempt`

### Metrics

These are numerical measurements of behavior over time.

- `gemini_code.session.count` (Counter, Int): Incremented once per CLI startup.

- `gemini_code.tool.call.count` (Counter, Int): Counts tool calls.

  - **Attributes**:
    - `function_name`
    - `success` (boolean)

- `gemini_code.tool.call.latency` (Histogram, ms): Measures tool call latency.

  - **Attributes**:
    - `function_name`

- `gemini_code.api.request.count` (Counter, Int): Counts all API requests.

  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (optional)

- `gemini_code.api.request.latency` (Histogram, ms): Measures API request latency.

  - **Attributes**:
    - `model`

- `gemini_code.token.input.count` (Counter, Int): Counts the total number of input tokens sent to the API.
  - **Attributes**:
    - `model`
