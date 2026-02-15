# Common Regression Patterns

When analyzing a "bad" commit, look for these common patterns that often cause
regressions in this codebase.

## 1. State Synchronization Issues

**Symptoms**: UI doesn't update, stale data, "disappearing" history.
**Pattern**: State is derived from multiple sources that are updated at
different times, or state is updated via side-effects (e.g., `useEffect` or
callbacks) instead of being purely derived. **Fix**: Use `useMemo` to derive
state or ensure atomic updates.

## 2. Missing Hook Dependencies

**Symptoms**: Logic runs with old state, variables seem stuck. **Pattern**: A
`useCallback`, `useMemo`, or `useEffect` has an incomplete dependency array.
**Check**: Look for ESLint suppression comments like
`// eslint-disable-next-line react-hooks/exhaustive-deps`.

## 3. Bypassed Logic

**Symptoms**: Feature works sometimes but fails in specific paths (e.g., after
cancellation). **Pattern**: A refactor introduced a new submission or update
path that bypasses existing validation or cleanup logic. **Check**: Search for
direct calls to `onSubmit` or `setState` that should have gone through a wrapper
function (like `handleSubmit`).

## 4. Environment/Platform Specifics

**Symptoms**: Works on MacOS but fails on Windows or Linux. **Pattern**: Usage
of path delimiters (`/` vs
``), terminal escape sequences, or platform-specific CLI flags. **Fix**: Use `node:path`
and verify terminal capability detection.

## 5. Mock Mismatch in Tests

**Symptoms**: Tests pass but application fails (or vice versa). **Pattern**: A
mock in a unit test was not updated to reflect a change in the real
implementation's interface or behavioral expectations. **Check**: Verify that
mock return values and implementations match the current code.
