# Preview release: v0.51.0-preview.0

Released: July 8, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Caretaker Cloud Run Services**: Implemented a Cloud Run webhook ingestion
  service and egress service skeleton to support advanced caretaker features.
- **Enhanced Security & Sandbox Hardening**: Enforced a case-insensitive
  sensitive path blocklist and VS Code human-in-the-loop (HITL) checks, resolved
  a directory escape vulnerability in the memory import processor, and marked
  `~/.gitconfig` as read-only within the macOS sandbox.
- **Improved Thought Leakage and Escape Handling**: Resolved potential thought
  leakage by stripping thinking/thought processes from scrubbed history turns,
  and ensured escape sequences in string literals are correctly preserved for
  modern models.
- **Robust Path & API Updates**: Enhanced defensive path resolution for
  at-reference files, and updated the Vertex AI base URL configuration to
  support the latest API updates.

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
https://github.com/google-gemini/gemini-cli/compare/v0.50.0-preview.1...v0.51.0-preview.0
