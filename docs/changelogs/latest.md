# Latest stable release: v0.58.0

Released: September 1, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Sandbox Security Isolation:** Isolated Docker and container runtime sockets
  and binaries in macOS Seatbelt to restrict unauthorized container execution
  access.
- **Ignore Path Symlink Evaluation:** Enforced consistent symlink evaluation in
  ignore path handling to prevent path bypass.
- **Policy Configuration & Safety:** Declared top-level safety checkers in write
  policy configuration for comprehensive safety validation.
- **History Rollback & Retry Nudge:** Optimized history rollback mechanics and
  retry nudge flows for more robust conversational recovery.
- **Agent-to-Agent Stability:** Resolved stale cancellation errors on new
  message turns in the Agent-to-Agent server to improve turn recovery.

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
https://github.com/google-gemini/gemini-cli/compare/v0.57.0...v0.58.0
