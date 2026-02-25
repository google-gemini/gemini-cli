Fixes #15404 Related: #1907

## Problem

Multiple users on Windows report that AV software (Bitdefender, Avast, Norton,
AVG) flags Gemini CLI's generated JSON files as "stealers"
(`Generic.PyStealer.AD`, `IDP.HELU.PSE46`). Two file categories are affected:
error reports (written to `%TEMP%`) and chat sessions (in `~/.gemini/tmp/`).

## Root Cause

1. Error reports are written to `os.tmpdir()` (`%TEMP%`) — writing structured
   JSON to the system temp dir is the #1 heuristic trigger for stealer detection
2. The JSON content (session IDs, tokens, context, timestamps) pattern-matches
   data exfiltration payloads

## Solution

| Change                                                      | File(s)                                                                              | Effect                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Move error reports to `~/.gemini/tmp/<hash>/error-reports/` | `errorReporting.ts`, `baseLlmClient.ts`, `turn.ts`, `client.ts`, `local-executor.ts` | Eliminates the `%TEMP%` heuristic trigger                            |
| Add `_meta` provenance header to JSON files                 | `errorReporting.ts`                                                                  | Gives AV scanners a clear signal these are legitimate tool artifacts |
| Auto-create error-reports directory                         | `errorReporting.ts`                                                                  | Prevents write failures when the dir doesn't exist                   |
| Add AV troubleshooting docs                                 | `docs/troubleshooting.md`                                                            | Gives affected users immediate workarounds                           |
| Update tests                                                | `errorReporting.test.ts`, `turn.test.ts`                                             | Verifies `_meta` presence, key ordering, dir creation                |

## Testing

- All existing `errorReporting.test.ts` tests updated and passing
- New tests for `_meta` key ordering and directory auto-creation
- `npm run build` passes
