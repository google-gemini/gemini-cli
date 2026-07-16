# Latest stable release: v0.51.0

Released: July 16, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Caretaker Services on Cloud Run:** Implemented the foundational
  infrastructure for Caretaker on Cloud Run, including a webhook ingestion
  service and an egress service skeleton.
- **Security Hardening & Sandbox Improvements:** Strengthened agent security by
  enforcing case-insensitive checks on sensitive path blocklists, fixing
  symbolic link directory escape vulnerabilities in memory imports, and making
  user Git configuration read-only in the macOS sandbox.
- **Model Interaction & Escape Sequences:** Resolved compatibility and parsing
  issues for modern models by ensuring escape sequences are properly preserved
  in string literals.
- **Thought Leakage Mitigation:** Added safeguards to strip thoughts and
  internal reasoning states from scrubbed conversational history turns,
  preventing thought leakage.
- **Robustness & Test Stability:** Improved overall stability by resolving
  defensive pathing issues with at-reference files, updating Vertex base URLs,
  and fixing proxy testing failures.

## What's Changed

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

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.50.0...v0.51.0
