# Latest stable release: v0.70.0

Released: November 19, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Policy Engine Hardening**: Evaluated policy regex patterns using `re2js` for
  linear-time matching against ReDoS vulnerabilities, matched `commandPrefix`
  and `commandRegex` rules strictly against top-level command arguments, and
  enforced user confirmation for shell commands with unresolved variable
  expansions.
- **MCP & IDE Security Isolation**: Enforced security permission checks to skip
  system MCP servers with insecure command permissions, isolated IDE companion
  discovery using per-user directories and atomic port file writes, and
  disclosed canonical link targets in consent prompts.
- **Model Listing & Network Resilience**: Accurately reported output token
  limits and initialized authentication capabilities when listing models, and
  dynamically scaled HTTP client body timeouts when request timeouts exceed the
  default 300 seconds.
- **Session & Workspace State Preservation**: Preserved Unicode characters and
  stripped ANSI escape fragments in session previews, maintained selected git
  worktrees across authentication restarts, and safely restored workspace
  directories only upon successful chat resumption.

## What's Changed

- Changelog for v0.69.0-preview.0 by @gemini-cli-robot in
  [#30222](https://github.com/google-gemini/gemini-cli/pull/30222)
- Changelog for v0.68.0 by @gemini-cli-robot in
  [#30224](https://github.com/google-gemini/gemini-cli/pull/30224)
- chore(release): bump version to 0.70.0-nightly.20261110.g1603e9bab by
  @gemini-cli-robot in
  [#30223](https://github.com/google-gemini/gemini-cli/pull/30223)
- test(cli): remove redundant lowercase restart test in
  AdminSettingsChangedDialog by @luisfelipe-alt in
  [#30221](https://github.com/google-gemini/gemini-cli/pull/30221)
- fix(cli): preserve Unicode prompts and strip ANSI fragments in session
  previews (#29915) by @urielefrenvirtusa in
  [#30220](https://github.com/google-gemini/gemini-cli/pull/30220)
- fix(cli): preserve selected worktree across authentication restarts (#30078)
  by @duvanka-prasad in
  [#30176](https://github.com/google-gemini/gemini-cli/pull/30176)
- fix(core): preserve interrupted placeholder after empty model responses to
  tool turns by @tadipavan in
  [#30228](https://github.com/google-gemini/gemini-cli/pull/30228)
- fix(cli): apply default in ${VAR:-default} when variable is set but empty by
  @urielefrenvirtusa in
  [#30250](https://github.com/google-gemini/gemini-cli/pull/30250)
- fix(core): scale undici bodyTimeout when request timeout exceeds 300s default
  by @tadipavan in
  [#30258](https://github.com/google-gemini/gemini-cli/pull/30258)
- fix(core,cli): report accurate output token limits in models list by
  @tadipavan in [#30253](https://github.com/google-gemini/gemini-cli/pull/30253)
- fix(cli): restore workspace directories only after resumeChat succeeds by
  @urielefrenvirtusa in
  [#30259](https://github.com/google-gemini/gemini-cli/pull/30259)
- fix(core,cli): scope foreground retry status to active main prompt and current
  model policy by @tadipavan in
  [#30266](https://github.com/google-gemini/gemini-cli/pull/30266)
- fix(cli): initialize auth capabilities and deduplicate options when listing
  models by @tadipavan in
  [#30271](https://github.com/google-gemini/gemini-cli/pull/30271)
- fix(cli): skip system MCP servers with insecure command permissions by
  @elberthc-byte in
  [#30283](https://github.com/google-gemini/gemini-cli/pull/30283)
- refactor(core): use re2js for linear-time policy argsPattern evaluation by
  @diegogodinezr in
  [#30282](https://github.com/google-gemini/gemini-cli/pull/30282)
- chore(deps): update workspace dependencies and sandbox runtime packages by
  @DavidAPierce in
  [#30321](https://github.com/google-gemini/gemini-cli/pull/30321)
- fix(cli): disclose canonical link path and default consent prompt to no by
  @jvargassanchez-dot in
  [#30289](https://github.com/google-gemini/gemini-cli/pull/30289)
- fix(cli): detect local git clone from CLI path instead of cwd by @tadipavan in
  [#30315](https://github.com/google-gemini/gemini-cli/pull/30315)
- fix(ide): use per-user discovery directory and atomic port file writes by
  @villahernandez-coder in
  [#30340](https://github.com/google-gemini/gemini-cli/pull/30340)
- ci: pre-pull triage image and clear Docker login in dedup workflows by
  @diegogodinezr in
  [#30342](https://github.com/google-gemini/gemini-cli/pull/30342)
- fix(core): keep ASK_USER for shell commands with unresolved expansion by
  @luisfelipe-alt in
  [#30338](https://github.com/google-gemini/gemini-cli/pull/30338)
- fix(core): match commandPrefix and commandRegex rules against the top-level
  command argument by @luisfelipe-alt in
  [#30355](https://github.com/google-gemini/gemini-cli/pull/30355)
- chore(deps): adjust workspace dependency pins and update simple-git by
  @DavidAPierce in
  [#30356](https://github.com/google-gemini/gemini-cli/pull/30356)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.69.0...v0.70.0
