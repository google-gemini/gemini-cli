# Latest stable release: v0.46.0

Released: June 10, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Model GA Transition:** Transitioned to the Gemini Flash GA model to improve
  default model routing.
- **Terminal Crash Hardening:** Hardened PTY resize operations to prevent native
  terminal crashes, improving stability across different terminal environments.
- **Robust Editor Handling:** Prevented execution spam loops in the CLI when an
  invalid `preferredEditor` configuration is specified.
- **CI Workflow Optimizations:** Introduced optimized pull request size
  labeling, batch workflows, and secure write access for fork repository
  contributions.

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
- fix(patch): cherry-pick e4315b3 to release/v0.46.0-preview.0-pr-27645 to patch
  version v0.46.0-preview.0 and create version 0.46.0-preview.1 by
  @gemini-cli-robot in
  [#27655](https://github.com/google-gemini/gemini-cli/pull/27655)
- fix(patch): cherry-pick f40498d to release/v0.46.0-preview.1-pr-27676 to patch
  version v0.46.0-preview.1 and create version 0.46.0-preview.2 by
  @gemini-cli-robot in
  [#27699](https://github.com/google-gemini/gemini-cli/pull/27699)
- fix(patch): cherry-pick f08b4af to release/v0.46.0-preview.2-pr-27749 to patch
  version v0.46.0-preview.2 and create version 0.46.0-preview.3 by
  @gemini-cli-robot in
  [#27768](https://github.com/google-gemini/gemini-cli/pull/27768)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.45.3...v0.46.0
