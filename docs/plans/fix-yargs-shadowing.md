# Plan: Fix Yargs Command Shadowing and API Key Requirement for Subcommands

## Problem Description
The Gemini CLI uses `yargs` for argument parsing. A greedy default command (`$0 [query..]`) was registered at the top of the command chain, causing it to shadow explicit subcommands like `mcp`, `extensions`, `skills`, and `hooks`. 

When a user runs a subcommand (e.g., `gemini extensions install ...`), `yargs` incorrectly matches it against the default command, treating the subcommand and its arguments as a conversational query. This triggers the main application logic in `gemini.tsx`, which attempts to initialize the Gemini API client. This initialization requires a `GEMINI_API_KEY`, which is not needed for administrative subcommands, leading to a fatal error if the key is missing.

## Reproduction Steps
1. Unset any Gemini API key: `unset GEMINI_API_KEY`
2. Attempt to run a subcommand: `gemini extensions list`
3. **Observed Behavior**: The CLI fails with an error: "When using Gemini API, you must specify the GEMINI_API_KEY environment variable."
4. **Root Cause**: The CLI is attempting to start an interactive conversational session instead of executing the `extensions` subcommand.

## Expected Behaviors
- Subcommands should be matched first and executed without requiring a Gemini API key (unless the subcommand itself requires it).
- The default conversational query should only be matched if no explicit subcommand is provided.
- The application should not attempt to initialize the LLM client or enter interactive mode when a management subcommand is being executed.

## Key Files & Context
- `packages/cli/src/config/config.ts`: Main entry point for CLI argument parsing and command registration.
- `packages/cli/src/gemini.tsx`: Main application entry point that handles initialization and UI startup.

## Implementation Steps

### 1. Reorder Command Registration in `packages/cli/src/config/config.ts`
- Register all explicit subcommands (`mcp`, `extensions`, `skills`, `hooks`) **before** the default `$0` command.
- Ensure `mcpCommand` is actually registered using `yargsInstance.command(mcpCommand)`.

### 2. Add High-Priority Middleware to Set `isCommand`
- Add a yargs middleware at the top level of `parseArguments` to explicitly flag when a subcommand is matched. This provides a reliable way for the rest of the application to know it should skip LLM initialization.
  ```typescript
  yargsInstance.middleware((argv) => {
    const subcommands = ['mcp', 'extensions', 'extension', 'skills', 'skill', 'hooks', 'hook'];
    if (subcommands.includes(argv._[0] as string)) {
      argv.isCommand = true;
    }
  }, true); // true for 'applyBeforeValidation'
  ```

### 3. Update `gemini.tsx` to Respect `isCommand`
- In the `main()` function of `packages/cli/src/gemini.tsx`:
  - Skip authentication (`partialConfig.refreshAuth` and `validateNonInteractiveAuth`) if `argv.isCommand` is true.
  - Skip sandbox/child process relaunching logic if `argv.isCommand` is true.

## Verification & Testing
- **Manual Verification**: Run `gemini extensions install ...` without a `GEMINI_API_KEY` set and verify it proceeds to installation.
- **Unit Tests**: Ensure that `argv.isCommand` is correctly set in `parseArguments` for various subcommands.
