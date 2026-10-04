# Preview release: v0.63.0-preview.0

Released: September 29, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Autonomous Plan Execution**: Enabled autonomous plan execution in
  non-interactive mode, allowing automated agent workflows to run multi-step
  plans without requiring interactive user confirmation.
- **Memory Lifecycle & Output Bounding**: Bounded tool output sizes and
  optimized the memory lifecycle in long-running agent loops to prevent memory
  leaks, while ensuring full output formatting when truncation is disabled.
- **Authentication Resilience**: Prevented infinite authentication loops caused
  by file contention, headless keyring environments, and supervisor state drops,
  ensuring reliable credential handling across environments.
- **CLI & Connection Recovery UX**: Displayed a retry progress indicator during
  connection recovery, restored paused stdin after capability detection, and
  ensured automatic temporary directory cleanup upon background shell execution
  exit.

## What's Changed

- fix(cli): display retry progress indicator during connection recovery (#28340)
  by @amelidev in
  [#29468](https://github.com/google-gemini/gemini-cli/pull/29468)
- Changelog for v0.61.0-preview.1 by @gemini-cli-robot in
  [#29469](https://github.com/google-gemini/gemini-cli/pull/29469)
- Changelog for v0.61.0 by @gemini-cli-robot in
  [#29472](https://github.com/google-gemini/gemini-cli/pull/29472)
- fix(cli): distinguish missing MCP enablement config from malformed JSON by
  @jesussamuel-byte in
  [#29446](https://github.com/google-gemini/gemini-cli/pull/29446)
- fix(cli): restore paused stdin after capability detection by @ugorla-dev in
  [#29487](https://github.com/google-gemini/gemini-cli/pull/29487)
- fix(core): bound tool output size and optimize memory lifecycle in
  long-running agent loops by @diegogodinezr in
  [#29451](https://github.com/google-gemini/gemini-cli/pull/29451)
- fix(core): remove invalid diff.external override by @urielefrenvirtusa in
  [#29467](https://github.com/google-gemini/gemini-cli/pull/29467)
- chore(release): bump version to 0.63.0-nightly.20260923.gf50ba8608 by
  @gemini-cli-robot in
  [#29471](https://github.com/google-gemini/gemini-cli/pull/29471)
- Changelog for v0.62.0-preview.0 by @gemini-cli-robot in
  [#29470](https://github.com/google-gemini/gemini-cli/pull/29470)
- fix(core): clean up temporary directory when background shell execution exits
  by @jesussamuel-byte in
  [#29437](https://github.com/google-gemini/gemini-cli/pull/29437)
- fix(acp): resolve session before config initialization and avoid same-minute
  filename collisions by @jesussamuel-byte in
  [#29463](https://github.com/google-gemini/gemini-cli/pull/29463)
- fix(core): align policy redirection gates, path validation, and workflow
  parsing by @DavidAPierce in
  [#29506](https://github.com/google-gemini/gemini-cli/pull/29506)
- fix(auth): prevent infinite auth loop from file contention, headless keyring,
  and supervisor state drops (#28341) by @villahernandez-coder in
  [#29448](https://github.com/google-gemini/gemini-cli/pull/29448)
- fix(core): enable autonomous plan execution in non-interactive mode by
  @urielefrenvirtusa in
  [#29539](https://github.com/google-gemini/gemini-cli/pull/29539)
- fix(core): disable truncation when maxChars <= 0 in formatTruncatedToolOutput
  by @diegogodinezr in
  [#29542](https://github.com/google-gemini/gemini-cli/pull/29542)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.62.0-preview.0...v0.63.0-preview.0
