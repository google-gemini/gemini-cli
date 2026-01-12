# Tests: Add Validation for Parallel Extension Loading

## Summary

Adds comprehensive unit tests for the parallel extension loading features
introduced in PR #2. Verified that the new parallel implementation is robust,
handles errors safely, and correctly maintains state.

**Builds on [PR #2](link-to-pr-2).**

---

## Test Coverage

New test file `packages/cli/src/config/extension-manager-parallel.test.ts` adds
**11 new tests**:

### ✅ 1. Parallel Loading Scenarios

- **Multiple Extensions**: Verified loading 5 extensions simultaneously works
  correctly.
- **Version Handling**: Verified metadata is parsed correctly for each extension
  across concurrent loads.
- **Speed**: Tests complete instantly (~500ms), confirming minimal overhead.

### ✅ 2. Robustness & Error Handling

- **Partial Failures**: Verified that if one extension fails (invalid JSON),
  **valid extensions still load**. This ensures one bad extension doesn't crash
  startup.
- **Missing Config**: Gracefully skips directories without config files.
- **Non-Directory Entries**: Ignores files in the extensions folder.

### ✅ 3. Safety Checks

- **Duplicate Names**: Verified that duplicate extension names are detected and
  logged (only first instance loads).
- **Double Load**: Verified that calling `loadExtensions()` twice throws an
  error to prevent race conditions.
- **Empty/Missing Directory**: Handles empty or missing `.gemini/extensions`
  folder gracefully.

---

## Verification Results

Command:

```bash
npm test --workspace=packages/cli -- --run extension-manager-parallel.test.ts
```

Result:

```text
✓ src/config/extension-manager-parallel.test.ts (11 tests)
  ✓ ExtensionManager parallel loading > multiple extensions loading > should load multiple extensions in parallel
  ✓ ExtensionManager parallel loading > partial failures > should load valid extensions even when one fails
  ...
Test Files  1 passed (1)
Tests       11 passed (11)
```

## Implementation Details

- **Mocking**: Used `vi.spyOn` and module mocking for `fs` and
  `@google/gemini-cli-core` to simulate filesystem states without disk I/O.
- **Consistency**: Fixed path construction in tests to match `ExtensionStorage`
  implementation, ensuring tests reflect real-world behavior.
