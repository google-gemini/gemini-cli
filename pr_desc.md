## Summary

Fixes a TypeScript type compilation error in `gemini_cleanup.test.tsx` by
removing the unused variable `exitSpy`, which was causing an incompatible mock
signature error during build steps.

## Details

The mock mapped for `process.exit`, which inherently returns `never`, did not
perfectly align with the default generic return type inferred from `vi.spyOn()`,
causing TypeScript to fail with a property mismatch. Since the mock was only
used to prevent process termination and the assignment to `exitSpy` was never
accessed within the test suite, we completely removed the unused variable.

This fix ensures `npm run typecheck` resolves perfectly for the CLI workspace,
while preserving test structure.

## Related Issues

<!-- Use keywords to auto-close issues (Closes #123, Fixes #456) -->

N/A

## How to Validate

1. Checkout branch `fix/context-build`
2. Run `npm run typecheck -w @google/gemini-cli` and ensure it passes cleanly.
3. Validate tests with
   `npm run test -w @google/gemini-cli -- packages/cli/src/gemini_cleanup.test.tsx`

## Pre-Merge Checklist

- [x] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [x] Validated on required platforms/methods:
  - [x] Windows
    - [x] npm run
