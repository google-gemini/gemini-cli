# Nightly release: v0.19.0-nightly.20251126.03845198c

Released: November 26, 2025

We have a nightly release cadence that includes the most recent features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the nightly release:

```
npm install -g @google/gemini-cli@nightly
```

## What's changed

- feat(config): add isModelAvailabilityServiceEnabled setting by @adamfweidman
  in https://github.com/google-gemini/gemini-cli/pull/13777
- chore/release: bump version to 0.19.0-nightly.20251125.f6d97d448 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13782
- chore: remove console.error by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13779
- fix: Add $schema property to settings.schema.json by @sacrosanctic in
  https://github.com/google-gemini/gemini-cli/pull/12763
- fix(cli): allow non-GitHub SCP-styled URLs for extension installation by @m0ps
  in https://github.com/google-gemini/gemini-cli/pull/13800
- fix(resume): allow passing a prompt via stdin while resuming using --resume by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13520
- feat(sessions): add /resume slash command to open the session browser by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13621
- docs(sessions): add documentation for chat recording and session management by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13667
- Fix TypeError: "URL.parse is not a function" for Node.js < v22 by @macarronesc
  in https://github.com/google-gemini/gemini-cli/pull/13698
- fallback to flash for TerminalQuota errors by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/13791
- Update Code Wiki README badge by @PatoBeltran in
  https://github.com/google-gemini/gemini-cli/pull/13768

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.19.0-nightly.20251125.f6d97d448...v0.19.0-nightly.20251126.03845198c
