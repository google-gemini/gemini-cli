---
name: experimentation
description: Guide developers through the process of adding new remote experiments (feature flags) to the Gemini CLI codebase.
---

# Experimentation Skill

This skill assists developers in adding net-new remote experiments (feature flags) to the Gemini CLI codebase. It acts as an interactive guide to ensure all necessary scaffolding, telemetry, command-line overrides, settings, and code placement are considered.

## Key Files
- `packages/core/src/code_assist/experiments/flagNames.ts`: Definitions and metadata for all experiment flags.
- `packages/core/src/config/config.ts`: Unified configuration object where strongly typed wrappers for experiments are added.
- `packages/cli/src/config/settingsSchema.ts`: Schema definitions for `settings.json`.

## Core Pattern: Unified Configuration

Gemini CLI uses a unified `Config` object as the source of truth. Every experiment should be accessed via the `config.getExperimentValue(flagId)` method, which internally handles the priority of overrides:
**Command Line Argument (--experiment-*) > Local Setting (experimental.*) > Remote Experiment > Default Value.**

## Workflow: Adding a New Experiment

When a user asks to add a new experiment, follow these steps sequentially:

### 0. Research and Discovery
- **Locate Existing Flags:** Read `packages/core/src/code_assist/experiments/flagNames.ts` to see current IDs and naming conventions.
- **Check for Duplicates:** Ensure the proposed experiment doesn't already exist or overlap with another flag.
- **Analyze Usage:** Search for `getExperimentValue` in `packages/core/src/config/config.ts` to see how similar experiments are wrapped and used.

### 1. Define Behavior and Intent
- **CRITICAL:** Before writing any code, you MUST ask the user: "What should the behavior be when the flag is enabled vs. disabled?"
- Discuss the architectural impact: Will this change a routing strategy? Enable a new tool? Modify a prompt?
- Document the intended logic to ensure the implementation aligns with the experiment's goals.

### 2. Scaffolding the Config Entry
- **File:** `packages/core/src/code_assist/experiments/flagNames.ts`
- Add the new experiment ID to `ExperimentFlags`.
- Add a corresponding entry to `ExperimentMetadata`, including `description`, `type`, and `defaultValue`.
- **Note:** The key in `ExperimentFlags` (converted to kebab-case) will be the name used for CLI flags and Settings. For example, `MY_NEW_FEATURE` becomes `my-new-feature`.

### 3. Update Settings Schema
- **File:** `packages/cli/src/config/settingsSchema.ts`
- To ensure IDE autocompletion and validation work for the new experiment in `settings.json`, you MUST add it to the `experimental.properties` section of the schema.
- Match the kebab-case name used in step 2.
- **Action:** After updating the file, run `npm run schema:settings` to regenerate `schemas/settings.schema.json`.

### 4. Usage in Code
- **Generic Method:** `config.getExperimentValue<Type>(ExperimentFlags.YOUR_FLAG_ID)`
- **Preferred Pattern (Strongly Typed Wrappers):** To maintain a clean and discoverable interface, you should add a strongly typed wrapper method in `packages/core/src/config/config.ts`. This allows other developers to easily find and use your experiment with proper type safety.
  
  Example in `Config` class:
  ```typescript
  isNewFeatureEnabled(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.MY_NEW_FEATURE) ?? false;
  }
  ```

- **Testing:** Add or update tests in `packages/core/src/config/config.experiment.test.ts` to verify the flag resolves correctly across all priority levels (CLI, Settings, Remote, Default).
- **CLI Override:** Users can override via `--experiment your-flag-name=value`.
- **Settings Override:** Users can override in their `settings.json`:
  ```json
  "experimental": {
    "your-flag-name": value
  }
  ```

### 5. Telemetry and Metrics (Crucial)
- Prompt the user to think deeply about what metrics are necessary to evaluate the success or failure of the experiment.
- Ask questions like: "How will we know if this feature is working as intended?" or "What telemetry events should be fired when this new code path is executed?"
- Help them add the necessary telemetry calls to the codebase to capture these insights.

### 6. Branching and PR Preparation
- If not already on a dedicated branch, help the user create a new git branch for this experiment (e.g., `git checkout -b exp/feature-name`).
- Remind them to run local tests and linting (`npm run lint:all`, `npm test` or `npm run preflight`) before preparing a Pull Request.
