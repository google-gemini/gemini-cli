# Issue 8: CLI Command `gemini skills`

Implement a top-level `gemini skills` command to manage agent skills from the
CLI.

## Requirements

- Implement `gemini skills list` to show all discovered skills.
- Implement `gemini skills install <path>` to install a skill (directory or
  `.skill` zip).
- Implement `gemini skills uninstall <name...>` to uninstall one or more skills.
- Implement `gemini skills enable <name>` and `gemini skills disable <name>` to
  manage skill enablement.
- Support `--scope user` (default) and `--scope project` for installation,
  uninstallation, and enablement.
- Mirror the structure of `gemini extensions` for consistency.

## Implementation Details

- **Command Module**: `packages/cli/src/commands/skills.tsx`
- **Subcommands**:
  - `list.ts`: Lists skills using `SkillManager`.
  - `install.ts`: Copies a directory or extracts a `.skill` zip to the
    appropriate skills directory.
  - `uninstall.ts`: Removes the skill directory and updates settings.
  - `enable.ts` / `disable.ts`: Updates the `disabledSkills` setting in
    `settings.json`.
- **Registration**: Register the command in `packages/cli/src/config/config.ts`.

## Verification

- `gemini skills list`
- `gemini skills install ./my-skill`
- `gemini skills install ./my-skill.skill`
- `gemini skills uninstall my-skill`
- `gemini skills enable my-skill`
- `gemini skills disable my-skill`
