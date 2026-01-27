## Summary

Implement user consent before opening the browser for authentication, with a
fallback for non-interactive mode.

## Details

- Added `getConsentForOauth` to `packages/core/src/code_assist/oauth2.ts` which
  checks for UI listeners.
- Emits `ConsentRequest` event if listeners are present (interactive TUI).
- Fallback to `readline` prompt in terminal if no listeners and `stdin` is a TTY
  (non-interactive CLI).
- Throws `FatalAuthenticationError` if no listeners and not a TTY.
- Added comprehensive unit tests in `AppContainer.test.tsx`, `oauth2.test.ts`,
  `events.test.ts`, and `DialogManager.test.tsx`.

## Related Issues

None.

## How to Validate

Run the following test commands:

- `npm test -w @google/gemini-cli-core -- src/code_assist/oauth2.test.ts`
- `npm test -w @google/gemini-cli -- src/ui/AppContainer.test.tsx`
- `npm test -w @google/gemini-cli -- src/ui/components/DialogManager.test.tsx`
- `npm test -w @google/gemini-cli-core -- src/utils/events.test.ts`

## Pre-Merge Checklist

- [ ] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [ ] Validated on required platforms/methods:
  - [ ] MacOS
  - [ ] Windows
  - [x] Linux
    - [x] npm run
