# Preview release: v0.67.0-preview.0

Released: October 27, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Model Discovery Command & Flag**: Added a new `models` command and
  `--list-models` flag for model discovery directly from the CLI.
- **Container Sandbox IDE Bridging**: Bridged the IDE companion into container
  sandboxes over exec stdio to improve IDE integration in containerized
  environments.
- **Cancellation & Signal Resilience**: Improved termination signal and
  cancellation handling by stopping continuation stream processing, halting
  auto-nudges, and preventing subsequent tool execution in non-interactive mode.
- **Terminal Rendering & Unicode Support**: Refined character width calculation
  for terminals rendering ambiguous-width characters and corrected display width
  for Thai and Lao SARA AM scripts.
- **Filesystem & Security Safeguards**: Hardened atomic file writing to respect
  read-only files and hard links, resolved relative file paths against the
  active IDE workspace root, scoped untrusted flag checks to external output,
  and included MCP server and tool metadata in permission requests.

## What's Changed

- Changelog for v0.65.0 by @gemini-cli-robot in
  [#29853](https://github.com/google-gemini/gemini-cli/pull/29853)
- chore(release): bump version to 0.67.0-nightly.20261020.gb041de017 by
  @gemini-cli-robot in
  [#29854](https://github.com/google-gemini/gemini-cli/pull/29854)
- Changelog for v0.66.0-preview.0 by @gemini-cli-robot in
  [#29852](https://github.com/google-gemini/gemini-cli/pull/29852)
- feat(cli): bridge the IDE companion into container sandboxes over exec stdio
  by @elberthc-byte in
  [#29858](https://github.com/google-gemini/gemini-cli/pull/29858)
- fix(core): prevent duplicate agent loading when workspace is home directory
  (#27692) by @urielefrenvirtusa in
  [#29847](https://github.com/google-gemini/gemini-cli/pull/29847)
- fix(ide): exclude IDE settings and GEMINI.md files from open file con text by
  @villahernandez-coder in
  [#29848](https://github.com/google-gemini/gemini-cli/pull/29848)
- fix(core): scope untrusted flag checks to external output and remember
  approved flags by @luisfelipe-alt in
  [#29833](https://github.com/google-gemini/gemini-cli/pull/29833)
- fix(a2a-server): mount express.json() before A2A SDK route registration by
  @jesussamuel-byte in
  [#29850](https://github.com/google-gemini/gemini-cli/pull/29850)
- fix(core): adhere to RFC 9110 token rules when splitting custom headers by
  @diegogodinezr in
  [#29865](https://github.com/google-gemini/gemini-cli/pull/29865)
- fix(core): respect read-only files and hard links in atomic writeTextFile by
  @elberthc-byte in
  [#29749](https://github.com/google-gemini/gemini-cli/pull/29749)
- fix(a2a-server,core): preserve extended token usage metadata and align
  per-turn reporting by @jvargassanchez-dot in
  [#29834](https://github.com/google-gemini/gemini-cli/pull/29834)
- fix(core): ensure all model turns with function calls receive thought
  signatures by @amelidev in
  [#29828](https://github.com/google-gemini/gemini-cli/pull/29828)
- fix(cli): handle termination signals and prevent tool execution after
  cancellation in non-interactive mode by @urielefrenvirtusa in
  [#29849](https://github.com/google-gemini/gemini-cli/pull/29849)
- fix(cli): preserve ${VAR} placeholders during deprecated settings migration by
  @villahernandez-coder in
  [#29867](https://github.com/google-gemini/gemini-cli/pull/29867)
- fix(cli): stop continuation stream processing and auto-nudge after request
  cancellation by @jesussamuel-byte in
  [#29868](https://github.com/google-gemini/gemini-cli/pull/29868)
- fix(cli): correct Thai and Lao SARA AM display width by @elberthc-byte in
  [#29883](https://github.com/google-gemini/gemini-cli/pull/29883)
- fix(core): resolve relative file paths against active IDE workspace root by
  @villahernandez-coder in
  [#29838](https://github.com/google-gemini/gemini-cli/pull/29838)
- feat(cli): add models command and --list-models flag for model discovery by
  @urielefrenvirtusa in
  [#29880](https://github.com/google-gemini/gemini-cli/pull/29880)
- fix(cli): convert Claude hook timeout from seconds to milliseconds during
  migration by @villahernandez-coder in
  [#29899](https://github.com/google-gemini/gemini-cli/pull/29899)
- fix(core): classify project spending cap errors as terminal quota errors by
  @jesussamuel-byte in
  [#29961](https://github.com/google-gemini/gemini-cli/pull/29961)
- fix(acp): include MCP server and tool metadata in permission requests by
  @duvanka-prasad in
  [#29910](https://github.com/google-gemini/gemini-cli/pull/29910)
- fix(cli): prevent parent command name insertion on /chat list autocomplete by
  @urielefrenvirtusa in
  [#29967](https://github.com/google-gemini/gemini-cli/pull/29967)
- fix(cli): validate finite numbers in numeric settings editor by @diegogodinezr
  in [#29968](https://github.com/google-gemini/gemini-cli/pull/29968)
- fix(core): allow trusted system paths on Android (Termux) for ripgrep
  resolution (#21836) by @amelidev in
  [#29884](https://github.com/google-gemini/gemini-cli/pull/29884)
- fix(core): normalize CRLF line endings before diffing in getDiffContextSnippet
  by @jesussamuel-byte in
  [#29966](https://github.com/google-gemini/gemini-cli/pull/29966)
- fix(cli): handle terminals that render ambiguous-width characters as wide by
  @elberthc-byte in
  [#29905](https://github.com/google-gemini/gemini-cli/pull/29905)
- fix(cli): prevent duplicate history and double telemetry in confirm_action
  flow by @duvanka-prasad in
  [#29974](https://github.com/google-gemini/gemini-cli/pull/29974)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.66.0-preview.0...v0.67.0-preview.0
