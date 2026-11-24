# Latest stable release: v0.71.1

Released: November 24, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Asynchronous PowerShell Parsing**: Executed PowerShell command parsing
  asynchronously off the main UI loop, eliminating spinner freezes and keeping
  terminal rendering responsive during shell command inspection.
- **Shell Parse Caching**: Introduced lifecycle-scoped AST parse caching across
  policy evaluation, confirmation building, and execution to eliminate redundant
  external shell process spawns.
- **Worker Image Deployment**: Configured development worker container images to
  push to private Google Cloud Artifact Registry repositories to enhance build
  infrastructure security and reliability.

## What's Changed

- fix(patch): cherry-pick aafdfdf to release/v0.71.0-pr-30420 to patch version
  v0.71.0 and create version 0.71.1 by @gemini-cli-robot in
  [#30429](https://github.com/google-gemini/gemini-cli/pull/30429)
- Changelog for v0.70.0-preview.0 by @gemini-cli-robot in
  [#30361](https://github.com/google-gemini/gemini-cli/pull/30361)
- chore(release): bump version to 0.71.0-nightly.20261118.g615d6bc8c by
  @gemini-cli-robot in
  [#30366](https://github.com/google-gemini/gemini-cli/pull/30366)
- Changelog for v0.69.0 by @gemini-cli-robot in
  [#30365](https://github.com/google-gemini/gemini-cli/pull/30365)
- fix(core,cli): parse PowerShell commands asynchronously to prevent UI spinner
  freeze by @tadipavan in
  [#30334](https://github.com/google-gemini/gemini-cli/pull/30334)
- chore(gcp): push development worker to private artifact registry by
  @DavidAPierce in
  [#30319](https://github.com/google-gemini/gemini-cli/pull/30319)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.70.0...v0.71.1
