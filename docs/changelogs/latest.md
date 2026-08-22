# Latest stable release: v0.56.0

Released: August 19, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Comprehensive Evaluation Suite:** Added a local report command, developer
  documentation, golden issue collection tools, and a triage evaluation
  framework with a judge runner.
- **Enhanced Issue Triage & Caretaker Automation:** Introduced automated issue
  comment handling, re-triage workflows, Pub/Sub integration for workable spec
  events, and Firestore schema refinements.
- **Robust PR Generation Pipeline:** Configured a complete Cloud Run and
  Workflows infrastructure with an environment configuration parser, command
  executor, iterative bug-fixing state machine, and a Dockerfile.
- **Improved API Resilience & Diagnostics:** Classified capacity exhaustion as
  terminal to avoid infinite retries, resolved quota lookup model mapping,
  correctly parsed nested gaxios streaming errors, and propagated detailed
  InvalidStreamError messages directly to the UI.

## What's Changed

- feat(evals): add local report command and developer documentation by @ved015
  in [#28369](https://github.com/google-gemini/gemini-cli/pull/28369)
- fix(core,cli): resolve false model capacity exhaustion and fix core quota
  lookup model mapping by @DavidAPierce in
  [#28730](https://github.com/google-gemini/gemini-cli/pull/28730)
- fix(core): refresh MCP OAuth tokens with the stored client ID by
  @ParthivNaresh in
  [#28481](https://github.com/google-gemini/gemini-cli/pull/28481)
- fix(caretaker): clear lock on NEEDS_HUMAN transition by @chadd28 in
  [#28601](https://github.com/google-gemini/gemini-cli/pull/28601)
- feat(ingestion): add issue comment handling and re-triage workflow by @chadd28
  in [#28690](https://github.com/google-gemini/gemini-cli/pull/28690)
- feat(caretaker-evals): add Cloud Run job entrypoint for eval runner by
  @chadd28 in [#28727](https://github.com/google-gemini/gemini-cli/pull/28727)
- feat(caretaker): add GCP deployment script for caretaker agent services by
  @chadd28 in [#28529](https://github.com/google-gemini/gemini-cli/pull/28529)
- feat(caretaker): publish workable spec event to ready-for-code Pub/Sub topic
  by @chadd28 in
  [#28588](https://github.com/google-gemini/gemini-cli/pull/28588)
- feat(caretaker-evals): add local golden issue collection and firestore sync
  tools by @chadd28 in
  [#28532](https://github.com/google-gemini/gemini-cli/pull/28532)
- feat(caretaker-evals): add triage evaluation framework and judge runner by
  @chadd28 in [#28530](https://github.com/google-gemini/gemini-cli/pull/28530)
- feat(caretaker): add triage Cloud Run job workflow by @chadd28 in
  [#28468](https://github.com/google-gemini/gemini-cli/pull/28468)
- feat(caretaker-triage): prompt hill-climbing & orchestrator updates by
  @chadd28 in [#28524](https://github.com/google-gemini/gemini-cli/pull/28524)
- feat(caretaker): update Firestore schema with error, and pr_number fields by
  @chadd28 in [#28467](https://github.com/google-gemini/gemini-cli/pull/28467)
- Reclassifying Capacity Exhaustion as Terminal Error by @luisfelipe-alt in
  [#28716](https://github.com/google-gemini/gemini-cli/pull/28716)
- fix(core): unwrap and parse nested gaxios streaming errors from cause message
  by @luisfelipe-alt in
  [#28689](https://github.com/google-gemini/gemini-cli/pull/28689)
- fix(core): preserve functionCall thoughtSignature when stripping thought parts
  by @sarbojitrana in
  [#28607](https://github.com/google-gemini/gemini-cli/pull/28607)
- fix(core,cli): repair /compress session reload and quota-fallback tool
  response loss by @adamfweidman in
  [#28672](https://github.com/google-gemini/gemini-cli/pull/28672)
- fix(core): stop a new user message fusing into an unanswered tool response by
  @adamfweidman in
  [#28700](https://github.com/google-gemini/gemini-cli/pull/28700)
- fix(release): handle npm dist-tag deletion failures on registries that forbid
  it by @DavidAPierce in
  [#28694](https://github.com/google-gemini/gemini-cli/pull/28694)
- feat(pr-generator-infra): configure Cloud Run job, Workflows definition, and
  Dockerfile by @joneba-google in
  [#28431](https://github.com/google-gemini/gemini-cli/pull/28431)
- feat(pr-generator-orchestrator): implement iterative bug-fixing state machine
  and container worker entrypoint by @joneba-google in
  [#28433](https://github.com/google-gemini/gemini-cli/pull/28433)
- feat(pr-generator-core): add environment config parser, command executor,
  GitHub R… by @joneba-google in
  [#28435](https://github.com/google-gemini/gemini-cli/pull/28435)
- fix(cli): fall back to embedded macOS seatbelt profiles if missing by
  @amelidev in [#28551](https://github.com/google-gemini/gemini-cli/pull/28551)
- fix(core,cli): propagate InvalidStreamError details to UI for specific empty
  response guidance by @DavidAPierce in
  [#28566](https://github.com/google-gemini/gemini-cli/pull/28566)
- fix(core): classify capacity exhaustion as terminal to prevent retry hangs by
  @luisfelipe-alt in
  [#28599](https://github.com/google-gemini/gemini-cli/pull/28599)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.55.1...v0.56.0
