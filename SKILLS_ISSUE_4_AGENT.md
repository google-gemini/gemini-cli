# Issue 4: Agent Integration (The Brain)

## Overview

Inject the "Agent Skills" concept into the LLM's consciousness. This involves
modifying the system prompt to include a high-level list of available skills and
ensuring the `activate_skill` tool is only visible to the model when skills are
actually present.

## Key Components

### 1. System Prompt Injection

- Update `packages/core/src/core/prompts.ts` to include a "Skill Guidance"
  section.
- If skills are discovered, provide a bulleted list of skill names and their
  descriptions.
- Instruct the model that it can use the `activate_skill` tool to load the full
  details of any listed skill.

### 2. Dynamic Tool Attachment

- Update `packages/core/src/core/client.ts` to conditionally include the
  `activate_skill` tool in the model's toolset.
- Update `packages/cli/src/ui/hooks/useReactToolScheduler.ts` to ensure the tool
  call is correctly scheduled and handled in the React UI loop.

### 3. Verification & Tests

- Update `prompts.test.ts` to verify that the skill list appears in the
  generated system prompt when skills are present in the config.

## Files Involved

- `packages/core/src/core/prompts.ts`: System prompt generation logic.
- `packages/core/src/core/prompts.test.ts`: Tests for prompt injection.
- `packages/core/src/core/client.ts`: Tool attachment logic.
- `packages/cli/src/ui/hooks/useReactToolScheduler.ts`: UI tool scheduling.

## Verification

- Run `packages/core/src/core/prompts.test.ts`.
- In a live session (with `experimental.skills: true`), ask the model "What
  skills do you have?". It should be able to list them even if it hasn't
  "activated" any yet.
