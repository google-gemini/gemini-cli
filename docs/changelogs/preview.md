# Preview release: v0.57.0-preview.0

Released: August 19, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **TUI & UX Enhancements**: Prevented indefinite TUI hangs by adding execution
  timeouts, improved autocomplete suggestions with trailing spaces, forced
  terminal buffer rerenders when exiting external editors, and clarified privacy
  notice selection options.
- **Improved Evals & Testing**: Added a new tool call formatter and integrated
  failure summaries into evals, improving visibility and test validation.
- **Core Reliability & Resilience**: Implemented context-aware silent retries
  and availability TTL for capacity errors, rolled back entire multi-turn
  requests on cancellation or abort, and dynamically resolved Cloud Workstations
  proxy redirect URIs for OAuth flows.
- **Sub-agent & Guardrail Fixes**: Formatted the `cli_help` subagent output as
  Markdown, prevented subagents from running when agents mode is disabled, and
  resolved a subagent handoff token regression on startup.

## What's Changed

- fix(core): dynamically resolve Cloud Workstations proxy redirect URI for OAuth
  flows by @amelidev in
  [#28688](https://github.com/google-gemini/gemini-cli/pull/28688)
- fix(core): resolve swallowed directory mismatch in IDE connections by
  @amelidev in [#28729](https://github.com/google-gemini/gemini-cli/pull/28729)
- Feat/eval validate by @ved015 in
  [#28344](https://github.com/google-gemini/gemini-cli/pull/28344)
- feat(evals): add tool call formatter and integrate failure summaries by
  @ved015 in [#28305](https://github.com/google-gemini/gemini-cli/pull/28305)
- Changelog for v0.55.1 by @gemini-cli-robot in
  [#28779](https://github.com/google-gemini/gemini-cli/pull/28779)
- test(e2e): stabilize file-system-interactive test on slow runners by
  @DavidAPierce in
  [#28793](https://github.com/google-gemini/gemini-cli/pull/28793)
- fix(core): implement context-aware silent retries and availability TTL for
  capacity errors (#28761) by @DavidAPierce in
  [#28790](https://github.com/google-gemini/gemini-cli/pull/28790)
- fix(core): rollback entire multi-turn request on cancellation or abort by
  @amelidev in [#28801](https://github.com/google-gemini/gemini-cli/pull/28801)
- fix(core): normalize git environment and resolve workspace state mismatch by
  @luisfelipe-alt in
  [#28792](https://github.com/google-gemini/gemini-cli/pull/28792)
- [SSR Agent] Issue Fix (19826): Migrate process.env to vi.stubEnv in a2a-server
  tests by @joneba-google in
  [#28811](https://github.com/google-gemini/gemini-cli/pull/28811)
- [SSR Agent] Issue Fix (21911): Add composite flag to packages/cli tsconfig by
  @joneba-google in
  [#28813](https://github.com/google-gemini/gemini-cli/pull/28813)
- [SSR Agent] Issue Fix (26120): Clarify privacy notice wording and selection
  options by @joneba-google in
  [#28820](https://github.com/google-gemini/gemini-cli/pull/28820)
- [SSR Agent] Issue Fix (21919): Fix TypeScript strict-null errors in
  integration tests by @joneba-google in
  [#28814](https://github.com/google-gemini/gemini-cli/pull/28814)
- [SSR Agent] Issue Fix (21477): Prevent indefinite TUI hang by adding execution
  timeouts by @joneba-google in
  [#28812](https://github.com/google-gemini/gemini-cli/pull/28812)
- [SSR Agent] Issue Fix (19239): Update /clear command docs to include context
  reset by @joneba-google in
  [#28847](https://github.com/google-gemini/gemini-cli/pull/28847)
- [SSR Agent] Issue Fix (24587): Fix misleading admin error for personal
  accounts by @joneba-google in
  [#28819](https://github.com/google-gemini/gemini-cli/pull/28819)
- [SSR Agent] Issue Fix (19463): Format cli_help subagent output as markdown by
  @joneba-google in
  [#28864](https://github.com/google-gemini/gemini-cli/pull/28864)
- [SSR Agent] Issue Fix (28050): Add Vertex AI locations documentation link by
  @joneba-google in
  [#28865](https://github.com/google-gemini/gemini-cli/pull/28865)
- [SSR Agent] Issue Fix (22093): Prevent subagents from running when agents mode
  is disabled by @joneba-google in
  [#28867](https://github.com/google-gemini/gemini-cli/pull/28867)
- [SSR Agent] Issue Fix (23954): Add trailing space to autocomplete suggestions
  by @joneba-google in
  [#28868](https://github.com/google-gemini/gemini-cli/pull/28868)
- [SSR Agent] Issue Fix (24935): Force terminal buffer rerender after exiting
  external editors by @joneba-google in
  [#28880](https://github.com/google-gemini/gemini-cli/pull/28880)
- [SSR Agent] Issue Fix (28518): Fix sub-agent handoff token regression on
  startup by @joneba-google in
  [#28882](https://github.com/google-gemini/gemini-cli/pull/28882)
- fix(core): preserve empty text turns with tools or media by @DavidAPierce in
  [#28892](https://github.com/google-gemini/gemini-cli/pull/28892)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.56.0-preview.1...v0.57.0-preview.0
