# Preview release: v0.42.0-preview.2

Released: May 06, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Auto Memory Enhancements:** Introduced an Auto Memory inbox flow with a
  canonical-patch contract for better memory management.
- **Improved Voice Mode:** Added a wave animation, microphone icon updates, and
  privacy/compliance UX warnings for the Gemini Live backend.
- **New CLI Commands & Flags:** Added a `--delete` flag to the `/exit` command
  for session deletion, a `list` subcommand to `/commands`, and a `/bug-memory`
  command for heap snapshots.
- **Expanded Model Support:** Gemma 4 models are now enabled by default via the
  Gemini API.
- **Enhanced Core Resilience:** Improved API resilience with reduced timeouts,
  automatic retries for stream errors, and better handling of invalid stream
  events.

## What's Changed

- fix(cli): prevent automatic updates from switching to less stable channels in
  [#26132](https://github.com/google-gemini/gemini-cli/pull/26132)
- chore(release): bump version to 0.42.0-nightly.20260428.g59b2dea0e in
  [#26142](https://github.com/google-gemini/gemini-cli/pull/26142)
- fix(cli): pass node arguments via NODE_OPTIONS during relaunch to support SEA
  in [#26130](https://github.com/google-gemini/gemini-cli/pull/26130)
- fix(cli): handle DECKPAM keypad Enter sequences in terminal in
  [#26092](https://github.com/google-gemini/gemini-cli/pull/26092)
- docs(cli): point plan-mode session retention to actual /settings labels in
  [#25978](https://github.com/google-gemini/gemini-cli/pull/25978)
- fix(core): add missing oauth fields support in subagent parsing in
  [#26141](https://github.com/google-gemini/gemini-cli/pull/26141)
- fix(core): disconnect extension-backed MCP clients in stopExtension in
  [#26136](https://github.com/google-gemini/gemini-cli/pull/26136)
- Update documentation workflows with workspace trust in
  [#26150](https://github.com/google-gemini/gemini-cli/pull/26150)
- refactor(acp): modularize monolithic acpClient into specialized files in
  [#26143](https://github.com/google-gemini/gemini-cli/pull/26143)
- test: fix failures due to antigravity environment leakage in
  [#26162](https://github.com/google-gemini/gemini-cli/pull/26162)
- fix(core): add explicit empty log guard in A2A pushMessage in
  [#26198](https://github.com/google-gemini/gemini-cli/pull/26198)
- feat(cli): add --delete flag to /exit command for session deletion in
  [#19332](https://github.com/google-gemini/gemini-cli/pull/19332)
- test(core): add regression test for issue for ToolConfirmationResponse in
  [#26194](https://github.com/google-gemini/gemini-cli/pull/26194)
- Add the ability to @ mention the gemini robot. in
  [#26207](https://github.com/google-gemini/gemini-cli/pull/26207)
- test(evals): add EvalMetadata JSDoc annotations to older tests in
  [#26147](https://github.com/google-gemini/gemini-cli/pull/26147)
- fix(core): reduce default API timeout to 60s and enable retries for undici
  timeouts in [#26191](https://github.com/google-gemini/gemini-cli/pull/26191)
- fix(core): distinguish fallback chains and fix maxAttempts for auto vs
  explicit model selection in
  [#26163](https://github.com/google-gemini/gemini-cli/pull/26163)
- fix(cli): handle InvalidStream event gracefully without throwing in
  [#26218](https://github.com/google-gemini/gemini-cli/pull/26218)
- ci(github-actions): switch to github app token and fix bot self-trigger in
  [#26223](https://github.com/google-gemini/gemini-cli/pull/26223)
- Respect logPrompts flag for logging sensitive fields in
  [#26153](https://github.com/google-gemini/gemini-cli/pull/26153)
- fix: correct API key validation logic in handleApiKeySubmit in
  [#25453](https://github.com/google-gemini/gemini-cli/pull/25453)
- fix(agent): prevent exit_plan_mode from being called via shell in
  [#26230](https://github.com/google-gemini/gemini-cli/pull/26230)
- # Fix: Inconsistent Case-Sensitivity in GrepTool in [#26235](https://github.com/google-gemini/gemini-cli/pull/26235)
- docs(core): add automated gemma setup guide in
  [#26233](https://github.com/google-gemini/gemini-cli/pull/26233)
- Allow non-https proxy urls to support container environments in
  [#26234](https://github.com/google-gemini/gemini-cli/pull/26234)
- fix(bot): productivity and backlog optimizations in
  [#26236](https://github.com/google-gemini/gemini-cli/pull/26236)
- refactor(acp): delegate prompt turn processing logic to GeminiClient in
  [#26222](https://github.com/google-gemini/gemini-cli/pull/26222)
- fix(cli): refine platform-specific undo/redo and smart bubbling for WSL in
  [#26202](https://github.com/google-gemini/gemini-cli/pull/26202)
- fix: suppress duplicate extension warnings during startup in
  [#26208](https://github.com/google-gemini/gemini-cli/pull/26208)
- fix(cli): use byte length instead of string length for readStdin size limits
  in [#26224](https://github.com/google-gemini/gemini-cli/pull/26224)
- fix(ui): made shell tool header wrap on Ctrl+O in
  [#26229](https://github.com/google-gemini/gemini-cli/pull/26229)
- Changelog for v0.41.0-preview.0 in
  [#26244](https://github.com/google-gemini/gemini-cli/pull/26244)
- Skip binary CLI relaunch in
  [#26261](https://github.com/google-gemini/gemini-cli/pull/26261)
- fix(cli): do not override GOOGLE_CLOUD_PROJECT in Cloud Shell when using
  Vertex AI in [#24455](https://github.com/google-gemini/gemini-cli/pull/24455)
- docs(cli): add skill discovery troubleshooting checklist to tutorial in
  [#26018](https://github.com/google-gemini/gemini-cli/pull/26018)
- docs(policy-engine): link to tools reference for tool names and args in
  [#22081](https://github.com/google-gemini/gemini-cli/pull/22081)
- Fix posting invalid response to a comment in
  [#26266](https://github.com/google-gemini/gemini-cli/pull/26266)
- fix(cli): prevent informational logs from polluting json output in
  [#26264](https://github.com/google-gemini/gemini-cli/pull/26264)
- feat(ui): added microphone and updated placeholder for voice mode in
  [#26270](https://github.com/google-gemini/gemini-cli/pull/26270)
- feat(cli): Add 'list' subcommand to '/commands' in
  [#22324](https://github.com/google-gemini/gemini-cli/pull/22324)
- fix(core): ensure tool output cleanup on session deletion for legacy files in
  [#26263](https://github.com/google-gemini/gemini-cli/pull/26263)
- Docs: Update Agent Skills documentation in
  [#22388](https://github.com/google-gemini/gemini-cli/pull/22388)
- test(acp): add missing coverage for extensions command error paths in
  [#25313](https://github.com/google-gemini/gemini-cli/pull/25313)
- Changelog for v0.40.0 in
  [#26245](https://github.com/google-gemini/gemini-cli/pull/26245)
- fix: report AgentExecutionBlocked in non-interactive programmatic modes in
  [#26262](https://github.com/google-gemini/gemini-cli/pull/26262)
- feat(extensions): add 'delete' as an alias for /extensions uninstall in
  [#25660](https://github.com/google-gemini/gemini-cli/pull/25660)
- fix(core): silently skip GEMINI.md paths that are directories (EISDIR) in
  [#25662](https://github.com/google-gemini/gemini-cli/pull/25662)
- fix(ci): checkout PR branch instead of main in bot workflow in
  [#26289](https://github.com/google-gemini/gemini-cli/pull/26289)
- fix(cli): use resolved sandbox state for auto-update check in
  [#26285](https://github.com/google-gemini/gemini-cli/pull/26285)
- # Metrics Integrity & Standardized Reporting (BT-01) in [#26240](https://github.com/google-gemini/gemini-cli/pull/26240)
- Add Star History section to README in
  [#26290](https://github.com/google-gemini/gemini-cli/pull/26290)
- Add Star History section to README in
  [#26308](https://github.com/google-gemini/gemini-cli/pull/26308)
- Remove Star History section from README in
  [#26309](https://github.com/google-gemini/gemini-cli/pull/26309)
- test(evals): add behavioral eval for file creation and write_file tool
  selection in [#26292](https://github.com/google-gemini/gemini-cli/pull/26292)
- feat(config): enable Gemma 4 models by default via Gemini API in
  [#26307](https://github.com/google-gemini/gemini-cli/pull/26307)
- fix(cli): insert voice transcription at cursor position instead of ap… in
  [#26287](https://github.com/google-gemini/gemini-cli/pull/26287)
- fix(ui): fix issue with box edges in
  [#26148](https://github.com/google-gemini/gemini-cli/pull/26148)
- fix(cli): respect .env override for GOOGLE_CLOUD_PROJECT in
  [#26288](https://github.com/google-gemini/gemini-cli/pull/26288)
- fix(ci): robust version checking in release verification in
  [#26337](https://github.com/google-gemini/gemini-cli/pull/26337)
- fix(cli): enable daemon relaunch in binary and bundle keytar in
  [#26333](https://github.com/google-gemini/gemini-cli/pull/26333)
- fix(core): discourage unprompted git add . in prompt snippets in
  [#26220](https://github.com/google-gemini/gemini-cli/pull/26220)
- feat(ui): added wave animation for voice mode in
  [#26284](https://github.com/google-gemini/gemini-cli/pull/26284)
- fix(cli): prevent Escape from clearing input buffer (#17083) in
  [#26339](https://github.com/google-gemini/gemini-cli/pull/26339)
- fix(cli): undeprecate --prompt and correct positional query docs in
  [#26329](https://github.com/google-gemini/gemini-cli/pull/26329)
- Metrics updates in
  [#26348](https://github.com/google-gemini/gemini-cli/pull/26348)
- fix(core): remove "System: Please continue." injection on InvalidStream events
  in [#26340](https://github.com/google-gemini/gemini-cli/pull/26340)
- docs(policy-engine): add tool argument keys reference and shell policy
  cross-links in
  [#25292](https://github.com/google-gemini/gemini-cli/pull/25292)
- fix(cli): resolve Ghostty/raw-mode False Cancellation in oauth flow in
  [#25026](https://github.com/google-gemini/gemini-cli/pull/25026)
- fix(core): reset session-scoped state on resumption in
  [#26342](https://github.com/google-gemini/gemini-cli/pull/26342)
- Fix bulk of remaining issues with generalist profile in
  [#26073](https://github.com/google-gemini/gemini-cli/pull/26073)
- fix(core): make subagents aware of active approval modes in
  [#23608](https://github.com/google-gemini/gemini-cli/pull/23608)
- fix(acp): resolve agent mode disconnect and improve mode awareness in
  [#26332](https://github.com/google-gemini/gemini-cli/pull/26332)
- docs(sdk): add JSDoc to exported interfaces in packages/sdk/src/types.ts in
  [#26441](https://github.com/google-gemini/gemini-cli/pull/26441)
- perf: skip redundant GEMINI.md loading in partialConfig in
  [#26443](https://github.com/google-gemini/gemini-cli/pull/26443)
- Enhance React guidelines in
  [#22667](https://github.com/google-gemini/gemini-cli/pull/22667)
- feat(core): reinforce Inquiry constraints to prevent unauthorized changes in
  [#26310](https://github.com/google-gemini/gemini-cli/pull/26310)
- revert: fix(ci): robust version checking in release verification (#26337) in
  [#26450](https://github.com/google-gemini/gemini-cli/pull/26450)
- refactor(UI): created constants file for ThemeDialog in
  [#26446](https://github.com/google-gemini/gemini-cli/pull/26446)
- docs: fix GitHub capitalization in releases guide in
  [#26379](https://github.com/google-gemini/gemini-cli/pull/26379)
- fix(cli): ensure branch indicator updates in sub-directories and worktrees in
  [#26330](https://github.com/google-gemini/gemini-cli/pull/26330)
- feat: add minimal V8 heap snapshot utility for memory diagnostics in
  [#26440](https://github.com/google-gemini/gemini-cli/pull/26440)
- fix(hooks): preserve non-text parts in fromHookLLMRequest in
  [#26275](https://github.com/google-gemini/gemini-cli/pull/26275)
- fix(cli): allow early stdout when config is undefined in
  [#26453](https://github.com/google-gemini/gemini-cli/pull/26453)
- fix(cli)#21297: clear skills consent dialog before reload in
  [#26431](https://github.com/google-gemini/gemini-cli/pull/26431)
- fix(cli): render LaTeX-style output as Unicode in the TUI in
  [#25802](https://github.com/google-gemini/gemini-cli/pull/25802)
- fix(core): use close event instead of exit in child_process fallback in
  [#25695](https://github.com/google-gemini/gemini-cli/pull/25695)
- feat(voice): add privacy and compliance UX warning for Gemini Live backend in
  [#26454](https://github.com/google-gemini/gemini-cli/pull/26454)
- feat(memory): add Auto Memory inbox flow with canonical-patch contract in
  [#26338](https://github.com/google-gemini/gemini-cli/pull/26338)
- test(cleanup): fix temporary directory leaks in test suites in
  [#26217](https://github.com/google-gemini/gemini-cli/pull/26217)
- feat: add ignoreLocalEnv setting and --ignore-env flag (#2493) in
  [#26445](https://github.com/google-gemini/gemini-cli/pull/26445)
- docs(sdk): add JSDoc to all exported interfaces and types in
  [#26277](https://github.com/google-gemini/gemini-cli/pull/26277)
- feat(cli): improve /agents refresh logging in
  [#26442](https://github.com/google-gemini/gemini-cli/pull/26442)
- Fix: make Dockerfile self-contained with multi-stage build in
  [#24277](https://github.com/google-gemini/gemini-cli/pull/24277)
- fix(core): filter unsupported multimodal types from tool responses in
  [#26352](https://github.com/google-gemini/gemini-cli/pull/26352)
- fix(core): properly format markdown in AskUser tool by unescaping newlines in
  [#26349](https://github.com/google-gemini/gemini-cli/pull/26349)
- feat(bot): add actions spend metric script in
  [#26463](https://github.com/google-gemini/gemini-cli/pull/26463)
- feat(cli): add /bug-memory command and auto-capture heap snapshot in /bug in
  [#25639](https://github.com/google-gemini/gemini-cli/pull/25639)
- fix(cli): make SkillInboxDialog fit and scroll in alternate buffer in
  [#26455](https://github.com/google-gemini/gemini-cli/pull/26455)
- Robust Scale-Safe Lifecycle Consolidation in
  [#26355](https://github.com/google-gemini/gemini-cli/pull/26355)
- fix(ci): respect exempt labels when closing stale items in
  [#26475](https://github.com/google-gemini/gemini-cli/pull/26475)
- fix(cli): use os.homedir() for home directory warning check in
  [#25890](https://github.com/google-gemini/gemini-cli/pull/25890)
- fix(a2a-server): resolve tool approval race condition and improve status
  reporting in [#26479](https://github.com/google-gemini/gemini-cli/pull/26479)
- fix(cli): prevent settings dialog border clipping using maxHeight in
  [#26507](https://github.com/google-gemini/gemini-cli/pull/26507)
- feat: allow queuing messages during compression (#24071) in
  [#26506](https://github.com/google-gemini/gemini-cli/pull/26506)
- fix(core): retry on ERR_STREAM_PREMATURE_CLOSE errors in
  [#26519](https://github.com/google-gemini/gemini-cli/pull/26519)
- fix(core): Minor fixes for generalist profile. in
  [#26357](https://github.com/google-gemini/gemini-cli/pull/26357)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.41.0-preview.3...v0.42.0-preview.2
