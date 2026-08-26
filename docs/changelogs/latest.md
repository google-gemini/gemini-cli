# Latest stable release: v0.55.1

Released: August 11, 2026

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

- fix/verify release npm ci ignore scripts by @rmedranollamas in
  [#28116](https://github.com/google-gemini/gemini-cli/pull/28116)
- fix(ci): prevent workspace binary shadowing in release verification by
  @galdawave in [#28132](https://github.com/google-gemini/gemini-cli/pull/28132)
- Feat/tool registry discovery by @ved015 in
  [#28113](https://github.com/google-gemini/gemini-cli/pull/28113)
- fix(ci): prevent bad NPM releases and promote job crashes by @galdawave in
  [#28147](https://github.com/google-gemini/gemini-cli/pull/28147)
- Changelog for v0.50.0-preview.1 by @gemini-cli-robot in
  [#28150](https://github.com/google-gemini/gemini-cli/pull/28150)
- Fix no_proxy test by @jerrylin3321 in
  [#28131](https://github.com/google-gemini/gemini-cli/pull/28131)
- chore(release): bump version to 0.51.0-nightly.20260625.g3fbf93e26 by
  @gemini-cli-robot in
  [#28151](https://github.com/google-gemini/gemini-cli/pull/28151)
- Vertex base url update by @DavidAPierce in
  [#28145](https://github.com/google-gemini/gemini-cli/pull/28145)
- fix(security): enforce case-insensitive sensitive path blocklist and vscode
  hitl by @luisfelipe-alt in
  [#27966](https://github.com/google-gemini/gemini-cli/pull/27966)
- fix(core-tools): resolve defensive path resolution for at-reference files and
  fix macOS tests by @luisfelipe-alt in
  [#28053](https://github.com/google-gemini/gemini-cli/pull/28053)
- feat(caretaker): implement Cloud Run webhook ingestion service by @chadd28 in
  [#28015](https://github.com/google-gemini/gemini-cli/pull/28015)
- fix(core): resolve symbolic link directory escape in memory import processor
  by @luisfelipe-alt in
  [#28233](https://github.com/google-gemini/gemini-cli/pull/28233)
- feat(caretaker): egress cloud run service skeleton by @chadd28 in
  [#28167](https://github.com/google-gemini/gemini-cli/pull/28167)
- fix(sandbox): make ~/.gitconfig read-only in the macOS sandbox by
  @ompatel-aiml in
  [#28221](https://github.com/google-gemini/gemini-cli/pull/28221)
- fix(core): preserve escape sequences in string literals for modern models by
  @luisfelipe-alt in
  [#28299](https://github.com/google-gemini/gemini-cli/pull/28299)
- fix(core): strip thoughts from scrubbed history turns and resolve thought
  leakage by @amelidev in
  [#27971](https://github.com/google-gemini/gemini-cli/pull/27971)
- Refactor: exclude transient CI configuration files from workspace context by
  @DavidAPierce in
  [#28216](https://github.com/google-gemini/gemini-cli/pull/28216)
- feat(caretaker-triage): add triage worker core foundational modules by
  @chadd28 in [#28163](https://github.com/google-gemini/gemini-cli/pull/28163)
- feat(caretaker-egress): implement octokit github action handler for egress
  service by @chadd28 in
  [#28303](https://github.com/google-gemini/gemini-cli/pull/28303)
- chore(release): bump version to 0.52.0-nightly.20260707.g27a3da3e8 by
  @gemini-cli-robot in
  [#28323](https://github.com/google-gemini/gemini-cli/pull/28323)
- Changelog for v0.51.0-preview.0 by @gemini-cli-robot in
  [#28320](https://github.com/google-gemini/gemini-cli/pull/28320)
- Changelog for v0.50.0 by @gemini-cli-robot in
  [#28322](https://github.com/google-gemini/gemini-cli/pull/28322)
- fix(core-tools): bypass LLM correction for JSON and IPYNB files in write_file
  and replace by @amelidev in
  [#28223](https://github.com/google-gemini/gemini-cli/pull/28223)
- fix(core): use unambiguous previous intent label in fallback summary by
  @amelidev in [#28343](https://github.com/google-gemini/gemini-cli/pull/28343)
- feat(caretaker-triage): implement main worker execution loop and egress action
  publisher by @chadd28 in
  [#28306](https://github.com/google-gemini/gemini-cli/pull/28306)
- fix(privacy): show a clear message when the account has no Code Assist tier by
  @ompatel-aiml in
  [#28304](https://github.com/google-gemini/gemini-cli/pull/28304)
- fix(core): enrich shared project quota limit errors with setup hint by
  @amelidev in [#28391](https://github.com/google-gemini/gemini-cli/pull/28391)
- fix(a2a-server): ensure task cancellation aborts execution loop by
  @luisfelipe-alt in
  [#28316](https://github.com/google-gemini/gemini-cli/pull/28316)
- fix(core): simplify plan mode write policy to support relative paths by
  @DavidAPierce in
  [#28398](https://github.com/google-gemini/gemini-cli/pull/28398)
- feat(core): Bump node google-auth-library version to 10.9.0 by @jerrylin3321
  in [#28385](https://github.com/google-gemini/gemini-cli/pull/28385)
- chore/release: bump version to 0.52.0-nightly.20260715.gfa975395b by
  @gemini-cli-robot in
  [#28402](https://github.com/google-gemini/gemini-cli/pull/28402)
- fix(core,a2a): group cancelled tool responses and coalesce consecutive roles
  to prevent 400 Bad Request by @luisfelipe-alt in
  [#28407](https://github.com/google-gemini/gemini-cli/pull/28407)
- feat(caretaker-triage): implement LLM triage orchestrator and container build
  by @chadd28 in
  [#28345](https://github.com/google-gemini/gemini-cli/pull/28345)
- refactor(cli): align macOS permissive Seatbelt profiles with deny-default
  model by @ompatel-aiml in
  [#28424](https://github.com/google-gemini/gemini-cli/pull/28424)
- fix(core): mitigate infinite ReAct loops and prompt injection loops by
  @amelidev in [#28429](https://github.com/google-gemini/gemini-cli/pull/28429)
- fix(a2a-server): enforce workspace trust and task isolation to prevent RCE by
  @luisfelipe-alt in
  [#28470](https://github.com/google-gemini/gemini-cli/pull/28470)
- fix(core): sequentially verify cached credentials and restore
  GOOGLE_APPLICATION_CREDENTIALS fallback by @luisfelipe-alt in
  [#28472](https://github.com/google-gemini/gemini-cli/pull/28472)
- feat(evals): add eval coverage report command by @ved015 in
  [#28169](https://github.com/google-gemini/gemini-cli/pull/28169)
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
- fix(core): dynamically resolve Cloud Workstations proxy redirect URI for OAuth
  flows by @amelidev in
  [#28688](https://github.com/google-gemini/gemini-cli/pull/28688)
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
https://github.com/google-gemini/gemini-cli/compare/v0.53.1...v0.55.1
