# Preview release: v0.64.0-preview.1

Released: October 9, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Atomic File Operations & State Recovery**: Serialized file tool operations
  with atomic writes and introduced atomic CLI state persistence with automatic
  recovery from backup on corruption.
- **Chat Recording Optimization**: Implemented append-only delta patching and
  bounded history windowing in ChatRecordingService to optimize memory and disk
  efficiency during long-running sessions.
- **CLI Input & Reference Resolution**: Added support for resolving `@file:line`
  references, resolved CPU hangs and quote swallowing on `@` symbols within code
  blocks, and prevented ghost text wrap hangs.
- **Terminal UI & Interaction Stability**: Ensured Ctrl+C emergency aborts reach
  active cancellation handlers, made selection list confirmation with Enter and
  Spacebar reliable, and fixed Windows ConPTY IME cursor forwarding.

## What's Changed

- fix(patch): cherry-pick 2ce1a69 to release/v0.64.0-preview.0-pr-29672 to patch
  version v0.64.0-preview.0 and create version 0.64.0-preview.1 by
  @gemini-cli-robot in
  [#29696](https://github.com/google-gemini/gemini-cli/pull/29696)
- refactor(a2a-server): implement V1 to V2 settings migration logic by
  @jvargassanchez-dot in
  [#29450](https://github.com/google-gemini/gemini-cli/pull/29450)
- fix(acp): bridge PromptResponse.usage and emit usage_update notifications
  (#29389) by @elberthc-byte in
  [#29549](https://github.com/google-gemini/gemini-cli/pull/29549)
- Changelog for v0.63.0-preview.0 by @gemini-cli-robot in
  [#29565](https://github.com/google-gemini/gemini-cli/pull/29565)
- fix(cli): propagate resolved folder trust state in headless mode (#29031) by
  @amelidev in [#29528](https://github.com/google-gemini/gemini-cli/pull/29528)
- chore(release): bump version to 0.64.0-nightly.20260929.gd75234cae by
  @gemini-cli-robot in
  [#29567](https://github.com/google-gemini/gemini-cli/pull/29567)
- fix(cli): prevent CPU hang and quote swallowing on @ within code (#29434) by
  @elberthc-byte in
  [#29557](https://github.com/google-gemini/gemini-cli/pull/29557)
- fix(core): serialize file tool operations and make writes atomic (#29078) by
  @elberthc-byte in
  [#29499](https://github.com/google-gemini/gemini-cli/pull/29499)
- fix(core): implement append-only delta patching and bounded history windowing
  in ChatRecordingService by @jvargassanchez-dot in
  [#29568](https://github.com/google-gemini/gemini-cli/pull/29568)
- fix(cli): persist state atomically and recover from backup on corruption by
  @urielefrenvirtusa in
  [#29558](https://github.com/google-gemini/gemini-cli/pull/29558)
- fix(cli): ensure Ctrl+C emergency abort reaches cancellation handler during
  active operations by @urielefrenvirtusa in
  [#29586](https://github.com/google-gemini/gemini-cli/pull/29586)
- fix(cli): resolve @file:line references and prevent ghost text wrap hang by
  @jesussamuel-byte in
  [#29581](https://github.com/google-gemini/gemini-cli/pull/29581)
- fix(ui): ensure Windows ConPTY forwards IME cursor position by
  @jesussamuel-byte in
  [#29560](https://github.com/google-gemini/gemini-cli/pull/29560)
- fix(cli): retry directory removal on Windows locking errors during extension
  updates by @jesussamuel-byte in
  [#29540](https://github.com/google-gemini/gemini-cli/pull/29540)
- fix(acp): resolve session by exact id and handle listener cleanup on session
  failure by @diegogodinezr in
  [#29580](https://github.com/google-gemini/gemini-cli/pull/29580)
- fix(cli): preserve scroll position and partition pending height budget by
  @luisfelipe-alt in
  [#29520](https://github.com/google-gemini/gemini-cli/pull/29520)
- fix(cli): ensure Enter and Spacebar reliably confirm selection list options by
  @ugorla-dev in
  [#29502](https://github.com/google-gemini/gemini-cli/pull/29502)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.63.0-preview.0...v0.64.0-preview.1
