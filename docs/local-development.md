# Local development guide

This guide provides instructions for setting up and running Gemini CLI locally,
including prerequisites, quick start steps, development features like tracing,
and troubleshooting common issues.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js**: Version 20.0.0 or higher. You can verify your version by running:

  ```bash
  node --version
  ```

  Download and install from [nodejs.org](https://nodejs.org/) or use a version
  manager like [nvm](https://github.com/nvm-sh/nvm).

- **npm**: Comes bundled with Node.js. Verify with:

  ```bash
  npm --version
  ```

- **Git**: Required for cloning the repository and version control. Verify with:

  ```bash
  git --version
  ```

  Download from [git-scm.com](https://git-scm.com/) if not installed.

## Quick start

Follow these steps to get Gemini CLI running locally:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/google-gemini/gemini-cli.git
    cd gemini-cli
    ```

2.  **Install dependencies:**

    ```bash
    npm ci
    ```

    This installs all dependencies for the monorepo, including all packages.

3.  **Build the project:**

    ```bash
    npm run build
    ```

4.  **Run Gemini CLI locally:**

    ```bash
    npm run start
    ```

    This starts the CLI in development mode. You can also pass arguments:

    ```bash
    npm run start -- "your prompt here"
    ```

5.  **Run tests** (optional but recommended):

    ```bash
    npm run test
    ```

For a complete pre-flight check before submitting contributions, run:

```bash
npm run preflight
```

This runs clean, install, format, build, lint, typecheck, and tests.

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

## Troubleshooting

Here are solutions to common issues you might encounter during local
development.

### Node.js version mismatch

**Error:** `error engine: Unsupported engine for @google/gemini-cli`

**Solution:** Gemini CLI requires Node.js 20.0.0 or higher. Check your version
with `node --version` and upgrade if necessary:

```bash
# Using nvm
nvm install 20
nvm use 20
```

### npm install fails

**Error:** Various dependency resolution errors during `npm install` or `npm ci`

**Solution:** Try these steps:

1.  Remove existing `node_modules` and the lockfile cache:

    ```bash
    npm run clean
    ```

2.  Reinstall dependencies:

    ```bash
    npm ci
    ```

### Build errors

**Error:** TypeScript compilation errors or missing modules

**Solution:**

1.  Ensure all dependencies are installed:

    ```bash
    npm ci
    ```

2.  Clean and rebuild:

    ```bash
    npm run clean && npm run build
    ```

### Permission errors

**Error:** `EACCES: permission denied` errors on macOS/Linux

**Solution:** Avoid using `sudo` with npm. Fix npm permissions by following the
[npm documentation](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)
or use a Node version manager like nvm.

### Tests fail to run

**Error:** Test failures or "Cannot find module" errors when running tests

**Solution:**

1.  Ensure the project is built:

    ```bash
    npm run build
    ```

2.  Run tests:

    ```bash
    npm run test
    ```

### Port already in use (telemetry)

**Error:** `EADDRINUSE` when starting telemetry servers

**Solution:** Another process is using the required port. Find and stop it:

```bash
# Find process using port 4000 (Genkit) or 16686 (Jaeger)
lsof -i :4000
# Then kill the process with the PID shown
kill <PID>
```

For additional help, see the [CONTRIBUTING.md](/CONTRIBUTING.md) guide or open
an issue on GitHub.
