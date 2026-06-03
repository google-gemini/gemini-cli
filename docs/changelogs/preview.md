# Preview release: v0.46.0-preview.0

Released: June 3, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Model Update:** Added support for transitioning to the Flash GA model when
  the experimental flag is enabled, providing access to the latest model
  improvements.
- **Improved Stability:** Hardened PTY resize logic to prevent native crashes,
  ensuring a more robust terminal experience.
- **Bug Fix:** Resolved an issue where an invalid `preferredEditor`
  configuration could lead to a notification spam loop.
- **CI Enhancements:** Optimized Pull Request labeling and introduced batch
  workflows to improve development efficiency.

## What's Changed

- fix(core): harden PTY resize against native crashes by @scidomino in
  [#27496](https://github.com/google-gemini/gemini-cli/pull/27496)
- Changelog for v0.45.0-preview.0 by @gemini-cli-robot in
  [#27495](https://github.com/google-gemini/gemini-cli/pull/27495)
- Changelog for v0.44.0 by @gemini-cli-robot in
  [#27569](https://github.com/google-gemini/gemini-cli/pull/27569)
- fix(cli): prevent spam loop when preferredEditor is invalid by @Niralisj in
  [#25324](https://github.com/google-gemini/gemini-cli/pull/25324)
- Adding quote by @scidomino in
  [#27571](https://github.com/google-gemini/gemini-cli/pull/27571)
- Transition to flash GA model when experiment flag is present. by @DavidAPierce
  in [#27570](https://github.com/google-gemini/gemini-cli/pull/27570)
- chore(ci): add optimized PR size labeler and batch workflows by @sripasg in
  [#27616](https://github.com/google-gemini/gemini-cli/pull/27616)
- fix(ci): use pull_request_target trigger to grant write access on fork PRs by
  @sripasg in [#27637](https://github.com/google-gemini/gemini-cli/pull/27637)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.45.0-preview.1...v0.46.0-preview.0
