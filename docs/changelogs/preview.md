# Preview release: v0.61.0-preview.0

Released: September 15, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Sandbox Isolation**: Enhanced filesystem boundaries and isolated runtime
  state within the sandbox environments to restrict untrusted execution.
- **Prompt Injection Defense**: Prevented potential indirect prompt injection
  vulnerabilities related to build file modifications and untrusted command
  flags.
- **Flash Model ID Preservation**: Fixed core logic to properly preserve
  explicit, versioned Flash model IDs without overriding them.
- **Agent Loop Reliability**: Resolved an issue where crucial `AgentLoopContext`
  properties were discarded during object spread, stabilizing the main agent
  loop.

## What's Changed

- Changelog for v0.60.0-preview.0 by @gemini-cli-robot in
  [#29251](https://github.com/google-gemini/gemini-cli/pull/29251)
- chore(release): bump version to 0.61.0-nightly.20260908.gc647533d6 by
  @gemini-cli-robot in
  [#29254](https://github.com/google-gemini/gemini-cli/pull/29254)
- Changelog for v0.59.0 by @gemini-cli-robot in
  [#29253](https://github.com/google-gemini/gemini-cli/pull/29253)
- fix(core): preserve explicit versioned Flash model IDs by @SandyTao520 in
  [#29252](https://github.com/google-gemini/gemini-cli/pull/29252)
- fix(core): prevent indirect prompt injection via build file modifications and
  untrusted flags by @villahernandez-coder in
  [#29250](https://github.com/google-gemini/gemini-cli/pull/29250)
- fix(sandbox): harden filesystem boundaries and isolate runtime state by
  @diegogodinezr in
  [#29214](https://github.com/google-gemini/gemini-cli/pull/29214)
- fix(core): ensure AgentLoopContext properties are preserved across object
  spread by @diegogodinezr in
  [#29335](https://github.com/google-gemini/gemini-cli/pull/29335)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.60.0-preview.0...v0.61.0-preview.0
