# Local development guide

## Dev Tracing with OpenTelemetry

Dev traces are OpenTelemetry (otel) traces that are used to instrument the code
in various interesting places that are super useful for debugging: model calls,
tool scheduler, tool calls, etc.

Dev traces are verbose, specifically meant for understanding agent behaviour and
debugging issues. They are disabled by default.

To enable dev traces, you need to set the `GEMINI_DEV_TRACING=true` environment
variable.

### Viewing Dev Traces

Dev traces can be viewed in the Jaeger UI. To get started, run the following
command in your terminal:

```bash
npm run telemetry -- --target=local
```

This command will:

- Download and start Jaeger and an OTEL collector.
- Configure your workspace for local telemetry.
- Provide a link to the Jaeger UI, which is usually at `http://localhost:16686`.

Once the collector and Jaeger are running, you can run the Gemini CLI with dev
tracing enabled in a separate terminal:

```bash
GEMINI_DEV_TRACING=true gemini
```

After running your commands, you can view the traces in the Jaeger UI.

For more detailed information on telemetry configuration, see the
[OpenTelemetry documentation](./cli/telemetry.md).

### Instrumenting code with Dev Traces

You can add dev traces to your own code to provide more detailed
instrumentation. This is useful for debugging and understanding the flow of
execution.

The `runInDevTraceSpan` function can be used to wrap any section of code in a
trace span.

Here is a basic example of how to use it:

```typescript
import { runInDevTraceSpan } from '@google/gemini-cli-core';

await runInDevTraceSpan({ name: 'my-custom-span' }, async ({ metadata }) => {
  metadata.input = { key: 'value' };
  // Your code to be traced goes here
  metadata.output = { result: 'success' };
});
```

In this example:

- `name`: The name of the span, which will be displayed in the trace.
- `metadata.input`: (Optional) An object containing the input data for the
  traced operation.
- `metadata.output`: (Optional) An object containing the output data from the
  traced operation.
