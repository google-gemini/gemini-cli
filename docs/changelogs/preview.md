# Preview release: v0.32.0-preview.0

Released: February 27, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest stable release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Plan Mode Enhancements**: Support for modifying plans in external editors,
  adaptive workflows based on task complexity, and comprehensive integration
  tests.
- **Generalist Agent & Core**: Enabled the generalist agent for broader task
  handling, introduced sub-agent classification with `Kind.Agent`, and
  implemented a new task tracking service.
- **CLI & UX Polish**: Interactive shell autocompletion, parallel loading of
  extensions, and new error verbosity modes (low/full) for cleaner UI reporting.
- **Billing & Security**: Initial support for G1 AI credits overage flow with
  telemetry and updated authentication handshake to meet current specifications.
- **Stability & Performance**: Resolved an issue where orphaned processes could
  consume 100% CPU and improved retry logic for Code Assist API calls.

## What's Changed

- feat(plan): Support for modifying plans in external editors by @jerop in
  [#20348](https://github.com/google-gemini/gemini-cli/pull/20348)
- feat(plan): Adaptive planning workflows based on task complexity by @Adib234
  in [#20465](https://github.com/google-gemini/gemini-cli/pull/20465)
- feat(agent): Enabled the generalist agent by @gsquared94 in
  [#19665](https://github.com/google-gemini/gemini-cli/pull/19665)
- feat(agent): Introduced `Kind.Agent` for sub-agent classification by @jerop in
  [#20369](https://github.com/google-gemini/gemini-cli/pull/20369)
- feat(core): Implemented task tracking foundation and service by @SandyTao520
  in [#19464](https://github.com/google-gemini/gemini-cli/pull/19464)
- feat(cli): Interactive shell autocompletion by @scidomino in
  [#20082](https://github.com/google-gemini/gemini-cli/pull/20082)
- feat(cli): Parallel loading of extensions by @galz10 in
  [#20229](https://github.com/google-gemini/gemini-cli/pull/20229)
- feat(cli): New low/full error verbosity modes for cleaner UI by @sehoon38 in
  [#20399](https://github.com/google-gemini/gemini-cli/pull/20399)
- feat(billing): G1 AI credits overage flow with billing telemetry by
  @abhipatel12 in
  [#18590](https://github.com/google-gemini/gemini-cli/pull/18590)
- feat(security): Updated authentication handshake to specification by @ehedlund
  in [#19725](https://github.com/google-gemini/gemini-cli/pull/19725)
- fix(core): Prevent orphaned processes from consuming 100% CPU by @braddux in
  [#16965](https://github.com/google-gemini/gemini-cli/pull/16965)
- fix(mcp): Reduced intrusive MCP errors and deduplicated diagnostics by
  @NTaylorMullen in
  [#20232](https://github.com/google-gemini/gemini-cli/pull/20232)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.31.0...v0.32.0-preview.0
