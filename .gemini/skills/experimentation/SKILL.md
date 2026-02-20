---
name: experimentation
description: Guide developers through the process of adding new remote experiments (feature flags) to the Gemini CLI codebase.
---

# Experimentation Skill

This skill assists developers in adding net-new remote experiments (feature flags) to the Gemini CLI codebase. You MUST follow these steps sequentially to ensure consistency, type safety, and proper validation.

## Key Files
- `packages/core/src/code_assist/experiments/flagNames.ts`: Definitions and metadata for all experiment flags.
- `packages/core/src/config/config.ts`: Unified configuration object where strongly typed wrappers for experiments are added.
- `packages/cli/src/config/settingsSchema.ts`: Schema definitions for `settings.json`.
- `packages/core/src/config/config.experiment.test.ts`: Regression tests for experiment resolution.

## Core Pattern: Unified Configuration

Gemini CLI uses a unified `Config` object as the source of truth. Every experiment should be accessed via the `config.getExperimentValue(flagId)` method, which internally handles the priority of overrides:
**Command Line Argument (--experiment-*) > Local Setting (experimental.*) > Remote Experiment > Default Value.**

---

## Workflow: Adding a New Experiment

### 1. List Current Experiments
- **File:** `packages/core/src/code_assist/experiments/flagNames.ts`
- **MANDATORY:** Read this file and explicitly list EVERY existing experiment name and its numeric ID to the user in your response. This is a critical step to ensure a unique ID and name are chosen. Do NOT just read the file silently.
- **Analyze Usage:** Search for `getExperimentValue` in `packages/core/src/config/config.ts` to see how similar experiments are wrapped and used.

### 2. Ask for Details (Behavior & Intent)
- **CRITICAL:** You MUST ask the user:
  1. "What is the name of the new flag?" (e.g., `enable-new-thing`)
  2. "What is the data type?" (boolean, number, or string)
  3. "What should the behavior be when the flag is enabled vs. disabled?"
  4. "What are the architectural impacts (routing, tools, prompt construction, etc.)?"
- Do not proceed until the behavior is clearly defined and documented.

### 3. Add Experiment ID and Metadata
- **File:** `packages/core/src/code_assist/experiments/flagNames.ts`
- Add a new constant to the `ExperimentFlags` object with a unique numeric ID.
- Add a corresponding entry to `ExperimentMetadata`, including `description`, `type`, and `defaultValue`.

### 4. Add Config Entry and Schema
- **Step A (Wrapper):** In `packages/core/src/config/config.ts`, add a strongly typed wrapper method:
  ```typescript
  isNewThingEnabled(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.ENABLE_NEW_THING) ?? false;
  }
  ```
- **Step B (Schema):** In `packages/cli/src/config/settingsSchema.ts`, add the kebab-case name to the `experimental.properties` section to enable IDE autocompletion.
- **Step C (Regenerate):** Run `npm run schema:settings` to update `schemas/settings.schema.json`.

### 5. Implement Code Change with Debug Logging
- **Usage:** Implement the logic defined in Step 2.
- **Logging:** At the point of usage, add a debug log to confirm the flag's state:
  ```typescript
  debugLogger.debug('New thing enabled:', config.isNewThingEnabled());
  ```
- **Telemetry (Crucial):** Prompt the user to think about success metrics. Ask: "How will we know if this feature is working as intended?" and help them add telemetry calls to capture these insights.

### 6. Update Tests
- **File:** `packages/core/src/config/config.experiment.test.ts`
- Add a test case to verify that the flag resolves correctly across all priority levels (CLI, Settings, Remote, Default).
- Example: `expect(config.isNewThingEnabled()).toBe(true)` when passed via `experimentalCliArgs`.

### 7. Final Validation and PR Preparation
- **Validation Action:** Run the CLI with debugging enabled and the new flag set via the command line:
  ```bash
  npm run start -- --debug --experiment your-flag-name=value --prompt "test"
  ```
- **Log Verification:** Check the console for the "Experimental CLI args" normalization log and your custom debug log.
- **Branching:** If not already on a dedicated branch, help the user create one (e.g., `git checkout -b exp/feature-name`).
- **Pre-flight:** Remind the user to run local tests and linting (`npm run lint:all`, `npm test` or `npm run preflight`) before preparing a Pull Request.
