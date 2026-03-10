# Issue: Include available sessions in error when `--resume` gets invalid ID

Use this content to open a GitHub issue as a follow-up to
[PR #21429](https://github.com/google-gemini/gemini-cli/pull/21429).

---

## Title

**Include available sessions in error output when `--resume` is used with an
invalid session ID**

---

## Description

### Context

[PR #21429](https://github.com/google-gemini/gemini-cli/pull/21429) fixed the
case where `gemini -r` / `--resume` is used in a directory with **no** previous
sessions: the CLI now starts a fresh session and shows a startup warning instead
of crashing.

When the user passes an **invalid** session identifier (e.g. `--resume 99` when
only 5 sessions exist, or a typo'd UUID), the CLI correctly exits with an error
and tells the user to run `--list-sessions` to see available sessions. Exiting
is the right behavior here — the user asked to resume a specific session, so we
shouldn't start a fresh one instead.

### Problem

The error message says:

```text
Invalid session identifier "99".
  Use --list-sessions to see available sessions, then use --resume {number}, --resume {uuid}, or --resume latest.
```

The user then has to run a **second** command (`gemini --list-sessions`) to see
what's actually available, copy an index or UUID, and run `gemini --resume`
again. That's an extra round-trip.

### Proposed improvement

When `SessionError` with code `INVALID_SESSION_IDENTIFIER` is thrown, we already
have the list of available sessions in memory (we're in the branch where
sessions exist but the identifier didn't match). Use that to **include the
available sessions** (or a compact summary) directly in the error output before
exiting.

For example, the output could look like:

```text
Error resuming session: Invalid session identifier "99".

Available sessions for this project:
  1. Fix bug in auth (2 days ago)
  2. Refactor database schema (5 hours ago)
  3. Update documentation (Just now)

Use --resume 1, --resume 2, --resume 3, or --resume latest.
```

So the user can correct their command in one go, without running
`--list-sessions` separately.

### Benefits

- Same behavior: we still exit when the session ID is invalid (no "start fresh"
  for invalid ID).
- Better UX: one command gives both the error and the list of valid options.
- Reuses data we already have when throwing the error.

### Implementation notes

- `SessionSelector.findSession()` / `resolveSession()` has access to the
  sessions list when it throws
  `SessionError.invalidSessionIdentifier(identifier)`. Options:
  - Extend `SessionError.invalidSessionIdentifier(identifier, sessions?)` to
    optionally accept the session list and format it into the message, or
  - Add an optional `availableSessions` property to `SessionError` and format
    the list in `gemini.tsx` when handling the error.
- Keep the output compact (e.g. index, display name, relative time) so it
  doesn't flood the terminal for projects with many sessions; consider a limit
  (e.g. show at most 10) with "Run --list-sessions for more" if needed.
- Ensure `--list-sessions` behavior and output format stay the single source of
  truth for the full list; this is just a convenience snippet in the error.

---

## Labels (suggested)

`help-wanted`, `good first issue` (focused UX improvement, no behavior change to
exit vs continue).
