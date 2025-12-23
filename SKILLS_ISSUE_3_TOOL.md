# Issue 3: The Activation Tool

## Overview

Implement the `activate_skill` tool, which is the mechanism the model uses to
"load" a skill's full instructions and understand its associated folder
structure. This tool bridges the gap between the model knowing a skill exists
and actually being able to use it.

## Key Components

### 1. `ActivateSkillTool`

- Implement the tool in `packages/core/src/tools/activate-skill.ts`.
- **Purpose:** When called with a skill name, it reads the full Markdown content
  of the skill from disk (using `SkillManager.getSkillContent`).
- **Contextual Awareness:** It also provides the model with a "directory
  structure" hint if the skill is located within a folder that contains other
  supporting files (like examples or templates).

### 2. Tool Registration

- Add `ACTIVATE_SKILL_TOOL_NAME` to `tool-names.ts`.
- Register the tool in `packages/core/src/tools/tools.ts`.

### 3. Security Policy

- Update `packages/core/src/policy/policies/write.toml` to include the
  `activate_skill` tool.
- By default, this tool should require user confirmation (ASK_USER) because it
  modifies the model's instructions and context for the rest of the session.

## Files Involved

- `packages/core/src/tools/activate-skill.ts`: Tool implementation.
- `packages/core/src/tools/activate-skill.test.ts`: Unit tests for content
  loading and error handling.
- `packages/core/src/tools/tool-names.ts`: Constant definition.
- `packages/core/src/config/config.ts`: Registration logic.
- `packages/core/src/policy/policies/write.toml`: Security policy update.

## Verification

- Run the unit tests in `activate-skill.test.ts`.
- Verify that calling the tool with a valid skill name returns the Markdown body
  of the skill.
- Verify that calling the tool with an invalid name returns a clear error
  message that the model can understand.
