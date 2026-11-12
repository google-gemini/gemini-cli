# Latest stable release: v0.68.0

Released: November 10, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Extension Validation Command**: Added an extension validation command and
  evaluation tests to verify extension configurations, along with serialized
  per-extension locking to prevent race conditions during concurrent installs.
- **Rate Limit Visibility & Countdown**: Surfaced HTTP 429 rate limit cool-down
  status and active countdown timers directly in the CLI loading indicator.
- **Model State & Dynamic Resolution**: Preserved user-selected models across
  transient fallbacks, cancellations, and rewinds, while ensuring proper dynamic
  resolution for dotted Gemini 3 models and Gemini 2.5 Flash.
- **Hooks System Enhancements**: Supported SubagentStop event mapping and merged
  hook definitions across configurations.
- **Cross-Platform & Sandbox Reliability**: Enabled `--userns=keep-id` for
  rootless Podman sandboxes, improved Windows process lookup and libuv file stat
  handling, and canonically resolved symlinks in glob file searches.

## What's Changed

- Changelog for v0.67.0-preview.0 by @gemini-cli-robot in
  [#29990](https://github.com/google-gemini/gemini-cli/pull/29990)
- Changelog for v0.66.0 by @gemini-cli-robot in
  [#29992](https://github.com/google-gemini/gemini-cli/pull/29992)
- docs(readme): clarify Gemini CLI scope, limitations, and tool landscape by
  @LyalinDotCom in
  [#29995](https://github.com/google-gemini/gemini-cli/pull/29995)
- fix(cli): bound inline history re-render after terminal width changes by
  @jvargassanchez-dot in
  [#29904](https://github.com/google-gemini/gemini-cli/pull/29904)
- fix(ui): handle surrogate pairs when truncating in sanitizeForDisplay by
  @diegogodinezr in
  [#29993](https://github.com/google-gemini/gemini-cli/pull/29993)
- fix(core): make isWithinRoot case-insensitive on Windows by @duvanka-prasad in
  [#29999](https://github.com/google-gemini/gemini-cli/pull/29999)
- fix(core): recognize dotted Gemini 3 models in
  supportsMultimodalFunctionResponse by @jesussamuel-byte in
  [#29982](https://github.com/google-gemini/gemini-cli/pull/29982)
- feat(cli): add extension validation command and evaluation tests by @tadipavan
  in [#29980](https://github.com/google-gemini/gemini-cli/pull/29980)
- fix(core): normalize leading slashes in file search query for @ autocomplete
  by @urielefrenvirtusa in
  [#29987](https://github.com/google-gemini/gemini-cli/pull/29987)
- fix(vscode-ide-companion): register all extension disposables in
  context.subscriptions by @jvargassanchez-dot in
  [#29994](https://github.com/google-gemini/gemini-cli/pull/29994)
- fix(core): list Auto in /model when dynamicModelConfiguration is enabled and
  preview access is disabled by @villahernandez-coder in
  [#29998](https://github.com/google-gemini/gemini-cli/pull/29998)
- fix(core,cli): fix instances of incorrect \n escape behavior by @ugorla-dev in
  [#29989](https://github.com/google-gemini/gemini-cli/pull/29989)
- fix(core): use PowerShell CIM fallback for Windows IDE process lookup by
  @tadipavan in [#30006](https://github.com/google-gemini/gemini-cli/pull/30006)
- fix(cli): surface 429 rate limit cool-down and countdown in loading indicator
  by @urielefrenvirtusa in
  [#30012](https://github.com/google-gemini/gemini-cli/pull/30012)
- fix(cli): anchor .git suffix removal to end of repo URL by @diegogodinezr in
  [#30013](https://github.com/google-gemini/gemini-cli/pull/30013)
- fix(ci,sdk): run SDK tests in PR CI and fix AgentLoopContext mock in
  session.test.ts by @duvanka-prasad in
  [#30023](https://github.com/google-gemini/gemini-cli/pull/30023)
- fix(core): prevent $-pattern corruption in LLM prompt templates by
  @duvanka-prasad in
  [#30035](https://github.com/google-gemini/gemini-cli/pull/30035)
- fix(cli): Fixes unexpected truncation and toggle behavior in Expandab… by
  @tadipavan in [#29965](https://github.com/google-gemini/gemini-cli/pull/29965)
- refactor(cli): decouple ToolGroupMessage from internal type guards and payload
  structures by @ugorla-dev in
  [#30041](https://github.com/google-gemini/gemini-cli/pull/30041)
- fix(core): gate background log stream initialization on execution lifecycle
  transition by @jesussamuel-byte in
  [#30031](https://github.com/google-gemini/gemini-cli/pull/30031)
- fix(core): honor .git/info/exclude and core.excludesFile in shadow repo by
  @urielefrenvirtusa in
  [#30034](https://github.com/google-gemini/gemini-cli/pull/30034)
- fix(core): flush pending SSE event buffer at stream EOF in CodeAssistServer by
  @tadipavan in [#30050](https://github.com/google-gemini/gemini-cli/pull/30050)
- fix(core): handle Windows libuv zero-device stat reporting in
  readSecureFileBuffer by @jvargassanchez-dot in
  [#30044](https://github.com/google-gemini/gemini-cli/pull/30044)
- fix(cli): serialize concurrent extension installs with per-extension lock
  (#29036) by @diegogodinezr in
  [#30039](https://github.com/google-gemini/gemini-cli/pull/30039)
- fix(core): resolve symlinked paths canonically in GlobTool by @ugorla-dev in
  [#30042](https://github.com/google-gemini/gemini-cli/pull/30042)
- fix(cli): add missing active and focus keys to custom theme ui schema by
  @villahernandez-coder in
  [#30032](https://github.com/google-gemini/gemini-cli/pull/30032)
- fix(core,cli): preserve selected model across transient fallback, cancel, and
  rewind by @villahernandez-coder in
  [#30059](https://github.com/google-gemini/gemini-cli/pull/30059)
- fix(core): prevent interrupted Whisper model downloads from being treated as
  installed by @tadipavan in
  [#30058](https://github.com/google-gemini/gemini-cli/pull/30058)
- fix(cli): handle stream failures during extension release downloads by
  @duvanka-prasad in
  [#30100](https://github.com/google-gemini/gemini-cli/pull/30100)
- fix(core): preserve explicit gemini-2.5-flash model in dynamic model
  resolution by @jesussamuel-byte in
  [#30057](https://github.com/google-gemini/gemini-cli/pull/30057)
- fix(hooks): support SubagentStop event mapping and merge hook definitions by
  @diegogodinezr in
  [#30111](https://github.com/google-gemini/gemini-cli/pull/30111)
- fix(cli): await history replay before responding to ACP session/load by
  @tadipavan in [#30112](https://github.com/google-gemini/gemini-cli/pull/30112)
- fix(sandbox): supply --userns=keep-id for rootless podman by @diegogodinezr in
  [#30118](https://github.com/google-gemini/gemini-cli/pull/30118)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.67.0...v0.68.0
