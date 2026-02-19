---
name: experimentation
description: Guide developers through the process of adding new remote experiments (feature flags) to the Gemini CLI codebase.
---

# Experimentation Skill

This skill assists developers in adding net-new remote experiments (feature flags) to the Gemini CLI codebase. It acts as an interactive guide to ensure all necessary scaffolding, telemetry, command-line overrides, settings, and code placement are considered.

## Workflow: Adding a New Experiment

When a user asks to add a new experiment, follow these steps sequentially:

### 1. Scaffolding the Config Entry
- Guide the user to add the new experiment ID to `ExperimentFlags` in `packages/core/src/code_assist/experiments/flagNames.ts`.
- Ensure a corresponding entry is added to `ExperimentMetadata` in the same file. This must include a clear `description`, the `type` (`boolean`, `number`, `string`), and a sensible `defaultValue`.

### 2. Command Line and Settings Overrides (Crucial Pattern)
Every remote flag must be overridable via local settings and command-line arguments.
- **Settings:** Guide the user to add a corresponding property to the settings schema (e.g., in `schemas/settings.schema.json` and the corresponding TypeScript interfaces).
- **Command Line:** Guide the user to add a corresponding CLI argument in the appropriate command definitions.
- **The Config Object:** The source of truth for the rest of the application should be the unified `Config` object. Guide the user to wrap the remote experiment value, the local setting, and the command-line argument into a single property on the `Config` object. The typical priority order is: Command Line > Local Setting > Remote Experiment > Default Value.

### 3. Code Placement and Usage
- Discuss with the user *where* in the codebase this experiment should take effect.
- Guide them on how to correctly fetch and evaluate the experiment value using the unified `Config` object.
- Help them write the necessary conditional logic around the experimental feature.

### 4. Telemetry and Metrics (Crucial)
- Prompt the user to think deeply about what metrics are necessary to evaluate the success or failure of the experiment.
- Ask questions like: "How will we know if this feature is working as intended?" or "What telemetry events should be fired when this new code path is executed?"
- Help them add the necessary telemetry calls to the codebase to capture these insights.

### 5. Branching and PR Preparation
- If not already on a dedicated branch, help the user create a new git branch for this experiment (e.g., `git checkout -b exp/feature-name`).
- Remind them to run local tests and linting (`npm run lint:all`, `npm test` or `npm run preflight`) before preparing a Pull Request.
