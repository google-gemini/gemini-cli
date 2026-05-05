## Summary

This PR implements the session export to a JSON file and import from a JSON file functionality, fixing issue #23663. It allows users to export an active conversation using the `/export-session <path>` command and resume/import it via the `--session-file <path>` CLI flag.

## Details

- **Export Session:** A new built-in command `export-session` uses the `SessionSelector` to resolve the current active session and writes the raw JSON `ConversationRecord` to the requested path.
- **Import Session:** The `resolveSessionId` function logic was augmented to accept `sessionFileArg`. If present, it loads the specified file, allocates a new local `sessionId`, and computes a new local `sessionPath` under `.gemini/tmp/`, thus keeping the original shared file untouched.
- Config parser was updated to parse the new `--session-file` string flag.

## Related Issues

Closes #23663

## How to Validate

1. Build the package (`npm run build` or `npm run build:cli`).
2. Start a session and chat briefly.
3. Run `/export-session my-session.json`. Check the created JSON file.
4. Start a new terminal instance with `npx @google/gemini-cli --session-file my-session.json`.
5. Observe the conversation is restored, and subsequent chats do not mutate `my-session.json` but write to a new `.jsonl` file in the temporary directory.
6. Verify unit tests via `npm test -w packages/cli`.

## Pre-Merge Checklist

- [ ] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [ ] Validated on required platforms/methods:
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