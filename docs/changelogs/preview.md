# Preview release: v0.62.0-preview.0

Released: September 23, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **New Model Support**: Added support for Gemini 3.8 Flash and 3.5 Flash Lite
  models, expanding the selection of available models.
- **MCP Tool Call Formatting**: Improved Model Context Protocol (ACP/MCP)
  interactions by formatting tool call titles as structured signatures and
  separating explanations.
- **PTY & Process Lifecycle Hardening**: Hardened Pseudo-Terminal (PTY)
  execution, improving file descriptor cleanup, exit synchronization on ConPTY,
  and finalization of terminal output.
- **Memory & Reliability Refinements**: Refined terminal buffer memory
  management, preserved OAuth refresh tokens during credential refresh, and
  added layout dimension guarding in the UI border rendering.

## What's Changed

- fix(a2a-server): add early return on unsupported store in tasks metadata
  endpoint by @jesussamuel-byte in
  [#29334](https://github.com/google-gemini/gemini-cli/pull/29334)
- Changelog for v0.61.0-preview.0 by @gemini-cli-robot in
  [#29344](https://github.com/google-gemini/gemini-cli/pull/29344)
- Changelog for v0.60.0 by @gemini-cli-robot in
  [#29345](https://github.com/google-gemini/gemini-cli/pull/29345)
- fix(core,acp): format MCP tool call titles as structured signatures and
  segregate explanations by @jvargassanchez-dot in
  [#29341](https://github.com/google-gemini/gemini-cli/pull/29341)
- chore(release): bump version to 0.62.0-nightly.20260915.gae28844fb by
  @gemini-cli-robot in
  [#29346](https://github.com/google-gemini/gemini-cli/pull/29346)
- fix(core): retain oauth refresh token on refresh and make credential deletion
  idempotent by @villahernandez-coder in
  [#29339](https://github.com/google-gemini/gemini-cli/pull/29339)
- fix(ui): guard against negative layout dimensions in border rendering by
  @diegogodinezr in
  [#29347](https://github.com/google-gemini/gemini-cli/pull/29347)
- test(integration): deflake run_shell_command and file-system-interactive tests
  by @DavidAPierce in
  [#29185](https://github.com/google-gemini/gemini-cli/pull/29185)
- fix(core): improve PTY file descriptor cleanup and execution lifecycle
  management by @jesussamuel-byte in
  [#29340](https://github.com/google-gemini/gemini-cli/pull/29340)
- chore/release: bump version to 0.62.0-nightly.20260918.g9450ade79 by
  @gemini-cli-robot in
  [#29383](https://github.com/google-gemini/gemini-cli/pull/29383)
- fix(core): synchronize ConPTY process exit lifecycle and harden PTY output
  finalization by @jvargassanchez-dot in
  [#29379](https://github.com/google-gemini/gemini-cli/pull/29379)
- fix(cli): suppress uncaught AbortError logs during request cancellation by
  @urielefrenvirtusa in
  [#29343](https://github.com/google-gemini/gemini-cli/pull/29343)
- fix(core,cli): improve terminal buffer memory management and format Windows
  diagnostic paths by @jesussamuel-byte in
  [#29380](https://github.com/google-gemini/gemini-cli/pull/29380)
- fix(vscode-ide-companion): preserve terminal focus when closing diff tabs by
  @amelidev in [#29378](https://github.com/google-gemini/gemini-cli/pull/29378)
- fix(core): update auth error documentation link to valid anchor and add
  fallback (#26140) by @villahernandez-coder in
  [#29377](https://github.com/google-gemini/gemini-cli/pull/29377)
- fix(core): normalize proxy-agent esbuild interop for environment proxy
  resolution by @diegogodinezr in
  [#29401](https://github.com/google-gemini/gemini-cli/pull/29401)
- fix(cli): emit tool_call update prior to request_permission in ACP mode by
  @urielefrenvirtusa in
  [#29439](https://github.com/google-gemini/gemini-cli/pull/29439)
- Feat/gemini 3.8 flash 3.5 flash lite by @DavidAPierce in
  [#29443](https://github.com/google-gemini/gemini-cli/pull/29443)
- Check for vsc integration test presence when attempting to run. by
  @DavidAPierce in
  [#29462](https://github.com/google-gemini/gemini-cli/pull/29462)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.61.0-preview.1...v0.62.0-preview.0
