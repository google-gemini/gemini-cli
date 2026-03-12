# Local development guide

This guide provides instructions for setting up and using local development
features for Gemini CLI.

## Prerequisites

Before working with Gemini CLI locally, ensure the following tools are installed:

- Node.js (>=20.0.0, recommended ~20.19.0 for development)
- npm (included with Node.js)
- Git

You can verify the installations by running:

```bash
node -v
npm -v
git --version
```

If any of these commands fail, install the missing dependency before continuing.

## Quick Start

Follow these steps to set up and run the Gemini CLI locally.

1. Clone the repository

```bash
git clone https://github.com/google-gemini/gemini-cli.git
cd gemini-cli
```

2. Install dependencies

```bash
npm install
```

3. Build the project

```bash
npm run build
```

4. Run the CLI locally

```bash
npm start
```

After starting the CLI, you can run commands locally and begin development or debugging.

## Troubleshooting

### Node.js version issues

Ensure you are using the recommended Node.js version for development (~20.19.0).

Check your version:

```bash
node -v
```
If necessary, use a Node version manager such as nvm to install or switch Node versions.

### Dependency installation errors

If dependency installation fails, try clearing the npm cache and reinstalling dependencies:
  
```bash
npm cache clean --force
npm install
```

### Permission issues

Avoid using sudo with npm commands as it may cause permission conflicts.
Using a Node version manager such as nvm is recommended for managing Node.js environments.


## Tracing

Gemini CLI uses OpenTelemetry (OTel) to record traces that help you debug agent
behavior. Traces instrument key events like model calls, tool scheduler
operations, and tool calls.

Traces provide deep visibility into agent behavior and help you debug complex
issues. They are captured automatically when you enable telemetry.

### View traces

You can view traces using Genkit Developer UI, Jaeger, or Google Cloud.

#### Use Genkit

Genkit provides a web-based UI for viewing traces and other telemetry data.

1.  **Start the Genkit telemetry server:**

    Run the following command to start the Genkit server:

    ```bash
    npm run telemetry -- --target=genkit
    ```

    The script will output the URL for the Genkit Developer UI. For example:
    `Genkit Developer UI: http://localhost:4000`

2.  **Run Gemini CLI:**

    In a separate terminal, run your Gemini CLI command:

    ```bash
    gemini
    ```

3.  **View the traces:**

    Open the Genkit Developer UI URL in your browser and navigate to the
    **Traces** tab to view the traces.

#### Use Jaeger

You can view traces in the Jaeger UI for local development.

1.  **Start the telemetry collector:**

    Run the following command in your terminal to download and start Jaeger and
    an OTel collector:

    ```bash
    npm run telemetry -- --target=local
    ```

    This command configures your workspace for local telemetry and provides a
    link to the Jaeger UI (usually `http://localhost:16686`).
    - **Collector logs:** `~/.gemini/tmp/<projectHash>/otel/collector.log`

2.  **Run Gemini CLI:**

    In a separate terminal, run your Gemini CLI command:

    ```bash
    gemini
    ```

3.  **View the traces:**

    After running your command, open the Jaeger UI link in your browser to view
    the traces.

#### Use Google Cloud

You can use an OpenTelemetry collector to forward telemetry data to Google Cloud
Trace for custom processing or routing.

> **Warning:** Ensure you complete the
> [Google Cloud telemetry prerequisites](./cli/telemetry.md#prerequisites)
> (Project ID, authentication, IAM roles, and APIs) before using this method.

1.  **Configure `.gemini/settings.json`:**

    ```json
    {
      "telemetry": {
        "enabled": true,
        "target": "gcp",
        "useCollector": true
      }
    }
    ```

2.  **Start the telemetry collector:**

    Run the following command to start a local OTel collector that forwards to
    Google Cloud:

    ```bash
    npm run telemetry -- --target=gcp
    ```

    The script outputs links to view traces, metrics, and logs in the Google
    Cloud Console.
    - **Collector logs:** `~/.gemini/tmp/<projectHash>/otel/collector-gcp.log`

3.  **Run Gemini CLI:**

    In a separate terminal, run your Gemini CLI command:

    ```bash
    gemini
    ```

4.  **View logs, metrics, and traces:**

    After sending prompts, view your data in the Google Cloud Console. See the
    [telemetry documentation](./cli/telemetry.md#view-google-cloud-telemetry)
    for links to Logs, Metrics, and Trace explorers.

For more detailed information on telemetry, see the
[telemetry documentation](./cli/telemetry.md).

### Instrument code with traces

You can add traces to your own code for more detailed instrumentation.

Adding traces helps you debug and understand the flow of execution. Use the
`runInDevTraceSpan` function to wrap any section of code in a trace span.

Here is a basic example:

```typescript
import { runInDevTraceSpan } from '@google/gemini-cli-core';
import { GeminiCliOperation } from '@google/gemini-cli-core/lib/telemetry/constants.js';

await runInDevTraceSpan(
  {
    operation: GeminiCliOperation.ToolCall,
    attributes: {
      [GEN_AI_AGENT_NAME]: 'gemini-cli',
    },
  },
  async ({ metadata }) => {
    // metadata allows you to record the input and output of the
    // operation as well as other attributes.
    metadata.input = { key: 'value' };
    // Set custom attributes.
    metadata.attributes['custom.attribute'] = 'custom.value';

    // Your code to be traced goes here.
    try {
      const output = await somethingRisky();
      metadata.output = output;
      return output;
    } catch (e) {
      metadata.error = e;
      throw e;
    }
  },
);
```

In this example:

- `operation`: The operation type of the span, represented by the
  `GeminiCliOperation` enum.
- `metadata.input`: (Optional) An object containing the input data for the
  traced operation.
- `metadata.output`: (Optional) An object containing the output data from the
  traced operation.
- `metadata.attributes`: (Optional) A record of custom attributes to add to the
  span.
- `metadata.error`: (Optional) An error object to record if the operation fails.
