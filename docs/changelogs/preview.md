# Preview release: v0.58.0-preview.0

Released: August 25, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Sandbox Security Enhancements**: Isolated Docker and container runtime
  sockets and binaries in macOS Seatbelt to improve sandbox safety.
- **Core Path Resolution Fixes**: Ensured consistent symlink evaluation in
  ignore path handling within core services.
- **History & Retry Optimizations**: Enhanced history rollback and optimized
  retry nudges for smoother session management.
- **A2A Server Resilience**: Cleared stale cancellation errors on new message
  turns to prevent incorrect error states.
- **Write Policy & Safety Improvements**: Declared top-level safety checkers in
  the write policy configuration to strengthen execution guardrails.

## What's Changed

- Changelog for v0.57.0-preview.0 by @gemini-cli-robot in
  [#28918](https://github.com/google-gemini/gemini-cli/pull/28918)
- fix(core): ensure consistent symlink evaluation in ignore path handling by
  @luisfelipe-alt in
  [#28915](https://github.com/google-gemini/gemini-cli/pull/28915)
- refactor(core): remove eslint-disable and type-asserts from
  shellExecutionService by @DavidAPierce in
  [#28862](https://github.com/google-gemini/gemini-cli/pull/28862)
- fix(sandbox): isolate Docker and container runtime sockets and binaries in
  macOS Seatbelt by @josebalius in
  [#28935](https://github.com/google-gemini/gemini-cli/pull/28935)
- fix(a2a-server): clear stale cancellation error on new message turns by
  @amelidev in [#28940](https://github.com/google-gemini/gemini-cli/pull/28940)
- fix(core): declare top-level safety checkers in write policy configuration by
  @luisfelipe-alt in
  [#28961](https://github.com/google-gemini/gemini-cli/pull/28961)
- (FIX) history rollback and retry nudge optimizations by @DavidAPierce in
  [#28934](https://github.com/google-gemini/gemini-cli/pull/28934)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.57.0-preview.1...v0.58.0-preview.0
