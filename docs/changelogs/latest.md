# Latest stable release: v0.59.0

Released: September 8, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **SSRF Prevention in MCP OAuth:** Prevented Server-Side Request Forgery (SSRF)
  in Model Context Protocol (MCP) OAuth metadata discovery and authentication to
  secure remote integrations.
- **Fail-Closed Workspace Trust:** Enforced a fail-closed workspace trust model
  to ensure security by default when accessing untrusted workspaces.
- **Restricted Mode MCP Filtering:** Filtered available Model Context Protocol
  (MCP) servers under restricted execution modes to minimize potential attack
  surfaces.

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
https://github.com/google-gemini/gemini-cli/compare/v0.58.0...v0.59.0
