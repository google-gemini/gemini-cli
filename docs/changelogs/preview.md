# Preview release: v0.69.0-preview.0

Released: November 10, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **CLI Commands and Custom Themes**: Added the `/stats heatmap` subcommand to
  visualize daily token usage, introduced support for standalone `theme.json`
  configuration files for custom themes, and added argument support and
  validation to the `/model` command.
- **Network Resilience and Timeout Controls**: Allowed overriding the 60-second
  API headers timeout across all authentication modes via
  `model.requestTimeoutMs` or `GEMINI_API_HEADERS_TIMEOUT_MS`, prevented silent
  loading hangs on network failures, and capped excessive quota retry delays.
- **Process Lifecycle and Sandbox Safeguards**: Ensured headless aborts
  terminate child processes and preserve signal exit codes, resolved folder
  trust prior to entering the macOS Seatbelt sandbox, closed leaked `/dev/ptmx`
  file descriptors on macOS PTY spawns, and prevented recursive interactive
  sessions in shell mode.
- **Multimodal Data and Memory Management**: Bounded multi-part tool outputs,
  evicted older multimodal inline data, restricted binary asset inlining in
  multi-file reads, and prevented memory retention in PDF inline data and
  telemetry buffers.
- **Session State and Stream Reliability**: Resolved model-turn 400 errors
  during session resume, eliminated main-thread JSONL freezes, prevented
  mid-stream retry text concatenation in ACP, and preserved multimodal tool
  responses while preventing empty signature-only turns.

## What's Changed

- fix(core,cli): preserve literal `$` characters during template placeholder
  replacement by @jesussamuel-byte in
  [#30136](https://github.com/google-gemini/gemini-cli/pull/30136)
- feat(cli): add /stats heatmap subcommand for daily token usage by
  @jvargassanchez-dot in
  [#30135](https://github.com/google-gemini/gemini-cli/pull/30135)
- fix(core): prevent **GCLI_EXPAND_TARGET** env collision in expandEnvVars by
  @villahernandez-coder in
  [#30138](https://github.com/google-gemini/gemini-cli/pull/30138)
- chore(release): bump version to 0.69.0-nightly.20261104.g89e9d25d6 by
  @gemini-cli-robot in
  [#30140](https://github.com/google-gemini/gemini-cli/pull/30140)
- fix(cli): serialize AnsiOutput to text content in ACP tool call updates by
  @diegogodinezr in
  [#30141](https://github.com/google-gemini/gemini-cli/pull/30141)
- Changelog for v0.67.0 by @gemini-cli-robot in
  [#30145](https://github.com/google-gemini/gemini-cli/pull/30145)
- Changelog for v0.68.0-preview.0 by @gemini-cli-robot in
  [#30146](https://github.com/google-gemini/gemini-cli/pull/30146)
- fix(core): fix Windows PowerShell substitution false positives and policy
  handling by @duvanka-prasad in
  [#30110](https://github.com/google-gemini/gemini-cli/pull/30110)
- fix(cli): preserve leading and trailing whitespace in
  @tools/caretaker-agent/cloudrun/triage-worker/Dockerfile references by
  @duvanka-prasad in
  [#30150](https://github.com/google-gemini/gemini-cli/pull/30150)
- fix(core): prevent thoughtSignature-only turns and preserve multimodal tool
  responses by @tadipavan in
  [#30153](https://github.com/google-gemini/gemini-cli/pull/30153)
- fix(cli): wait for piped stdin EOF and avoid destroying process.stdin by
  @villahernandez-coder in
  [#30163](https://github.com/google-gemini/gemini-cli/pull/30163)
- fix(cli): preserve pending tool confirmation when escaping editor selection by
  @jvargassanchez-dot in
  [#30147](https://github.com/google-gemini/gemini-cli/pull/30147)
- feat(cli): support standalone theme.json configuration for custom themes by
  @jesussamuel-byte in
  [#30119](https://github.com/google-gemini/gemini-cli/pull/30119)
- fix(cli): normalize error payloads in headless CLI formatting by
  @jvargassanchez-dot in
  [#30117](https://github.com/google-gemini/gemini-cli/pull/30117)
- fix(core): require path-separator boundary in tildeifyPath by
  @villahernandez-coder in
  [#30124](https://github.com/google-gemini/gemini-cli/pull/30124)
- fix(cli): validate model names and support direct arguments in /model command
  by @jesussamuel-byte in
  [#30137](https://github.com/google-gemini/gemini-cli/pull/30137)
- fix(cli): handle file watcher errors and permit FSEvents in macOS permissive
  sandbox by @diegogodinezr in
  [#30143](https://github.com/google-gemini/gemini-cli/pull/30143)
- fix(core): bound multi-part tool outputs and evict older multimodal inlineData
  by @tadipavan in
  [#30180](https://github.com/google-gemini/gemini-cli/pull/30180)
- fix(vscode): eliminate barrel import bundle bloat and redundant setContext
  calls by @ugorla-dev in
  [#30181](https://github.com/google-gemini/gemini-cli/pull/30181)
- fix(acp): handle mid-stream retries to prevent text concatenation by
  @urielefrenvirtusa in
  [#30165](https://github.com/google-gemini/gemini-cli/pull/30165)
- fix(core,cli): prevent silent multi-minute loading hangs on network failures
  by @villahernandez-coder in
  [#30182](https://github.com/google-gemini/gemini-cli/pull/30182)
- fix(core,cli): prevent terminal model-turn 400s on resume and main-thread
  JSONL freezes by @villahernandez-coder in
  [#30186](https://github.com/google-gemini/gemini-cli/pull/30186)
- fix(core): prevent multi-hour quota retries and notify ACP client on retry
  attempts by @urielefrenvirtusa in
  [#30187](https://github.com/google-gemini/gemini-cli/pull/30187)
- fix(core): close orphan /dev/ptmx master FD leaked on macOS PTY spawn by
  @ugorla-dev in
  [#30184](https://github.com/google-gemini/gemini-cli/pull/30184)
- fix(core,cli): allow overriding 60s API headers timeout across all auth modes
  (`model.requestTimeoutMs` / `GEMINI_API_HEADERS_TIMEOUT_MS`) by
  @jesussamuel-byte in
  [#30183](https://github.com/google-gemini/gemini-cli/pull/30183)
- fix(cli): use isSubpath for theme file home-directory check by @duvanka-prasad
  in [#30160](https://github.com/google-gemini/gemini-cli/pull/30160)
- fix(cli): resolve folder trust before entering the macOS Seatbelt sandbox by
  @diegogodinezr in
  [#30164](https://github.com/google-gemini/gemini-cli/pull/30164)
- fix(cli,core): kill child processes, record cancelled tools, and preserve
  signal exit code on headless abort by @duvanka-prasad in
  [#30204](https://github.com/google-gemini/gemini-cli/pull/30204)
- fix(cli): prevent recursive interactive gemini sessions in shell mode by
  @jvargassanchez-dot in
  [#30185](https://github.com/google-gemini/gemini-cli/pull/30185)
- fix(core): reject MessageBus.request() immediately when publish fails by
  @luisfelipe-alt in
  [#30189](https://github.com/google-gemini/gemini-cli/pull/30189)
- fix(core): ensure read-many-files only inlines explicitly requested binary
  assets (#29045) by @urielefrenvirtusa in
  [#30211](https://github.com/google-gemini/gemini-cli/pull/30211)
- fix(core): recognize TortoiseGitPlink as PuTTY-family SSH client (#29917) by
  @urielefrenvirtusa in
  [#30214](https://github.com/google-gemini/gemini-cli/pull/30214)
- fix(core): prevent PDF inlineData and telemetry buffer memory retention by
  @tadipavan in [#30217](https://github.com/google-gemini/gemini-cli/pull/30217)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.68.0-preview.0...v0.69.0-preview.0
