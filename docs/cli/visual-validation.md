# Visual validation and TTY testing

Gemini CLI uses a multi-layered approach to validate its user interface (UI) and
ensure the CLI boots correctly in real terminal environments. This document
explains the tools and techniques used for visual regression and bootstrap
testing.

## Overview

While standard integration tests focus on logic and file system operations,
visual validation ensures that the terminal output looks correct to the user. We
use two primary methods for this:

1.  **TTY Bootstrap Smoke Tests:** Spawns the actual built binary in a real
    pseudo-terminal (PTY) to verify startup and basic interactivity.
2.  **Visual Regression (SVG Snapshots):** Renders integrated UI flows inside a
    virtual terminal and compares the output against committed "golden" SVG
    baselines.

## TTY bootstrap smoke tests

These tests validate that the Gemini CLI binary can successfully initialize and
render its Ink-based UI in a real terminal environment. They catch issues like
missing dependencies, broken startup sequences, or TTY-specific crashes.

These tests are located in `packages/cli/integration-tests/`.

### Running TTY tests

To run the bootstrap smoke test, use the following command:

```bash
npm test -w @google/gemini-cli -- integration-tests/bootstrap.test.ts
```

### How it works

The test utility `runInteractive` (found in `@google/gemini-cli-test-utils`)
uses `node-pty` to spawn the CLI. It provides a programmable interface to wait
for specific text markers and send simulated user input.

```typescript
const run = await runInteractive();
const readyMarker = 'Type your message or @path/to/file';
await run.expectText(readyMarker, 30000); // Wait for the main prompt
await run.kill();
```

### TDD Example: Adding a Welcome Message

To add a new visual feature like a "Welcome to Gemini CLI!" message:

1.  **Write the failing test:** Update `bootstrap.test.ts` to expect the new
    string.
    ```typescript
    const welcomeMessage = 'Welcome to Gemini CLI!';
    await run.expectText(welcomeMessage, 30000);
    ```
2.  **Verify failure:** Run `npm test` and observe the TTY rig reporting the
    missing text.
3.  **Implement the feature:** Add the message to `AppHeader.tsx`.
4.  **Verify success:** Rebuild the binary (`npm run bundle`) and run the test
    again to see it pass.

## Visual regression with SVG snapshots

To automate the verification of complex UI layouts (like tables, progress bars,
or policy warnings), we use **SVG Snapshots**. This approach captures colors,
spacing, and text formatting in a deterministic way.

These tests are located in `packages/cli/src/ui/` and use the `AppRig` utility.

### Running visual tests

To run the visual validation suite, use the following command:

```bash
npm test -w @google/gemini-cli -- src/ui/PolicyVisual.test.tsx
```

### Updating snapshots

If you intentionally change the UI, the visual tests will fail because the
actual output no longer matches the saved snapshot. To "bless" your changes and
update the snapshots, run the tests with the update flag:

```bash
npm test -w @google/gemini-cli -- src/ui/PolicyVisual.test.tsx -u
```

After updating, you must review the resulting `.snap.svg` files in the
`__snapshots__` directory to ensure they look as intended.

### New use cases unlocked

This framework allows maintainers to validate scenarios that were previously
difficult to automate:

- **Policy Visibility:** Ensuring that security blocks or "Ask User" prompts are
  clearly rendered and not suppressed by error verbosity settings.
- **Integrated Flow Validation:** Testing the full cycle of a model response
  triggering a tool, which is then handled by the policy engine and displayed in
  the UI.
- **Startup Health:** Verifying that changes to the core scheduler or config
  resolution don't cause the app to hang in the "Initializing..." state.

## Comparison with existing tests

| Test Type             | Rig Used   | Environment       | Best For                            |
| :-------------------- | :--------- | :---------------- | :---------------------------------- |
| **Integration (E2E)** | `TestRig`  | Headless / Binary | File system logic, tool execution   |
| **Bootstrap Smoke**   | `node-pty` | Real PTY / Binary | Startup health, TTY compatibility   |
| **Visual (Snapshot)** | `AppRig`   | Virtual / Ink     | UI layout, colors, integrated flows |
| **Behavioral (Old)**  | `AppRig`   | Virtual / Ink     | Model decision-making and steering  |

## Why this matters

Existing testing layers often miss critical user experience regressions:

- **Integration tests** may pass if the logic is sound, but they won't detect if
  the app hangs during UI initialization or if the binary fails to communicate
  with the TTY.
- **Behavioral evaluations** validate the model's intent, but they don't ensure
  that the resulting state (like a policy violation) is actually visible to the
  user.

The new validation tools bridge these gaps. For example, they were used to
expose critical issues where visual feedback for the Policy Engine was
suppressed in certain modes and the core scheduler was prone to TTY-based race
conditions. The high-fidelity validation provided by these tools was essential
for identifying and verifying the fixes for these issues.

## Next steps

- **Extend Coverage:** Add SVG snapshots for more complex components like
  `DiffRenderer` or `McpStatus`.
- **CI Integration:** Ensure TTY-based tests run in GitHub Actions environments
  that support pseudo-terminals.
