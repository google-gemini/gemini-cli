# Latest stable release: v0.47.0

Released: June 18, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Gemini 3.5 Flash Support:** Updated Auto Mode to support Gemini 3.5 Flash
  backend definitions and automatically use Gemini 3.5 Flash when the feature
  flag is enabled.
- **Antigravity CLI Migration:** Added migration commands and comprehensive
  documentation to facilitate the transition to Antigravity CLI, with updates to
  the transition banner visibility limits.
- **Policy Engine Robustness:** Improved policy stability by implementing an
  EBUSY fallback and TOML parsing recovery mechanisms.
- **Atomic MCP Tool Discovery:** Implemented atomic updates during MCP tool
  discovery to ensure stable and race-free tool registration.
- **Session Preservation:** Prevented the CLI from persisting empty resume
  sessions, keeping session storage clean and organized.

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
https://github.com/google-gemini/gemini-cli/compare/v0.46.0...v0.47.0
