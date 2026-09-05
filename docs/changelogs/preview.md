# Preview release: v0.59.0-preview.0

Released: September 1, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **MCP Security Enhancements**: Prevented Server-Side Request Forgery (SSRF) in
  Model Context Protocol (MCP) OAuth metadata discovery and authentication.
- **Restricted Mode Strengthening**: Enforced fail-closed workspace trust and
  implemented filtering for MCP servers when running in restricted mode.

## What's Changed

- Changelog for v0.58.0-preview.0 by @gemini-cli-robot in
  [#29082](https://github.com/google-gemini/gemini-cli/pull/29082)
- chore(release): bump version to 0.59.0-nightly.20260825.g812f7a2bc by
  @gemini-cli-robot in
  [#29083](https://github.com/google-gemini/gemini-cli/pull/29083)
- fix(core): prevent SSRF in MCP OAuth metadata discovery and authentication by
  @josebalius in
  [#29081](https://github.com/google-gemini/gemini-cli/pull/29081)
- fix(core): enforce fail-closed workspace trust and filter mcpServers in
  restricted mode by @luisfelipe-alt in
  [#29099](https://github.com/google-gemini/gemini-cli/pull/29099)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.58.0-preview.0...v0.59.0-preview.0
