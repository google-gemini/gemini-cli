# Latest stable release: v0.50.0

Released: July 08, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Tool Registry Discovery:** Introduced tool registry discovery capabilities,
  enabling automatic detection and registration of tools to improve
  extensibility.
- **Release Verification Improvements:** Enhanced release verification by
  ignoring scripts during `npm ci` and preventing workspace binary shadowing.
- **CI Pipeline Safeguards:** Strengthened the CI pipeline to prevent bad NPM
  releases and ensure promote job failures are correctly surfaced.

## What's Changed

- fix/verify release npm ci ignore scripts by @rmedranollamas in
  [#28116](https://github.com/google-gemini/gemini-cli/pull/28116)
- fix(ci): prevent workspace binary shadowing in release verification by
  @galdawave in [#28132](https://github.com/google-gemini/gemini-cli/pull/28132)
- Feat/tool registry discovery by @ved015 in
  [#28113](https://github.com/google-gemini/gemini-cli/pull/28113)
- fix(ci): prevent bad NPM releases and promote job crashes by @galdawave in
  [#28147](https://github.com/google-gemini/gemini-cli/pull/28147)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.49.0...v0.50.0
