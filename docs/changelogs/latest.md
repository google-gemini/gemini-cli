# Latest stable release: v0.45.0

Released: June 03, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Context Manager Simplification:** Completed a significant refactoring of the
  context management system to improve reliability and architectural clarity.
- **A2A Usage Metadata:** Enhanced the Agent-to-Agent protocol to expose usage
  metadata, enabling more transparent resource monitoring.
- **Terminal & PTY Robustness:** Resolved several critical issues related to
  terminal interactions, including Termux relaunch loops and PTY resize errors.
- **Routing Optimizations:** Updated default auto-routing and bypassed
  classifiers for specific tool responses to prevent orphaned function errors.
- **Tool Execution Control:** Forced the `update_topic` tool to execute
  sequentially, ensuring consistent narrative flow in agent interactions.

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
- fix(patch): cherry-pick bd53951 to release/v0.45.0-preview.0-pr-27496 to patch
  version v0.45.0-preview.0 and create version 0.45.0-preview.1 by
  @gemini-cli-robot in
  [#27535](https://github.com/google-gemini/gemini-cli/pull/27535)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.44.1...v0.45.0
