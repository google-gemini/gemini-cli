# Preview release: v0.66.0-preview.0

Released: October 20, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Terminal UI & Output Synchronization**: Implemented synchronized terminal
  output and isolated spinner rendering to prevent flickering, preserved
  terminal scrollback during viewport refreshes, corrected debug console height
  calculations, and eliminated right-hand border bleed in scrollable tool
  containers.
- **Tool Execution & Scheduler Architecture**: Refactored the tool execution
  flow to emit tool call groups directly from the scheduler, removing UI
  lookahead logic and simplifying execution scheduling.
- **Shell & Git Environment Integrity**: Preserved user-level `~/.gitconfig`
  settings across shell and Git environments, disabled interactive credential
  and SSH prompts to prevent hangs in automated environments, and forwarded
  termination signals from bootstrap parent processes.
- **Configuration & Keybindings Flexibility**: Added support for a `keys` array
  in `keybindings.json`, ensured settings placeholders resolve correctly after
  loading `.env` files, and improved CLI self-update verification against PATH
  shadowing.
- **Networking & MCP Security**: Supported opt-in private network endpoints for
  MCP OAuth flows and prevented false positive matches in authentication error
  handling.

## What's Changed

- Update ROADMAP.md to no longer reference outdated 2025 roadmap by
  @DavidAPierce in
  [#29723](https://github.com/google-gemini/gemini-cli/pull/29723)
- Changelog for v0.65.0-preview.0 by @gemini-cli-robot in
  [#29739](https://github.com/google-gemini/gemini-cli/pull/29739)
- chore(release): bump version to 0.66.0-nightly.20261013.g204db94ae by
  @gemini-cli-robot in
  [#29740](https://github.com/google-gemini/gemini-cli/pull/29740)
- Changelog for v0.64.0 by @gemini-cli-robot in
  [#29741](https://github.com/google-gemini/gemini-cli/pull/29741)
- fix(ui): implement synchronized output and isolate spinner rendering by
  @diegogodinezr in
  [#29725](https://github.com/google-gemini/gemini-cli/pull/29725)
- fix(ui): fix debug console height calculation and terminalBuffer flickering by
  @ugorla-dev in
  [#29695](https://github.com/google-gemini/gemini-cli/pull/29695)
- fix(cli): prevent right-hand border bleed in scrollable tool containers by
  @villahernandez-coder in
  [#29742](https://github.com/google-gemini/gemini-cli/pull/29742)
- refactor(core,cli): emit tool call groups from the scheduler and drop the UI
  lookahead by @jesussamuel-byte in
  [#29736](https://github.com/google-gemini/gemini-cli/pull/29736)
- fix(core): format and quote Windows diff command arguments in openDiff by
  @jvargassanchez-dot in
  [#29753](https://github.com/google-gemini/gemini-cli/pull/29753)
- fix(cli): round before selecting units in formatDuration by @diegogodinezr in
  [#29766](https://github.com/google-gemini/gemini-cli/pull/29766)
- fix(core): disable interactive credential and SSH prompts in getSafeGitEnv by
  @villahernandez-coder in
  [#29760](https://github.com/google-gemini/gemini-cli/pull/29760)
- fix(cli): resolve settings placeholders after loading .env files by
  @elberthc-byte in
  [#29750](https://github.com/google-gemini/gemini-cli/pull/29750)
- fix(core): harden SKILL.md frontmatter parsing for single-line descriptions by
  @jesussamuel-byte in
  [#29769](https://github.com/google-gemini/gemini-cli/pull/29769)
- Add Banner about Gemini CLI not being optimized for Gemini 4 by @srithreepo in
  [#29774](https://github.com/google-gemini/gemini-cli/pull/29774)
- Update README to remove obsolete content by @srithreepo in
  [#29775](https://github.com/google-gemini/gemini-cli/pull/29775)
- fix(ci): remove unsupported members permission in unassign-inactive-assignees
  workflow by @ugorla-dev in
  [#29770](https://github.com/google-gemini/gemini-cli/pull/29770)
- fix(cli): reset slash-command conflict dedupe when conflicts reappear by
  @jvargassanchez-dot in
  [#29768](https://github.com/google-gemini/gemini-cli/pull/29768)
- fix(cli): verify active binary update to prevent PATH shadowing false success
  by @urielefrenvirtusa in
  [#29757](https://github.com/google-gemini/gemini-cli/pull/29757)
- fix(cli): support 'keys' array in keybindings.json by @urielefrenvirtusa in
  [#29773](https://github.com/google-gemini/gemini-cli/pull/29773)
- fix(cli): forward termination signals from bootstrap parent to child process
  by @villahernandez-coder in
  [#29790](https://github.com/google-gemini/gemini-cli/pull/29790)
- fix(ui): preserve terminal scrollback during viewport refreshes by
  @diegogodinezr in
  [#29792](https://github.com/google-gemini/gemini-cli/pull/29792)
- fix(cli): decode streamed Node HTTP activity chunks with StringDecoder by
  @jesussamuel-byte in
  [#29827](https://github.com/google-gemini/gemini-cli/pull/29827)
- chore: migrate gsutil usage to gcloud storage by @gurusai-voleti in
  [#29839](https://github.com/google-gemini/gemini-cli/pull/29839)
- fix(core): preserve user-level ~/.gitconfig in shell and git environments by
  @jesussamuel-byte in
  [#29832](https://github.com/google-gemini/gemini-cli/pull/29832)
- fix(core): prevent false positive matches in isAuthenticationError by
  @urielefrenvirtusa in
  [#29835](https://github.com/google-gemini/gemini-cli/pull/29835)
- fix(core): support opt-in private network endpoints for MCP OAuth flows by
  @luisfelipe-alt in
  [#29844](https://github.com/google-gemini/gemini-cli/pull/29844)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.65.0-preview.0...v0.66.0-preview.0
