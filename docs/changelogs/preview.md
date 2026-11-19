# Preview release: v0.71.0-preview.0

Released: November 19, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Asynchronous PowerShell Parsing**: Parsed PowerShell commands asynchronously
  across the core and CLI engines to prevent UI spinner freezes and ensure
  smooth terminal responsiveness on Windows.
- **Command Parse Caching**: Introduced a lifecycle-scoped shell parse cache
  (`CommandParseCache`) to eliminate redundant parser subprocess spawns across
  policy evaluation, security checks, and tool confirmations.
- **Turn Activity and Redirection Handling**: Updated turn activity monitoring
  to resolve PowerShell redirections asynchronously, avoiding UI thread blocking
  during interactive shell operations.
- **Development Worker Infrastructure**: Updated cloud build automation to
  publish development worker container images to a private artifact registry.

## What's Changed

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
https://github.com/google-gemini/gemini-cli/compare/v0.70.0-preview.0...v0.71.0-preview.0
