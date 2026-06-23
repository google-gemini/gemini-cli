# Preview release: v0.48.0-preview.0

Released: June 17, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **GDC Service Identity Support**: Added support for GDC air-gapped Service
  Identity after a major auth library update.
- **Standardised Tool Outputs**: Standardised tool output formatting to ensure
  consistency and readability across different CLI commands.
- **Static Evaluation Analyzer**: Introduced a new static evaluation source
  analyzer to improve development and testing.
- **Vulnerability Prevention**: Hardened CLI security by preventing path
  traversal vulnerabilities during the installation of Skills.
- **Configuration & Error Hardening**: Migrated the `coreTools` configuration
  setting to `tools.core` and ensured zero-quota limits fail fast to prevent
  infinite retry loops.

## What's Changed

- chore(release): bump version to 0.48.0-nightly.20260609.g3a13b8eeb by
  @gemini-cli-robot in
  [#27779](https://github.com/google-gemini/gemini-cli/pull/27779)
- ci(dependabot): enable cooldown period for npm packages by @ruomengz in
  [#27743](https://github.com/google-gemini/gemini-cli/pull/27743)
- refactor(core): standardize tool output formatting by @galz10 in
  [#27772](https://github.com/google-gemini/gemini-cli/pull/27772)
- ci: update workflow logging and policy configurations by @galz10 in
  [#27853](https://github.com/google-gemini/gemini-cli/pull/27853)
- fix(core): Ensure zero-quota limits fail fast to prevent retry loop hang by
  @luisfelipe-alt in
  [#27698](https://github.com/google-gemini/gemini-cli/pull/27698)
- fix(core): handle multi-line escaped quotes in stripShellWrapper by
  @sanchezcoraspe in
  [#27467](https://github.com/google-gemini/gemini-cli/pull/27467)
- fix(cli): prevent path traversal vulnerabilities during skill install… by
  @ompatel-aiml in
  [#27767](https://github.com/google-gemini/gemini-cli/pull/27767)
- Fix/pending tools and trust overrides by @jvargassanchez-dot in
  [#27854](https://github.com/google-gemini/gemini-cli/pull/27854)
- ci: use internal environment for scheduled nightly releases (#27865) by
  @rmedranollamas in
  [#27939](https://github.com/google-gemini/gemini-cli/pull/27939)
- feat(core): Support GDC air-gapped Service Identity after auth library update
  by @sidhantgoyal-droid in
  [#27956](https://github.com/google-gemini/gemini-cli/pull/27956)
- fix(cli): handle tmux false positive background detection by @amelidev in
  [#27572](https://github.com/google-gemini/gemini-cli/pull/27572)
- Add static eval source analyzer by @ved015 in
  [#27631](https://github.com/google-gemini/gemini-cli/pull/27631)
- fix(config): migrate coreTools setting to tools.core by @galz10 in
  [#27947](https://github.com/google-gemini/gemini-cli/pull/27947)
- fix(core-tools): resolve defensive path resolution for at-reference files by
  @luisfelipe-alt in
  [#27943](https://github.com/google-gemini/gemini-cli/pull/27943)
- Revert "fix(core-tools): resolve defensive path resolution for at-reference
  files" by @galz10 in
  [#27992](https://github.com/google-gemini/gemini-cli/pull/27992)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.47.0-preview.0...v0.48.0-preview.0
