# Local Development Guide

This guide provides instructions for setting up and using local development
features, such as development tracing.

## Development Tracing

Development traces (dev traces) are OpenTelemetry (OTel) traces that help you
debug your code by instrumenting interesting events like model calls, tool
scheduler, tool calls, etc.

Dev traces are verbose and are specifically meant for understanding agent
behaviour and debugging issues. They are disabled by default.

To enable dev traces, set the `GEMINI_DEV_TRACING=true` environment variable
when running Gemini CLI.

### Viewing Dev Traces

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
    GEMINI_DEV_TRACING=true gemini [your-command]
    ```

3.  **View the traces:**

    After running your command, open the Jaeger UI link in your browser to view
    the traces.

For more detailed information on telemetry, see the
[telemetry documentation](./cli/telemetry.md).

### Instrumenting Code with Dev Traces

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
