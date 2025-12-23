# Issue 1: Infrastructure & Feature Gate

## Overview

Implement the foundational "Agent Skills" infrastructure. This includes the core
discovery service, the persistence model for disabling skills, and an
experimental feature gate to ensure the system is off-by-default.

## Key Components

### 1. Feature Gate (`experimental.skills`)

- Add `experimental.skills` to the settings schema.
- Default to `false`.
- Ensure that if this flag is disabled, no skill discovery occurs and the system
  remains inert.

### 2. Skill Manager Service (`SkillManager`)

- Create a centralized service in `@google/gemini-cli-core` to handle skill
  lifecycle.
- Implement "Tier-based Discovery":
  - **User Skills:** `~/.gemini/skills`
  - **Project Skills:** `.gemini/skills`
- Skills are defined as directories containing a `SKILL.md` file with YAML
  frontmatter (name, description).
- Implement deduplication logic where higher-precedence tiers (Project > User)
  override lower ones.

### 3. Settings Integration

- Support the `skills.disabled` setting (a list of skill names).
- The `SkillManager` should filter out disabled skills by default but allow the
  UI to see them (for the management CLI).

## Files Involved

- `packages/core/src/services/skillManager.ts`: The core service logic.
- `packages/core/src/services/skillManager.test.ts`: Unit tests for
  discovery/precedence.
- `packages/cli/src/config/settingsSchema.ts`: Schema update for the gate and
  disabled list.
- `packages/core/src/config/config.ts`: Integration into the startup sequence.

## Verification

- Run `npm run test` on `skillManager.test.ts`.
- Verify that with `experimental.skills: false`, the `SkillManager` is not
  initialized or discovers zero skills.
