# Local development guide

This guide provides instructions for setting up the project for local
development and using local development features, such as tracing.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20.0.0 or higher
- **npm**: Comes with Node.js
- **Git**: For cloning the repository

## Quick start

Follow these steps to run the CLI locally:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/google-gemini/gemini-cli.git
    cd gemini-cli
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Build the project:**

    ```bash
    npm run build
    ```

4.  **Run the CLI:**

    ```bash
    npm run start
    ```

## Troubleshooting

- **Error: `MODULE_NOT_FOUND` or import errors**
  - **Cause:** Dependencies are not installed correctly, or the project hasn't
    been built.
  - **Solution:** Run `npm install` followed by `npm run build`.

- **Error: `EACCES` permission errors**
  - **Cause:** Issues with npm global permissions or file system permissions.
  - **Solution:** Ensure you have proper permissions for the project directory.
    On macOS/Linux, you may need to fix npm permissions or use a version manager
    like `nvm`.

- **Build fails with missing dependencies**
  - **Cause:** The node_modules directory may be incomplete.
  - **Solution:** Delete the `node_modules` folder and `package-lock.json` file,
    then run `npm install` again.

- **TypeScript errors during development**
  - **Cause:** Type definitions may be out of sync.
  - **Solution:** Run `npm run typecheck` to verify types. You can also run
    `npm run build` to rebuild the project.

## Tracing

Traces are OpenTelemetry (OTel) records that help you debug your code by
instrumenting key events like model calls, tool scheduler operations, and tool
calls.

Traces provide deep visibility into agent behavior and are invaluable for
debugging complex issues. They are captured automatically when telemetry is
enabled.

### Viewing traces

You can view traces using either Jaeger or the Genkit Developer UI.

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

2.  **Run Gemini CLI:**

    In a separate terminal, run your Gemini CLI command:

    ```bash
    gemini
    ```

3.  **View the traces:**

    Open the Genkit Developer UI URL in your browser and navigate to the
    **Traces** tab to view the traces.

#### Using Jaeger

You can view traces in the Jaeger UI. To get started, follow these steps:

1.  **Start the telemetry collector:**

    Run the following command in your terminal to download and start Jaeger and
    an OTEL collector:

    ```bash
    npm run telemetry -- --target=local
    ```

    This command also configures your workspace for local telemetry and provides
    a link to the Jaeger UI (usually `http://localhost:16686`).

2.  **Run Gemini CLI:**

    In a separate terminal, run your Gemini CLI command:

    ```bash
    gemini
    ```

3.  **View the traces:**

    After running your command, open the Jaeger UI link in your browser to view
    the traces.

For more detailed information on telemetry, see the
[telemetry documentation](./cli/telemetry.md).

### Instrumenting code with traces

You can add traces to your own code for more detailed instrumentation. This is
useful for debugging and understanding the flow of execution.

Use the `runInDevTraceSpan` function to wrap any section of code in a trace
span.

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
    // The `metadata` object allows you to record the input and output of the
    // operation as well as other attributes.
    metadata.input = { key: 'value' };
    // Set custom attributes.
    metadata.attributes['custom.attribute'] = 'custom.value';

    // Your code to be traced goes here
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
