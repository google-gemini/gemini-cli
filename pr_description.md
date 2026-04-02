## Summary

Fixes sandbox prompt persistence for tools like npm (network and global cache
access) after the user selects 'Allow for this session'. It also ensures that
sandbox expansion prompts are not shown when sandboxing is disabled.

## Details

- Normalize command names (lowercase, strip .exe) for consistent policy lookups.
- Improved permission matching to support subpaths and path identity checks
  (using `getPathIdentity` and `isSubpath`).
- Sanitize paths before adding them to policy approvals.
- Ensure proactive permission suggestions are only made when sandboxing is
  enabled.
- Added regression tests for proactive expansion logic in
  `packages/core/src/tools/shell_proactive.test.ts`.

## Related Issues

Closes #24555 Fixes "I have multiple sandbox prompts when running npm to enable
network as well as read/write for npm global cache. When I choose allow for this
session I still get prompts each time npm runs."

## How to Validate

1. Run the new regression tests:
   ```bash
   npm test -w @google/gemini-cli-core -- src/tools/shell_proactive.test.ts
   ```
2. Verify existing tests pass:
   ```bash
   npm test -w @google/gemini-cli-core -- src/tools/shell.test.ts
   ```

## Pre-Merge Checklist

- [ ] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [x] Validated on required platforms/methods:
  - [x] MacOS
    - [x] npm run
