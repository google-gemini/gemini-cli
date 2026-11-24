# Preview release: v0.72.0-preview.0

Released: November 24, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Agent-to-Agent Server Security**: Enforced bearer token authentication and
  request input validation for the Agent-to-Agent server.
- **Session Resumption Improvements**: Updated session recovery to resume the
  most recently active session instead of the most recently started session.
- **Windows Path Expansion**: Added support for expanding Windows home-relative
  paths formatted with tildes and backslashes.
- **File Filtering and Ignore Rules**: Handled nested `.gitignore` negation
  patterns correctly under directory wildcard patterns.

## What's Changed

- Changelog for v0.70.0 by @gemini-cli-robot in
  [#30380](https://github.com/google-gemini/gemini-cli/pull/30380)
- fix(core): handle nested .gitignore negations under dir/** patterns by
  @urielefrenvirtusa in
  [#30370](https://github.com/google-gemini/gemini-cli/pull/30370)
- fix(cli): expand Windows home-relative paths using tilde and backslash by
  @urielefrenvirtusa in
  [#30376](https://github.com/google-gemini/gemini-cli/pull/30376)
- fix(cli): resume most recently active session instead of most recently started
  by @urielefrenvirtusa in
  [#30389](https://github.com/google-gemini/gemini-cli/pull/30389)
- fix(a2a-server): enforce bearer token authentication and request input
  validation by @diegogodinezr in
  [#30420](https://github.com/google-gemini/gemini-cli/pull/30420)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.71.0-preview.0...v0.72.0-preview.0
