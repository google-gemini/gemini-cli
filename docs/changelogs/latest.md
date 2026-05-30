# Latest stable release: v0.44.0

Released: May 27, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Unified Auto Mode:** Merged all "Auto" modes into a single, unified Auto
  mode, simplifying the automation workflow and providing a more consistent
  experience across tasks.
- **Expanded Editor Support:** Native support for Sublime Text and Emacs Client
  has been added, giving developers more flexibility in their choice of external
  editors.
- **TUI Automation Skills:** New `agent-tui` and `tui-tester` skills enable the
  programmatic testing and automation of terminal UI (TUI) applications,
  facilitating robust verification of terminal-based tools.
- **Improved UI Performance:** Throttled shell text output and added bounds to
  the live UI buffer to ensure smooth rendering and stability during high-volume
  output sessions.
- **Stabilized Sandbox Environments:** Explicitly clearing entrypoints when
  spawning sandbox containers ensures reliable and consistent environment
  initialization across different Linux distributions.

## What's Changed

- chore(release): bump version to 0.44.0-nightly.20260512.g022e8baef by
  @gemini-cli-robot in
  [#26957](https://github.com/google-gemini/gemini-cli/pull/26957)
- Changelog for v0.42.0 by @gemini-cli-robot in
  [#26958](https://github.com/google-gemini/gemini-cli/pull/26958)
- Refactor: Eliminate `no-unsafe-return` suppressions via strict type validation
  by @M-DEV-1 in
  [#20668](https://github.com/google-gemini/gemini-cli/pull/20668)
- Changelog for v0.43.0-preview.0 by @gemini-cli-robot in
  [#26959](https://github.com/google-gemini/gemini-cli/pull/26959)
- feat(core): change agent registration to first-wins and prioritize project by
  @adamfweidman in
  [#26953](https://github.com/google-gemini/gemini-cli/pull/26953)
- feat(cli): merge Auto modes into a single Auto mode by @DavidAPierce in
  [#26714](https://github.com/google-gemini/gemini-cli/pull/26714)
- fix(core): preserve OAuth refresh tokens during rotation and retrieval by
  @cocosheng-g in
  [#26924](https://github.com/google-gemini/gemini-cli/pull/26924)
- fix(cli): allow keychain auth for --list-sessions and non-interactive mode by
  @cocosheng-g in
  [#26921](https://github.com/google-gemini/gemini-cli/pull/26921)
- fix(core): handle EISDIR on virtual drives in memory discovery by @cocosheng-g
  in [#26985](https://github.com/google-gemini/gemini-cli/pull/26985)
- fix(cli): auto-approve shell redirections in AUTO_EDIT mode by @cocosheng-g in
  [#27003](https://github.com/google-gemini/gemini-cli/pull/27003)
- ci: suppress bot comments during standard triage maintenance by @cocosheng-g
  in [#27006](https://github.com/google-gemini/gemini-cli/pull/27006)
- fix(core): refresh MCP OAuth token usage after re-auth by @sahilkirad in
  [#26312](https://github.com/google-gemini/gemini-cli/pull/26312)
- fix(ui): clamped table column widths by @devr0306 in
  [#26991](https://github.com/google-gemini/gemini-cli/pull/26991)
- fix(core): isolate subagent thread context by @akh64bit in
  [#26449](https://github.com/google-gemini/gemini-cli/pull/26449)
- chore: add execution permission to scripts/review.sh by @scidomino in
  [#27009](https://github.com/google-gemini/gemini-cli/pull/27009)
- fix(core): made context files append instead of replace by @devr0306 in
  [#26950](https://github.com/google-gemini/gemini-cli/pull/26950)
- fix: add system PATH fallback for ripgrep resolution (#26777) by @cocosheng-g
  in [#26868](https://github.com/google-gemini/gemini-cli/pull/26868)
- chore: clean up launched memory features by @SandyTao520 in
  [#26941](https://github.com/google-gemini/gemini-cli/pull/26941)
- fix(core): throttle shell text output and bound live UI buffer by
  @emersonbusson in
  [#26955](https://github.com/google-gemini/gemini-cli/pull/26955)
- fix(cli): don't crash when an @-mention captures a non-path blob by @ifitisit
  in [#25980](https://github.com/google-gemini/gemini-cli/pull/25980)
- fix(core): ensure stable fallback for restricted preview models by @galz10 in
  [#26999](https://github.com/google-gemini/gemini-cli/pull/26999)
- feat(core): expose RAG snippets to local log file for debugging by @spencer426
  in [#27016](https://github.com/google-gemini/gemini-cli/pull/27016)
- fix(acp/auth): prevent conflicting credentials on enterprise gateways and
  support optional API keys natively by @sripasg in
  [#27021](https://github.com/google-gemini/gemini-cli/pull/27021)
- fix(core): respect NO_PROXY for network-based MCP servers by @cocosheng-g in
  [#27012](https://github.com/google-gemini/gemini-cli/pull/27012)
- fix(cli): resolve permission denied in sandbox on NixOS and other distros by
  @cocosheng-g in
  [#27004](https://github.com/google-gemini/gemini-cli/pull/27004)
- fix(ui): preserve new line at the end of edit window by @devr0306 in
  [#27057](https://github.com/google-gemini/gemini-cli/pull/27057)
- fix(core): ensure Vertex AI sets hasAccessToPreviewModels and remove
  aggressive 404 fallback revocation by @galz10 in
  [#27067](https://github.com/google-gemini/gemini-cli/pull/27067)
- fix(core): ensure stable admin settings comparison across IPC to prevent
  restart loop by @DavidAPierce in
  [#27066](https://github.com/google-gemini/gemini-cli/pull/27066)
- fix(deps): update vulnerable dependencies by @scidomino in
  [#27062](https://github.com/google-gemini/gemini-cli/pull/27062)
- fix(core): resolve EISDIR errors during file processing (#21527) by @ProthamD
  in [#27041](https://github.com/google-gemini/gemini-cli/pull/27041)
- docs(extensions): clarify env var sanitization policy for MCP and ext… by
  @galz10 in [#22854](https://github.com/google-gemini/gemini-cli/pull/22854)
- fix(ui): add ENAMETOOLONG and ENOTDIR to exceptions for file parsing errors by
  @devr0306 in [#27069](https://github.com/google-gemini/gemini-cli/pull/27069)
- fix(cli): explicitly clear entrypoint when spawning sandbox container by
  @cocosheng-g in
  [#27059](https://github.com/google-gemini/gemini-cli/pull/27059)
- docs: update sandbox image command by @sjhddh in
  [#26774](https://github.com/google-gemini/gemini-cli/pull/26774)
- fix(core): externalize https-proxy-agent to fix proxy support by @sotokisehiro
  in [#26361](https://github.com/google-gemini/gemini-cli/pull/26361)
- security: update dependencies to fix critical and high vulnerabilities by
  @scidomino in [#27077](https://github.com/google-gemini/gemini-cli/pull/27077)
- Fix/web fetch ctrl c abort by @ProthamD in
  [#24320](https://github.com/google-gemini/gemini-cli/pull/24320)
- fix(core): add aliases and thinking config for gemini-3.1 models by
  @anishs1207 in
  [#27007](https://github.com/google-gemini/gemini-cli/pull/27007)
- fix(core): use hasAccessToPreview for auto model resolution and fix
  disappearing models by @DavidAPierce in
  [#27112](https://github.com/google-gemini/gemini-cli/pull/27112)
- feat(core): add adk.agentSessionSubagentEnabled flag by @adamfweidman in
  [#26947](https://github.com/google-gemini/gemini-cli/pull/26947)
- fix(core): enforce compile-time exhaustiveness in content-utils by
  @adamfweidman in
  [#27207](https://github.com/google-gemini/gemini-cli/pull/27207)
- feat(skills): add agent-tui and tui-tester skills by @adamfweidman in
  [#27121](https://github.com/google-gemini/gemini-cli/pull/27121)
- fix(context): Fix snapshot recovery across sessions. by @joshualitt in
  [#26939](https://github.com/google-gemini/gemini-cli/pull/26939)
- fix(core): add unit tests for stableStringify by @devr0306 in
  [#27212](https://github.com/google-gemini/gemini-cli/pull/27212)
- fix(core): prefer pwsh.exe over Windows PowerShell 5.1 (#25859) by @kaluchi in
  [#25900](https://github.com/google-gemini/gemini-cli/pull/25900)
- feat(core): add LocalSessionInvocation by @adamfweidman in
  [#26665](https://github.com/google-gemini/gemini-cli/pull/26665)
- refactor: decouple auto model description and configuration from
  releaseChannel by @danielweis in
  [#27227](https://github.com/google-gemini/gemini-cli/pull/27227)
- fix(core): prevent isBinary false-positive on Windows PTY streams by
  @TirthNaik-99 in
  [#26565](https://github.com/google-gemini/gemini-cli/pull/26565)
- fix(cli): Prevent unmapped keys in Vim Normal mode from inserting text into
  prompt Input. by @Rajeshpatel07 in
  [#25139](https://github.com/google-gemini/gemini-cli/pull/25139)
- fix(a2a-server): Implement default policy loading for parity with CLI by
  @kschaab in [#27073](https://github.com/google-gemini/gemini-cli/pull/27073)
- feat(core): add RemoteSessionInvocation by @adamfweidman in
  [#26937](https://github.com/google-gemini/gemini-cli/pull/26937)
- fix: allow configured MCP servers in non-interactive mode by @cocosheng-g in
  [#27215](https://github.com/google-gemini/gemini-cli/pull/27215)
- fix(core): add exception handling to migrateFromFileStorage by @devr0306 in
  [#27229](https://github.com/google-gemini/gemini-cli/pull/27229)
- fix(cli): bundle ink worker-entry.js by @rmedranollamas in
  [#27249](https://github.com/google-gemini/gemini-cli/pull/27249)
- feat(core): wire AgentSession invocations into agent-tool by @adamfweidman in
  [#26948](https://github.com/google-gemini/gemini-cli/pull/26948)
- fix(core): prevent path traversal in custome command file injection by
  @ompatel-aiml in
  [#27234](https://github.com/google-gemini/gemini-cli/pull/27234)
- fix(core): respect NO_PROXY in global fetch dispatcher by @cocosheng-g in
  [#27216](https://github.com/google-gemini/gemini-cli/pull/27216)
- fix(core): correctly handle nullable array types in MCP tools by @devr0306 in
  [#27228](https://github.com/google-gemini/gemini-cli/pull/27228)
- fix(cli): preserve proxy-agent named exports in ESM bundle by @ashishch432 in
  [#27145](https://github.com/google-gemini/gemini-cli/pull/27145)
- Proposal: deterministic encoding for child-process I/O by @kaluchi in
  [#27247](https://github.com/google-gemini/gemini-cli/pull/27247)
- feat(cli): add Sublime Text and Emacs Client editors, improve error messages
  and documentation by @alberti42 in
  [#21090](https://github.com/google-gemini/gemini-cli/pull/21090)
- Changelog for v0.43.0-preview.1 by @gemini-cli-robot in
  [#27297](https://github.com/google-gemini/gemini-cli/pull/27297)
- fix(devtools): bundle devtools package to avoid resolution errors by
  @rmedranollamas in
  [#27250](https://github.com/google-gemini/gemini-cli/pull/27250)
- fix(cli): integrate PolicyEngine into ACP session to prevent deadlocks
  (#23507) by @cocosheng-g in
  [#27252](https://github.com/google-gemini/gemini-cli/pull/27252)
- fix: robust ripgrep path resolution and 1p hermetic execution support by
  @cocosheng-g in
  [#27253](https://github.com/google-gemini/gemini-cli/pull/27253)
- refactor: decouple stored session deletion from ChatRecordingService (#22920)
  by @yuvrajangadsingh in
  [#27039](https://github.com/google-gemini/gemini-cli/pull/27039)
- fix(core): improve Alpine shell compatibility by @dibyx in
  [#26770](https://github.com/google-gemini/gemini-cli/pull/26770)
- fix(core): generalize MCP compliance fix for tool results by @cocosheng-g in
  [#27045](https://github.com/google-gemini/gemini-cli/pull/27045)
- fix(scripts): scrub CI env vars in dev to keep interactive mode by @Hashaam101
  in [#27159](https://github.com/google-gemini/gemini-cli/pull/27159)
- fix(core): Added date field for the GCal MCP by @devr0306 in
  [#27251](https://github.com/google-gemini/gemini-cli/pull/27251)
- fix(core): centralize path validation to prevent crashes from malformed
  prompts by @cocosheng-g in
  [#27211](https://github.com/google-gemini/gemini-cli/pull/27211)
- fix(core): prevent SIGHUP kills in PTY environments (WSL2/Kitty/Alacritty) by
  @ProthamD in [#27267](https://github.com/google-gemini/gemini-cli/pull/27267)
- fix(core): dynamic fallback routing for exhausted quota models by @cocosheng-g
  in [#27315](https://github.com/google-gemini/gemini-cli/pull/27315)
- Auto detect pnpm global installation path for macOS and Windows by @tisonkun
  in [#22748](https://github.com/google-gemini/gemini-cli/pull/22748)
- fix(windows): resolve interactive shell arrow-key navigation on Windows by
  @KumarADITHYA123 in
  [#23505](https://github.com/google-gemini/gemini-cli/pull/23505)
- ci: robust stale issue lifecycle and consolidated triage labels by
  @cocosheng-g in
  [#27015](https://github.com/google-gemini/gemini-cli/pull/27015)
- fix(context): Ensure last message is processed. by @joshualitt in
  [#27232](https://github.com/google-gemini/gemini-cli/pull/27232)
- chore/release: bump version to 0.44.0-nightly.20260521.g57c42a5c4 by
  @gemini-cli-robot in
  [#27324](https://github.com/google-gemini/gemini-cli/pull/27324)
- fix(ui): added volta to auto update check by @devr0306 in
  [#27353](https://github.com/google-gemini/gemini-cli/pull/27353)
- perf: optimize issue triage and lifecycle management by @cocosheng-g in
  [#27346](https://github.com/google-gemini/gemini-cli/pull/27346)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.43.0...v0.44.0
