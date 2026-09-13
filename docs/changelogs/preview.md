# Preview release: v0.60.0-preview.0

Released: September 8, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Workspace and Path Safety**: Enhanced path boundary checks, symlink
  resolution, and mitigation of NTFS 8.3 short name (SFN) bypasses in command
  safety and file discovery.
- **Sandbox Isolation**: Isolated settings directories within sandbox containers
  and temporary directories for macOS Seatbelt sandbox to restrict access.
- **Extension Loader Hardening**: Hardened path resolution and boundary
  validation in extension loader, with new consent prompts for runtime
  environment changes.
- **Network and OAuth Security**: Improved destination validation and connection
  routing in web fetch utilities, and enforced RFC 9207 issuer identification in
  the MCP OAuth flow.
- **Tool Output Provenance**: Enforced envelope metadata provenance for
  untrusted tool outputs to guarantee integrity.

## What's Changed

- fix(core): improve destination validation and connection routing in web fetch
  utilities by @diegogodinezr in
  [#29120](https://github.com/google-gemini/gemini-cli/pull/29120)
- fix(core): enforce RFC 9207 issuer identification in MCP OAuth flow by
  @jvargassanchez-dot in
  [#29117](https://github.com/google-gemini/gemini-cli/pull/29117)
- chore(release): bump version to 0.60.0-nightly.20260901.g0bd1d4397 by
  @gemini-cli-robot in
  [#29162](https://github.com/google-gemini/gemini-cli/pull/29162)
- Changelog for v0.58.0 by @gemini-cli-robot in
  [#29161](https://github.com/google-gemini/gemini-cli/pull/29161)
- fix(cli): isolate temporary directory for macOS Seatbelt sandbox by
  @jvargassanchez-dot in
  [#29171](https://github.com/google-gemini/gemini-cli/pull/29171)
- feat(extensions): harden path resolution and boundary validation in extension
  loader by @diegogodinezr in
  [#29169](https://github.com/google-gemini/gemini-cli/pull/29169)
- Changelog for v0.59.0-preview.0 by @gemini-cli-robot in
  [#29159](https://github.com/google-gemini/gemini-cli/pull/29159)
- fix(core): sanitize and remove hardcoded Google CrUX API key in
  chrome-devtools-mcp by @amelidev in
  [#29158](https://github.com/google-gemini/gemini-cli/pull/29158)
- fix(extensions): prompt for consent on environment changes and sanitize
  runtime-altering environment variables by @amelidev in
  [#28863](https://github.com/google-gemini/gemini-cli/pull/28863)
- fix(core): enhance workspace path boundary checks and symlink resolution in
  command safety and file discovery by @jesussamuel-byte in
  [#29170](https://github.com/google-gemini/gemini-cli/pull/29170)
- fix(config): enforce strict permission and ownership checks on system-wide
  configuration paths by @jesussamuel-byte in
  [#29115](https://github.com/google-gemini/gemini-cli/pull/29115)
- fix(core): mitigate NTFS 8.3 short name (SFN) path by @urielefrenvirtusa in
  [#29116](https://github.com/google-gemini/gemini-cli/pull/29116)
- fix(cli): isolate settings directory in sandbox containers by
  @jvargassanchez-dot in
  [#29216](https://github.com/google-gemini/gemini-cli/pull/29216)
- fix(core): enforce envelope metadata provenance for untrusted tool outputs by
  @luisfelipe-alt in
  [#29215](https://github.com/google-gemini/gemini-cli/pull/29215)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.59.0-preview.0...v0.60.0-preview.0
