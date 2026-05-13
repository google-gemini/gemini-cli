# Preview release: v0.43.0-preview.0

Released: May 12, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Surgical Code Edits:** Steer models to use the `edit` tool for precise code
  modifications, improving accuracy and reducing context usage.
- **Session Portability:** Added ability to export chat sessions to files and
  import them via a new CLI flag, enabling session persistence and sharing.
- **Enhanced Security:** Introduced comprehensive shell command safety
  evaluations and strengthened model steering to prevent unauthorized changes.
- **Context Management:** Implemented a new adaptive token calculator for more
  accurate content size estimations and optimized context pipelines.
- **UX Improvements:** Enhanced tool call visibility with prefixed IDs and
  improved the UI for session resumption and MCP list management.

## What's Changed

- feat(core): steer model to use edit tool for surgical edits, fix a typo in
  [#26480](https://github.com/google-gemini/gemini-cli/pull/26480)
- docs: clarify Auto Memory proposes memory updates and skills in
  [#26527](https://github.com/google-gemini/gemini-cli/pull/26527)
- fix(core): reject numeric project IDs in GOOGLE_CLOUD_PROJECT (#24695) in
  [#26532](https://github.com/google-gemini/gemini-cli/pull/26532)
- fix(core): remove unsafe type assertion suppressions in error utils in
  [#19881](https://github.com/google-gemini/gemini-cli/pull/19881)
- fix(core): allow redirection in YOLO and AUTO_EDIT modes without sandboxing in
  [#26542](https://github.com/google-gemini/gemini-cli/pull/26542)
- ci(release): build and attach unsigned macOS binaries to releases in
  [#26462](https://github.com/google-gemini/gemini-cli/pull/26462)
- fix(core): Fix chat corruption bug in context manager. in
  [#26534](https://github.com/google-gemini/gemini-cli/pull/26534)
- fix(cli): provide JSON output for AgentExecutionStopped in non-interactive
  mode in [#26504](https://github.com/google-gemini/gemini-cli/pull/26504)
- feat(evals): add shell command safety evals in
  [#26528](https://github.com/google-gemini/gemini-cli/pull/26528)
- fix(core): handle invalid custom plans directory gracefully in
  [#26560](https://github.com/google-gemini/gemini-cli/pull/26560)
- fix(acp): move tool explanation from thought stream to tool call content in
  [#26554](https://github.com/google-gemini/gemini-cli/pull/26554)
- fix(a2a-server): Resolve race condition in tool completion waiting in
  [#26568](https://github.com/google-gemini/gemini-cli/pull/26568)
- fix(cli): randomize sandbox container names in
  [#26014](https://github.com/google-gemini/gemini-cli/pull/26014)
- fix(core): Fix hysteresis in async context management pipelines. in
  [#26452](https://github.com/google-gemini/gemini-cli/pull/26452)
- Tighten private Auto Memory patch allowlist in
  [#26535](https://github.com/google-gemini/gemini-cli/pull/26535)
- fix(cli): hide read-only settings scopes in
  [#26249](https://github.com/google-gemini/gemini-cli/pull/26249)
- fix(ci): preserve executable bit for mac binaries in
  [#26600](https://github.com/google-gemini/gemini-cli/pull/26600)
- fix(cli): improve mcp list UX in untrusted folders in
  [#26457](https://github.com/google-gemini/gemini-cli/pull/26457)
- fix(core): prevent silent hang during OAuth auth on headless Linux in
  [#26571](https://github.com/google-gemini/gemini-cli/pull/26571)
- Changelog for v0.42.0-preview.0 in
  [#26537](https://github.com/google-gemini/gemini-cli/pull/26537)
- ci: fix Argument list too long in triage workflows in
  [#26603](https://github.com/google-gemini/gemini-cli/pull/26603)
- refactor(cli): migrate core tools to native ToolDisplay property and fix UI
  rendering in [#25186](https://github.com/google-gemini/gemini-cli/pull/25186)
- don't wrap args unnecessarily in
  [#26599](https://github.com/google-gemini/gemini-cli/pull/26599)
- fix(core): preserve system PATH in Git environment to fix ENOENT (#25034) in
  [#26587](https://github.com/google-gemini/gemini-cli/pull/26587)
- fix(routing): fix resolveClassifierModel argument mismatch in
  ApprovalModeStrategy in
  [#26658](https://github.com/google-gemini/gemini-cli/pull/26658)
- docs: add vi mode shortcuts and clarify MCP/custom sandbox setup in
  [#23853](https://github.com/google-gemini/gemini-cli/pull/23853)
- fix(ux): fixed issue with transcribed text not showing after releasing space
  in [#26609](https://github.com/google-gemini/gemini-cli/pull/26609)
- ci: fix json parsing in scheduled triage workflow in
  [#26656](https://github.com/google-gemini/gemini-cli/pull/26656)
- fix(cli): hide /memory add subcommand when memoryV2 is enabled in
  [#26605](https://github.com/google-gemini/gemini-cli/pull/26605)
- fix: prevent false command conflicts when launching from home directory in
  [#23069](https://github.com/google-gemini/gemini-cli/pull/23069)
- fix(core): cache model routing decision in LocalAgentExecutor in
  [#26548](https://github.com/google-gemini/gemini-cli/pull/26548)
- Changelog for v0.42.0-preview.2 in
  [#26597](https://github.com/google-gemini/gemini-cli/pull/26597)
- skip broken test in
  [#26705](https://github.com/google-gemini/gemini-cli/pull/26705)
- feat: export session to file and import via flag in
  [#26514](https://github.com/google-gemini/gemini-cli/pull/26514)
- Feat: Add Machine Hostname to CLI interface in
  [#25637](https://github.com/google-gemini/gemini-cli/pull/25637)
- docs(extensions): refactor releasing guide and add update mechanisms in
  [#26595](https://github.com/google-gemini/gemini-cli/pull/26595)
- fix(ci): fix maintainer identification in lifecycle manager in
  [#26706](https://github.com/google-gemini/gemini-cli/pull/26706)
- fix(ui): added quotes around session id in resume tip in
  [#26669](https://github.com/google-gemini/gemini-cli/pull/26669)
- Changelog for v0.41.0 in
  [#26670](https://github.com/google-gemini/gemini-cli/pull/26670)
- refactor(core): agent session protocol changes in
  [#26661](https://github.com/google-gemini/gemini-cli/pull/26661)
- fix(context): implement loose boundary policy for gc backstop. in
  [#26594](https://github.com/google-gemini/gemini-cli/pull/26594)
- fix(core): throw explicit error on dropped tool responses in
  [#26668](https://github.com/google-gemini/gemini-cli/pull/26668)
- fix: resolve "function response turn must come immediately after function
  call" error in
  [#26691](https://github.com/google-gemini/gemini-cli/pull/26691)
- fix(core): resolve parallel tool call streaming ID collision in
  [#26646](https://github.com/google-gemini/gemini-cli/pull/26646)
- feat(core): add LocalSubagentProtocol behind AgentProtocol in
  [#25302](https://github.com/google-gemini/gemini-cli/pull/25302)
- fix(cli): remove noisy theme registration logs from terminal in
  [#25858](https://github.com/google-gemini/gemini-cli/pull/25858)
- ci: implement codebase-aware effort level triage in
  [#26666](https://github.com/google-gemini/gemini-cli/pull/26666)
- feat(acp/core): prefix tool call IDs with tool names to support tool rendering
  in ACP compliant IDEs. in
  [#26676](https://github.com/google-gemini/gemini-cli/pull/26676)
- fix(mcp): treat GET 404 as 405 in StreamableHTTPClientTransport in
  [#24847](https://github.com/google-gemini/gemini-cli/pull/24847)
- feat(core): add RemoteSubagentProtocol behind AgentProtocol in
  [#25303](https://github.com/google-gemini/gemini-cli/pull/25303)
- feat(context): Improvements to the snapshotter. in
  [#26655](https://github.com/google-gemini/gemini-cli/pull/26655)
- fix(context): Change snapshotter model config. in
  [#26745](https://github.com/google-gemini/gemini-cli/pull/26745)
- fix(cli): allow installing extensions from ssh repo in
  [#26274](https://github.com/google-gemini/gemini-cli/pull/26274)
- fix(cli): prevent duplicate SessionStart systemMessage render in
  [#25827](https://github.com/google-gemini/gemini-cli/pull/25827)
- fix(cli/acp): prevent infinite thought loop in ACP mode by disablig
  nextSpeakerCheck in
  [#26874](https://github.com/google-gemini/gemini-cli/pull/26874)
- fix(cli): use static tool name in confirmation prompt to avoid parsing errors
  in [#26866](https://github.com/google-gemini/gemini-cli/pull/26866)
- fix(routing): Refactor tool turn handling for the conversation history in
  NumericalClassifierStrategy to prevent 400 Bad Request in
  [#26761](https://github.com/google-gemini/gemini-cli/pull/26761)
- fix(core): handle malformed projects.json in ProjectRegistry in
  [#26885](https://github.com/google-gemini/gemini-cli/pull/26885)
- fix(ui): added a gutter width to the input prompt width calculation in
  [#26882](https://github.com/google-gemini/gemini-cli/pull/26882)
- fix: prevent EISDIR crash when customIgnoreFilePaths contains directories
  (#19868) in [#19898](https://github.com/google-gemini/gemini-cli/pull/19898)
- revert 6b9b778d821728427eea07b1b97ba07378137d0b in
  [#26893](https://github.com/google-gemini/gemini-cli/pull/26893)
- Fix/vscode run current file ts in
  [#22894](https://github.com/google-gemini/gemini-cli/pull/22894)
- Allow Enter to select session while in search mode in /resume in
  [#21523](https://github.com/google-gemini/gemini-cli/pull/21523)
- fix(core): ignore .pak and .rpa game archive formats by default in
  [#26884](https://github.com/google-gemini/gemini-cli/pull/26884)
- fix(cli): enable adk non-interactive session in
  [#26895](https://github.com/google-gemini/gemini-cli/pull/26895)
- fix(cli): restore resume for legacy sessions in
  [#26577](https://github.com/google-gemini/gemini-cli/pull/26577)
- fix: respect explicit model selection after Flash quota exhaustion (#26759) in
  [#26872](https://github.com/google-gemini/gemini-cli/pull/26872)
- feat(context): Introduce adaptive token calculator to more accurately
  calculate content sizes. in
  [#26888](https://github.com/google-gemini/gemini-cli/pull/26888)
- chore: update checkout action configuration in workflows in
  [#26897](https://github.com/google-gemini/gemini-cli/pull/26897)
- fix (telemetry): inject quota_project_id to prevent fallback to default oauth
  client in [#26698](https://github.com/google-gemini/gemini-cli/pull/26698)
- Exclude extension context from skill extraction agent in
  [#26879](https://github.com/google-gemini/gemini-cli/pull/26879)
- Enable NumericalRouter when using dynamic model configs in
  [#26929](https://github.com/google-gemini/gemini-cli/pull/26929)
- ci: actively triage missing priority labels and intelligently clean up
  conflicting labels in
  [#26865](https://github.com/google-gemini/gemini-cli/pull/26865)
- refactor(core): introduce SubagentState enum for progress in
  [#26934](https://github.com/google-gemini/gemini-cli/pull/26934)
- fix(ci): replace brittle --no-tag with explicit staging-tmp tag in
  [#26940](https://github.com/google-gemini/gemini-cli/pull/26940)
- Incremental refactor repo agent towards skills-based composition in
  [#26717](https://github.com/google-gemini/gemini-cli/pull/26717)
- fix(ui): fixed line wrap padding for selection lists in
  [#26944](https://github.com/google-gemini/gemini-cli/pull/26944)
- fix(core): update read_file schema for v1 compatibility (#22183) in
  [#26922](https://github.com/google-gemini/gemini-cli/pull/26922)
- fix(ci): configure git remote with token for authentication in
  [#26949](https://github.com/google-gemini/gemini-cli/pull/26949)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.42.0-preview.2...v0.43.0-preview.0
