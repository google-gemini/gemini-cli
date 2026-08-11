# Preview release: v0.56.0-preview.1

Released: August 11, 2026

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

- Changelog for v0.55.0-preview.1 by @gemini-cli-robot in
  [#28706](https://github.com/google-gemini/gemini-cli/pull/28706)
- chore(release): bump version to 0.56.0-nightly.20260806.g761f604c1 by
  @gemini-cli-robot in
  [#28707](https://github.com/google-gemini/gemini-cli/pull/28707)
- Changelog for v0.54.0 by @gemini-cli-robot in
  [#28708](https://github.com/google-gemini/gemini-cli/pull/28708)
- Reclassifying Capacity Exhaustion as Terminal Error by @luisfelipe-alt in
  [#28716](https://github.com/google-gemini/gemini-cli/pull/28716)
- feat(caretaker): update Firestore schema with error, and pr_number fields by
  @chadd28 in [#28467](https://github.com/google-gemini/gemini-cli/pull/28467)
- feat(caretaker-triage): prompt hill-climbing & orchestrator updates by
  @chadd28 in [#28524](https://github.com/google-gemini/gemini-cli/pull/28524)
- feat(caretaker): add triage Cloud Run job workflow by @chadd28 in
  [#28468](https://github.com/google-gemini/gemini-cli/pull/28468)
- feat(caretaker-evals): add triage evaluation framework and judge runner by
  @chadd28 in [#28530](https://github.com/google-gemini/gemini-cli/pull/28530)
- feat(caretaker-evals): add local golden issue collection and firestore sync
  tools by @chadd28 in
  [#28532](https://github.com/google-gemini/gemini-cli/pull/28532)
- feat(caretaker): publish workable spec event to ready-for-code Pub/Sub topic
  by @chadd28 in
  [#28588](https://github.com/google-gemini/gemini-cli/pull/28588)
- feat(caretaker): add GCP deployment script for caretaker agent services by
  @chadd28 in [#28529](https://github.com/google-gemini/gemini-cli/pull/28529)
- feat(caretaker-evals): add Cloud Run job entrypoint for eval runner by
  @chadd28 in [#28727](https://github.com/google-gemini/gemini-cli/pull/28727)
- fix(caretaker): clear lock on NEEDS_HUMAN transition by @chadd28 in
  [#28601](https://github.com/google-gemini/gemini-cli/pull/28601)
- feat(ingestion): add issue comment handling and re-triage workflow by @chadd28
  in [#28690](https://github.com/google-gemini/gemini-cli/pull/28690)
- fix(core): refresh MCP OAuth tokens with the stored client ID by
  @ParthivNaresh in
  [#28481](https://github.com/google-gemini/gemini-cli/pull/28481)
- fix(core,cli): resolve false model capacity exhaustion and fix core quota
  lookup model mapping by @DavidAPierce in
  [#28730](https://github.com/google-gemini/gemini-cli/pull/28730)
- feat(evals): add local report command and developer documentation by @ved015
  in [#28369](https://github.com/google-gemini/gemini-cli/pull/28369)
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
https://github.com/google-gemini/gemini-cli/compare/v0.53.0-preview.0...v0.56.0-preview.1
