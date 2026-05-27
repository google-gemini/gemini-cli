# Preview release: v0.45.0-preview.0

Released: May 27, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Context Simplification:** Completed major architectural work to simplify and
  optimize how the agent manages and processes session context.
- **A2A Usage Metadata:** The Agent-to-Agent (A2A) interface now exposes
  detailed usage metadata, providing better visibility into resource
  consumption.
- **Improved Routing:** Updated default auto-routing logic and added bypasses
  for certain routing classifiers to prevent orphaned function response errors.
- **Terminal Stability:** Fixed several issues affecting terminal environments,
  including Termux relaunch loops and PTY resize errors.
- **Security & Fixes:** Strengthened MCP list security and addressed issues with
  session resumption and PTY environment signals.

## What's Changed

- chore(release): bump version to 0.45.0-nightly.20260521.g854f811be by
  @gemini-cli-robot in
  [#27362](https://github.com/google-gemini/gemini-cli/pull/27362)
- fix(cli): prevent Termux relaunch and resize remount loops by @saymanq in
  [#27110](https://github.com/google-gemini/gemini-cli/pull/27110)
- Feat/a2a expose usage metadata by @jvargassanchez-dot in
  [#27288](https://github.com/google-gemini/gemini-cli/pull/27288)
- feat(context): Complete simplification work. by @joshualitt in
  [#27345](https://github.com/google-gemini/gemini-cli/pull/27345)
- fix(core): force update_topic tool to execute sequentially by
  @jvargassanchez-dot in
  [#27357](https://github.com/google-gemini/gemini-cli/pull/27357)
- Changelog for v0.44.0-preview.0 by @gemini-cli-robot in
  [#27360](https://github.com/google-gemini/gemini-cli/pull/27360)
- Changelog for v0.43.0 by @gemini-cli-robot in
  [#27361](https://github.com/google-gemini/gemini-cli/pull/27361)
- Revert "fix(core): prevent SIGHUP kills in PTY environments" by @bbiggs in
  [#27401](https://github.com/google-gemini/gemini-cli/pull/27401)
- fix(cli): filter internal session context from history during resumption by
  @rmedranollamas in
  [#27391](https://github.com/google-gemini/gemini-cli/pull/27391)
- Update default auto routing by @DavidAPierce in
  [#27071](https://github.com/google-gemini/gemini-cli/pull/27071)
- fix(core): bypass routing classifiers to prevent orphaned function response
  errors by @danielweis in
  [#27389](https://github.com/google-gemini/gemini-cli/pull/27389)
- fix(core): suppress PTY resize EBADF errors by @scidomino in
  [#27461](https://github.com/google-gemini/gemini-cli/pull/27461)
- fix(core): prevent blacklist bypass in mcp list by @ompatel-aiml in
  [#27377](https://github.com/google-gemini/gemini-cli/pull/27377)
- fix(cli): ignore unmapped vim normal keys by @MukundaKatta in
  [#27102](https://github.com/google-gemini/gemini-cli/pull/27102)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.44.0-preview.0...v0.45.0-preview.0
