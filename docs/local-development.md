# Local development guide

This guide provides instructions for setting up and using local development
features, such as development tracing.

## DevTools inspector

Gemini CLI includes a built-in DevTools inspector. This web-based UI provides a
real-time view of the agent's internal state, allowing you to inspect network
requests, tool executions, and console logs. It is an essential tool for
debugging complex agent behaviors and developing new UI features.

### Building the DevTools package

The DevTools server (`@google/gemini-cli-devtools`) is a separate package in the
monorepo. If you run the local CLI without building it first, you will encounter
an `ERR_MODULE_NOT_FOUND` error.

To use DevTools locally, you must first build the entire project from the root
directory:

```bash
npm install
npm run build:all
```

### Running with DevTools

You must run your local build, not the globally installed `gemini` command.

There are two ways to start the DevTools inspector:

1.  **Always on (Recommended for UI development):** Enable the inspector
    permanently in your settings file. The server will start in the background
    every time you run the CLI.

    Find `settings.json` in the `.gemini` folder in your user's home directory and add the following to the `general` block:

    ```json
    "general": {
      "devtools": true
    }
    ```

    Start your local CLI using `npm run start`. Then, open your browser and
    navigate to `http://localhost:25417`.

2.  **On-demand (Hotkey):** If you prefer faster CLI startup times, you can
    start the DevTools server only when needed.

    Start your local CLI using `npm run start`. At any point during your
    session, press **`F12`**. The CLI will spin up the server and automatically
    attempt to open `http://localhost:25417` in your default browser.

## Development tracing

Development traces (dev traces) are OpenTelemetry (OTel) traces that help you
debug your code by instrumenting interesting events like model calls, tool
scheduler, tool calls, etc.

Dev traces are verbose and are specifically meant for understanding agent
behavior and debugging issues. They are disabled by default.

To enable dev traces, set the `GEMINI_DEV_TRACING=true` environment variable
when running Gemini CLI.

### Viewing dev traces

You can view dev traces using either Jaeger or the Genkit Developer UI.

#### Using Genkit

Genkit provides a web-based UI for viewing traces and other telemetry data.

1.  **Start the Genkit telemetry server:**

    Run the following command to start the Genkit server:

    ```bash
    npm run telemetry -- --target=genkit
    ```

    The script will output the URL for the Genkit Developer UI, for example:

    ```
    Genkit Developer UI: http://localhost:4000
    ```

2.  **Run Gemini CLI with dev tracing:**

    In a separate terminal, run your Gemini CLI command with the
    `GEMINI_DEV_TRACING` environment variable:

    ```bash
    GEMINI_DEV_TRACING=true gemini
    ```

3.  **View the traces:**

    Open the Genkit Developer UI URL in your browser and navigate to the
    **Traces** tab to view the traces.

#### Using Jaeger

You can view dev traces in the Jaeger UI. To get started, follow these steps:

1.  **Start the telemetry collector:**

    Run the following command in your terminal to download and start Jaeger and
    an OTEL collector:

    ```bash
    npm run telemetry -- --target=local
    ```

    This command also configures your workspace for local telemetry and provides
    a link to the Jaeger UI (usually `http://localhost:16686`).

2.  **Run Gemini CLI with dev tracing:**

    In a separate terminal, run your Gemini CLI command with the
    `GEMINI_DEV_TRACING` environment variable:

    ```bash
    GEMINI_DEV_TRACING=true gemini
    ```

3.  **View the traces:**

    After running your command, open the Jaeger UI link in your browser to view
    the traces.

For more detailed information on telemetry, see the
[telemetry documentation](./cli/telemetry.md).

### Instrumenting code with dev traces

You can add dev traces to your own code for more detailed instrumentation. This
is useful for debugging and understanding the flow of execution.

Use the `runInDevTraceSpan` function to wrap any section of code in a trace
span.

Here is a basic example:

```typescript
import { runInDevTraceSpan } from '@google/gemini-cli-core';

await runInDevTraceSpan({ name: 'my-custom-span' }, async ({ metadata }) => {
  // The `metadata` object allows you to record the input and output of the
  // operation as well as other attributes.
  metadata.input = { key: 'value' };
  // Set custom attributes.
  metadata.attributes['gen_ai.request.model'] = 'gemini-4.0-mega';

  // Your code to be traced goes here
  try {
    const output = await somethingRisky();
    metadata.output = output;
    return output;
  } catch (e) {
    metadata.error = e;
    throw e;
  }
});
```

In this example:

- `name`: The name of the span, which will be displayed in the trace.
- `metadata.input`: (Optional) An object containing the input data for the
  traced operation.
- `metadata.output`: (Optional) An object containing the output data from the
  traced operation.
- `metadata.attributes`: (Optional) A record of custom attributes to add to the
  span.
- `metadata.error`: (Optional) An error object to record if the operation fails.
