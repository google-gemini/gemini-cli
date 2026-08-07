# Preview release: v0.55.0-preview.1

Released: August 06, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Antigravity Agent & PR Generator:** Integrated the Antigravity agent runner,
  Firestore dual-locking for concurrency, prompt templates, and ingestion
  testing utilities.
- **Caretaker Triage & Issue Management:** Enhanced the issue triage workflow by
  automatically posting a comment before closing issues, and sanitizing and
  wrapping issue titles in `untrusted_context`.
- **Core API & Session Stability:** Enforced HTTPS for
  GoogleCredentialsAuthProvider to prevent cleartext leakage, rotated session
  IDs on model fallback to prevent stateful API errors, and refined chat history
  by filtering out thought parts when context management is disabled.

## What's Changed

- chore(release): bump version to 0.55.0-nightly.20260728.gd29268d36 by
  @gemini-cli-robot in
  [#28569](https://github.com/google-gemini/gemini-cli/pull/28569)
- Changelog for v0.54.0-preview.0 by @gemini-cli-robot in
  [#28567](https://github.com/google-gemini/gemini-cli/pull/28567)
- Changelog for v0.53.0 by @gemini-cli-robot in
  [#28568](https://github.com/google-gemini/gemini-cli/pull/28568)
- chore/release: bump version to 0.55.0-nightly.20260729.g3499c84f7 by
  @gemini-cli-robot in
  [#28573](https://github.com/google-gemini/gemini-cli/pull/28573)
- fix(core): classify capacity exhaustion as terminal to prevent retry hangs by
  @luisfelipe-alt in
  [#28599](https://github.com/google-gemini/gemini-cli/pull/28599)
- fix(core,cli): propagate InvalidStreamError details to UI for specific empty
  response guidance by @DavidAPierce in
  [#28566](https://github.com/google-gemini/gemini-cli/pull/28566)
- fix(cli): fall back to embedded macOS seatbelt profiles if missing by
  @amelidev in [#28551](https://github.com/google-gemini/gemini-cli/pull/28551)
- feat(pr-generator-core): add environment config parser, command executor,
  GitHub R… by @joneba-google in
  [#28435](https://github.com/google-gemini/gemini-cli/pull/28435)
- feat(pr-generator-orchestrator): implement iterative bug-fixing state machine
  and container worker entrypoint by @joneba-google in
  [#28433](https://github.com/google-gemini/gemini-cli/pull/28433)
- feat(pr-generator-infra): configure Cloud Run job, Workflows definition, and
  Dockerfile by @joneba-google in
  [#28431](https://github.com/google-gemini/gemini-cli/pull/28431)
- fix(release): handle npm dist-tag deletion failures on registries that forbid
  it by @DavidAPierce in
  [#28694](https://github.com/google-gemini/gemini-cli/pull/28694)
- fix(core): stop a new user message fusing into an unanswered tool response by
  @adamfweidman in
  [#28700](https://github.com/google-gemini/gemini-cli/pull/28700)
- fix(core,cli): repair /compress session reload and quota-fallback tool
  response loss by @adamfweidman in
  [#28672](https://github.com/google-gemini/gemini-cli/pull/28672)
- fix(core): preserve functionCall thoughtSignature when stripping thought parts
  by @sarbojitrana in
  [#28607](https://github.com/google-gemini/gemini-cli/pull/28607)
- fix(core): unwrap and parse nested gaxios streaming errors from cause message
  by @luisfelipe-alt in
  [#28689](https://github.com/google-gemini/gemini-cli/pull/28689)
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

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.53.0-preview.0...v0.55.0-preview.1
