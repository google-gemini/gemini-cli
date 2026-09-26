# Latest stable release: v0.61.0

Released: September 23, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Prompt Injection Defense:** Enhanced security by preventing indirect prompt
  injection attacks through build file modifications and untrusted command
  flags.
- **Sandbox & State Hardening:** Hardened filesystem boundaries and isolated
  internal runtime state to ensure more secure execution environments.
- **Agent Loop Robustness:** Guaranteed that internal state properties within
  `AgentLoopContext` are fully preserved during object spread operations,
  improving agent reliability.
- **Versioned Model Preserves:** Ensured explicit versioned Flash model IDs are
  correctly preserved and used directly during routing and execution.

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
- fix(patch): cherry-pick 62364cb to release/v0.61.0-preview.0-pr-29443 to patch
  version v0.61.0-preview.0 and create version 0.61.0-preview.1 by
  @gemini-cli-robot in
  [#29455](https://github.com/google-gemini/gemini-cli/pull/29455)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.60.0...v0.61.0
