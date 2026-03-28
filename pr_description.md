## Summary

This PR implements human-friendly session aliases, allowing users to resume and
manage sessions using memorable names instead of just UUIDs or indices.

## Details

- Added support for `--resume <alias>` in CLI arguments.
- Updated `/resume` slash command to support aliases.
- Enhanced `--list-sessions` output to display aliases alongside session IDs.
- Resolved merge conflicts with upstream/main and fixed build errors in
  `AppContainer.tsx`.
- Updated documentation in `docs/cli/session-management.md` and
  `docs/cli/cli-reference.md`.

## Related Issues

Closes https://github.com/google-gemini/gemini-cli/issues/22919

## How to Validate

1. Start a new session: `npm run start`
2. Perform some actions, then exit.
3. List sessions to see the generated alias: `npm run start -- --list-sessions`
4. Resume using the alias: `npm run start -- --resume <alias-name>`
5. Verify tests:
   `npm test -w @google/gemini-cli -- src/config/config.test.ts src/utils/sessionUtils.test.ts`

## Pre-Merge Checklist

- [x] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [x] Noted breaking changes (if any)
- [x] Validated on required platforms/methods:
  - [ ] MacOS
  - [ ] Windows
  - [x] Linux
    - [x] npm run
