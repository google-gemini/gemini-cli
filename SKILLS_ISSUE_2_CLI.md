# Issue 2: Management CLI (/skills command)

## Overview

Implement the `/skills` slash command to provide users with a way to view and
manage their discovered skills. This serves as the primary "UX-ism" for
validating that the infrastructure from Issue 1 is functioning correctly.

## Key Components

### 1. `/skills` Command

- Implement a new slash command handler in
  `packages/cli/src/ui/commands/skillsCommand.ts`.
- Supported subcommands:
  - `/skills list` (Default): Shows all discovered skills, their descriptions,
    and their status (Enabled/Disabled).
  - `/skills enable <name>`: Enables a specific skill by name (updates
    settings).
  - `/skills disable <name>`: Disables a specific skill by name (updates
    settings).

### 2. `SkillsList` View

- Create a React component in
  `packages/cli/src/ui/components/views/SkillsList.tsx` for visual
  representation.
- Use distinct styling for enabled vs. disabled skills to make the status clear
  at a glance.
- Show the location/tier of each skill (User/Project) if applicable.

### 3. Integration

- Register the new command in `BuiltinCommandLoader.ts` so it is available in
  the interactive session.

## Files Involved

- `packages/cli/src/ui/commands/skillsCommand.ts`: Command handler logic.
- `packages/cli/src/ui/commands/skillsCommand.test.ts`: Unit tests for command
  parsing and setting updates.
- `packages/cli/src/ui/components/views/SkillsList.tsx`: The management UI
  component.
- `packages/cli/src/services/BuiltinCommandLoader.ts`: Registration of the
  command.

## Verification

- Run `/skills` in the CLI. You should see a list of discovered skills (or an
  empty list if none exist).
- Run `/skills disable <name>` and verify that the skill is moved to the
  "Disabled" section in the next list view.
- Verify that the `skills.disabled` setting in your config file is updated.
