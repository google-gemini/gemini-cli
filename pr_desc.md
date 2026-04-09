## Summary

Adds a configurable delay (`security.yoloShellDelayMs`) before automatically
executing shell commands when the CLI is in YOLO mode. The delay natively
supports an interactive countdown in the CLI, allowing users to safely cancel
(`Ctrl+C`) dangerous commands without them executing. The default value is `0`
(disabled) to maintain backwards compatibility.

## Details

- **Configuration Layer:** Added `yoloShellDelayMs` to `settingsSchema.json` and
  passed it down to the `Config` singleton in `@google/gemini-cli-core`.
- **Tool Execution:** Modified `ShellToolInvocation.execute` to intercept YOLO
  mode shell commands (unless they are background commands) and display a
  1-second interval countdown using the `updateOutput` callback.
- **Cancellation:** Hooked into the `AbortSignal` during the countdown. If the
  user hits `Ctrl+C` before the timer expires, the tool returns early and avoids
  shelling out.
- **Tests:** Added comprehensive unit tests in `shell.test.ts` utilizing
  `vi.useFakeTimers()` to ensure accurate timing and correct cancellation
  handling.

## Related Issues

<!-- Use keywords to auto-close issues (Closes #123, Fixes #456). If this PR is
only related to an issue or is a partial fix, simply reference the issue number
without a keyword (Related to #123). -->

## How to Validate

1. In `settings.json`, add `"security": { "yoloShellDelayMs": 3000 }`.
2. Start the CLI with `--yolo` flag.
3. Prompt it to run a shell command (e.g. `Run ls -la`).
4. You should see a countdown:
   `[YOLO] Executing in 3s... (Press Ctrl+C to cancel)`.
5. Try cancelling the command during the countdown to ensure it doesn't run.

## Pre-Merge Checklist

- [x] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [x] Noted breaking changes (if any)
- [x] Validated on required platforms/methods:
  - [x] MacOS
    - [x] npm run
    - [ ] npx
    - [ ] Docker
    - [ ] Podman
    - [ ] Seatbelt
  - [ ] Windows
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
  - [ ] Linux
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
