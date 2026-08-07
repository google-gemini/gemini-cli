# Latest stable release: v0.54.0

Released: August 6, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **PR Generation & Antigravity Agent:** Implemented Firestore concurrency
  dual-locking mechanisms in the database and introduced the Antigravity agent
  runner with comprehensive prompt templates.
- **Caretaker Triaging & Issue Security:** Improved the caretaker triage loop to
  post a descriptive comment prior to auto-closing issues, and sanitized issue
  titles within an untrusted context to ensure secure processing.
- **Enhanced Authentication & Security:** Enforced strict HTTPS validation for
  GoogleCredentialsAuthProvider to block cleartext leakage, and implemented tag
  length validation for the file keychain system.
- **Model Fallback & History Filtering:** Resolved stateful API errors by
  rotating session IDs on model fallback, optimized conversation history
  retrieval by filtering out thought parts when context management is disabled,
  and correctly skipped merged function responses when tracking active loops.

## What's Changed

- Changelog for v0.53.0-preview.0 by @gemini-cli-robot in
  [#28507](https://github.com/google-gemini/gemini-cli/pull/28507)
- Changelog for v0.52.0 by @gemini-cli-robot in
  [#28508](https://github.com/google-gemini/gemini-cli/pull/28508)
- chore(release): bump version to 0.54.0-nightly.20260722.gf743ab579 by
  @gemini-cli-robot in
  [#28510](https://github.com/google-gemini/gemini-cli/pull/28510)
- fix(caretaker): sanitize and wrap issue title in untrusted_context by @chadd28
  in [#28352](https://github.com/google-gemini/gemini-cli/pull/28352)
- chore(caretaker): update vitest to v3.2.4 and add package-lock.json files by
  @chadd28 in [#28409](https://github.com/google-gemini/gemini-cli/pull/28409)
- fix(core): rotate session ID on model fallback to prevent stateful API errors
  by @amelidev in
  [#28469](https://github.com/google-gemini/gemini-cli/pull/28469)
- feat(caretaker-triage): post comment before auto-closing issues by @chadd28 in
  [#28411](https://github.com/google-gemini/gemini-cli/pull/28411)
- fix(core): enforce HTTPS for GoogleCredentialsAuthProvider to prevent
  cleartext leakage by @amelidev in
  [#28517](https://github.com/google-gemini/gemini-cli/pull/28517)
- fix(core): filter out thought parts from getHistoryTurns when context
  management is disabled by @DavidAPierce in
  [#28509](https://github.com/google-gemini/gemini-cli/pull/28509)
- fix(a2a-server): normalize CRLF line endings to LF in getProposedContent by
  @luisfelipe-alt in
  [#28531](https://github.com/google-gemini/gemini-cli/pull/28531)
- fix(core): enforce explicit tag length and validation in file keychain by
  @luisfelipe-alt in
  [#28523](https://github.com/google-gemini/gemini-cli/pull/28523)
- chore/release: bump version to 0.54.0-nightly.20260728.gbef611950 by
  @gemini-cli-robot in
  [#28552](https://github.com/google-gemini/gemini-cli/pull/28552)
- feat(pr-generator-db): implement Firestore concurrency dual-locking and test
  ingestion utilities by @joneba-google in
  [#28432](https://github.com/google-gemini/gemini-cli/pull/28432)
- feat(pr-generator-agent): implement Antigravity agent runner and prompt
  templates … by @joneba-google in
  [#28434](https://github.com/google-gemini/gemini-cli/pull/28434)
- fix(core): skip merged function-response turns when finding the active loop by
  @adamfweidman in
  [#28565](https://github.com/google-gemini/gemini-cli/pull/28565)
- fix(patch): cherry-pick f47d6c6 to release/v0.54.0-preview.0-pr-28566 to patch
  version v0.54.0-preview.0 and create version 0.54.0-preview.1 by
  @gemini-cli-robot in
  [#28609](https://github.com/google-gemini/gemini-cli/pull/28609)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.53.1...v0.54.0
