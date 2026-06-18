# Preview release: v0.47.0-preview.0

Released: June 10, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Model Mapping & Upgrades:** Integrated support for Gemini 3.5 Flash in
  auto-mode when enabled, and resolved model mapping issues for Vertex AI.
- **Antigravity CLI Support:** Introduced documentation, migration commands, and
  transition banner updates to streamline migration to the Antigravity CLI.
- **Core Stability Enhancements:** Added an EBUSY fallback and TOML parse
  recovery for policy management, implemented atomic updates for MCP tool
  discovery, and prevented the persistence of empty resume sessions.
- **Browser Agent Documentation:** Removed experimental text from the browser
  agent documentation to reflect its current readiness.

## What's Changed

- chore(release): bump version to 0.47.0-nightly.20260602.gcfcecebe8 by
  @gemini-cli-robot in
  [#27644](https://github.com/google-gemini/gemini-cli/pull/27644)
- Changelog for v0.46.0-preview.0 by @gemini-cli-robot in
  [#27641](https://github.com/google-gemini/gemini-cli/pull/27641)
- Respect backend definitions for 3.5 flash and Update auto mode to use 3.5
  flash when the flag is enabled. by @DavidAPierce in
  [#27645](https://github.com/google-gemini/gemini-cli/pull/27645)
- fix(policy): add EBUSY fallback and TOML parse recovery (#19919) by @krishdef7
  in [#21541](https://github.com/google-gemini/gemini-cli/pull/21541)
- Changelog for v0.45.0 by @gemini-cli-robot in
  [#27642](https://github.com/google-gemini/gemini-cli/pull/27642)
- update the max amount of times the Antigravity transition banner can be
  displayed. by @DavidAPierce in
  [#27676](https://github.com/google-gemini/gemini-cli/pull/27676)
- chore: remove experimental text from browser agent docs by @gsquared94 in
  [#27746](https://github.com/google-gemini/gemini-cli/pull/27746)
- fix(core): implement atomic update in MCP tool discovery by @luisfelipe-alt in
  [#27619](https://github.com/google-gemini/gemini-cli/pull/27619)
- Vertex ai model mapping fix by @DavidAPierce in
  [#27749](https://github.com/google-gemini/gemini-cli/pull/27749)
- Add documentation and migration commands for Antigravity CLI by @DavidAPierce
  in [#27765](https://github.com/google-gemini/gemini-cli/pull/27765)
- Avoid persisting empty resume sessions by @SandyTao520 in
  [#27770](https://github.com/google-gemini/gemini-cli/pull/27770)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.46.0-preview.3...v0.47.0-preview.0
