# Plan: Fix spurious ENOENT warning during workspace scan (#28826)

## Problem

`getFolderStructure` BFS walker warns on ENOENT when a subdirectory (e.g.
`projects.json.lock`) disappears between `readdir` and recursive descent. This
is a normal race — lock dirs are transient — but `debugLogger.warn` calls
`console.warn` unconditionally, producing visible noise.

## Fix

**File:** `packages/core/src/utils/getFolderStructure.ts`, lines 113–129 (catch
block in `readFullStructure`)

Separate ENOENT from EACCES/EPERM:

- ENOENT on root path → `return null` (unchanged)
- ENOENT on non-root path → silent `continue` (race condition, no warning)
- EACCES / EPERM → `debugLogger.warn` + `continue` (real access problem, keep
  warning)

## Test

**File:** `packages/core/src/utils/getFolderStructure.test.ts`

Add:
`'should silently skip a subdirectory that disappears between readdir and descent'`

- Spy on `fsPromises.readdir` to throw ENOENT for one specific subdir path
- Assert structure still returns successfully
- Assert `console.warn` was NOT called

## Verify

```bash
npm test -w @google/gemini-cli-core -- src/utils/getFolderStructure.test.ts
npm run preflight
```

## Rollback

Revert the two-line logic change in getFolderStructure.ts; the test file change
can stay.
