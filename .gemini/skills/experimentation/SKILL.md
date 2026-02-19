---
name: experimentation
description: Manage, view, and override Gemini CLI remote experiments and feature flags locally.
---

# Experimentation Skill

This skill allows you to safely manage, view, and locally override remote Gemini CLI experiments (feature flags).

## Core Concepts

Remote experimentation is enabled by default. `packages/core/src/code_assist/experiments/flagNames.ts` contains the active `ExperimentFlags` and `ExperimentMetadata` which describe each flag's purpose, type, and default value.

Currently, Gemini CLI supports local overrides using the `GEMINI_EXP` environment variable pointing to a JSON file.

## Workflow: Viewing Experiments

When a user asks what experiments are active or available:
1. Search `packages/core/src/code_assist/experiments/flagNames.ts` for `ExperimentMetadata`.
2. Extract the descriptions, types, and defaults to answer the user's questions.
3. Check if there is an active local override file at `.gemini/experiments.json`.

## Workflow: Local Overrides & Opt-Out

When a user wants to override a flag locally (e.g., to turn off a preview feature) or opt-out:

1. Use the `scripts/override_experiment.cjs` script bundled with this skill to safely update or create `.gemini/experiments.json`.
2. When the user asks to "opt out of experiments", use the script to set `experimentIds` to an empty array and clear flags, ensuring a sensible baseline.
3. **Important:** After updating the JSON file, instruct the user to run the CLI with `GEMINI_EXP` set, e.g.:
   `GEMINI_EXP=.gemini/experiments.json gemini <command>`

## Using the Scripts

You have access to `scripts/override_experiment.cjs` to manage the local overrides safely without disrupting the file structure required by the CLI backend.

Example usage:
```bash
# Enable an experiment locally
node .gemini/skills/experimentation/scripts/override_experiment.cjs set 45740196 true

# Remove an override
node .gemini/skills/experimentation/scripts/override_experiment.cjs unset 45740196

# Opt out of all experiments (clear everything)
node .gemini/skills/experimentation/scripts/override_experiment.cjs clear
```