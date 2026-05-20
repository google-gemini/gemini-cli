# Latest stable release: v0.42.0

Released: May 12, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Auto Memory Inbox:** Introduced a new inbox flow for Auto Memory using a
  canonical-patch contract, enabling more robust and manageable skill
  extraction.
- **Gemma 4 Default:** Gemma 4 models are now enabled by default via the Gemini
  API, providing improved performance and capabilities out of the box.
- **Voice Mode Polish:** Added wave animations for visual feedback and
  privacy/compliance UX warnings specifically for the Gemini Live backend.
- **Session Management:** Added a `--delete` flag to the `/exit` command for
  instant session deletion and introduced `/bug-memory` for easier heap
  diagnostics.
- **Improved Reliability:** Reduced default API timeouts to 60s and implemented
  retries for undici and premature stream closure errors.

## What's Changed

- fix(cli): prevent automatic updates from switching to less stable channels by
  @Adib234 in [#26132](https://github.com/google-gemini/gemini-cli/pull/26132)
- chore(release): bump version to 0.42.0-nightly.20260428.g59b2dea0e by
  @gemini-cli-robot in
  [#26142](https://github.com/google-gemini/gemini-cli/pull/26142)
- fix(cli): pass node arguments via NODE_OPTIONS during relaunch to support SEA
  by @cocosheng-g in
  [#26130](https://github.com/google-gemini/gemini-cli/pull/26130)
- fix(cli): handle DECKPAM keypad Enter sequences in terminal by @Gitanaskhan26
  in [#26092](https://github.com/google-gemini/gemini-cli/pull/26092)
- docs(cli): point plan-mode session retention to actual /settings labels by
  @ifitisit in [#25978](https://github.com/google-gemini/gemini-cli/pull/25978)
- fix(core): add missing oauth fields support in subagent parsing by
  @abhipatel12 in
  [#26141](https://github.com/google-gemini/gemini-cli/pull/26141)
- fix(core): disconnect extension-backed MCP clients in stopExtension by
  @cocosheng-g in
  [#26136](https://github.com/google-gemini/gemini-cli/pull/26136)
- Update documentation workflows with workspace trust by @g-samroberts in
  [#26150](https://github.com/google-gemini/gemini-cli/pull/26150)
- refactor(acp): modularize monolithic acpClient into specialized files by
  @sripasg in [#26143](https://github.com/google-gemini/gemini-cli/pull/26143)
- test: fix failures due to antigravity environment leakage by @adamfweidman in
  [#26162](https://github.com/google-gemini/gemini-cli/pull/26162)
- fix(core): add explicit empty log guard in A2A pushMessage by @adamfweidman in
  [#26198](https://github.com/google-gemini/gemini-cli/pull/26198)
- feat(cli): add --delete flag to /exit command for session deletion by
  @AbdulTawabJuly in
  [#19332](https://github.com/google-gemini/gemini-cli/pull/19332)
- test(core): add regression test for issue for ToolConfirmationResponse by
  @Adib234 in [#26194](https://github.com/google-gemini/gemini-cli/pull/26194)
- Add the ability to @ mention the gemini robot. by @gundermanc in
  [#26207](https://github.com/google-gemini/gemini-cli/pull/26207)
- test(evals): add EvalMetadata JSDoc annotations to older tests by @akh64bit in
  [#26147](https://github.com/google-gemini/gemini-cli/pull/26147)
- fix(core): reduce default API timeout to 60s and enable retries for undici
  timeouts by @Adib234 in
  [#26191](https://github.com/google-gemini/gemini-cli/pull/26191)
- fix(core): distinguish fallback chains and fix maxAttempts for auto vs
  explicit model selection by @adamfweidman in
  [#26163](https://github.com/google-gemini/gemini-cli/pull/26163)
- fix(cli): handle InvalidStream event gracefully without throwing by
  @adamfweidman in
  [#26218](https://github.com/google-gemini/gemini-cli/pull/26218)
- ci(github-actions): switch to github app token and fix bot self-trigger by
  @gundermanc in
  [#26223](https://github.com/google-gemini/gemini-cli/pull/26223)
- Respect logPrompts flag for logging sensitive fields by @lp-peg in
  [#26153](https://github.com/google-gemini/gemini-cli/pull/26153)
- fix: correct API key validation logic in handleApiKeySubmit by
  @martin-hsu-test in
  [#25453](https://github.com/google-gemini/gemini-cli/pull/25453)
- fix(agent): prevent exit_plan_mode from being called via shell by
  @Abhijit-2592 in
  [#26230](https://github.com/google-gemini/gemini-cli/pull/26230)
- # Fix: Inconsistent Case-Sensitivity in GrepTool by @.github/workflows/gemini-cli-bot-pulse.yml[bot] in [#26235](https://github.com/google-gemini/gemini-cli/pull/26235)
- docs(core): add automated gemma setup guide by @Samee24 in
  [#26233](https://github.com/google-gemini/gemini-cli/pull/26233)
- Allow non-https proxy urls to support container environments by @stevemk14ebr
  in [#26234](https://github.com/google-gemini/gemini-cli/pull/26234)
- fix(bot): productivity and backlog optimizations by @gundermanc in
  [#26236](https://github.com/google-gemini/gemini-cli/pull/26236)
- refactor(acp): delegate prompt turn processing logic to GeminiClient by
  @sripasg in [#26222](https://github.com/google-gemini/gemini-cli/pull/26222)
- fix(cli): refine platform-specific undo/redo and smart bubbling for WSL by
  @cocosheng-g in
  [#26202](https://github.com/google-gemini/gemini-cli/pull/26202)
- fix: suppress duplicate extension warnings during startup by @cocosheng-g in
  [#26208](https://github.com/google-gemini/gemini-cli/pull/26208)
- fix(cli): use byte length instead of string length for readStdin size limits
  by @Adib234 in
  [#26224](https://github.com/google-gemini/gemini-cli/pull/26224)
- fix(ui): made shell tool header wrap on Ctrl+O by @devr0306 in
  [#26229](https://github.com/google-gemini/gemini-cli/pull/26229)
- Changelog for v0.41.0-preview.0 by @gemini-cli-robot in
  [#26244](https://github.com/google-gemini/gemini-cli/pull/26244)
- Skip binary CLI relaunch by @ruomengz in
  [#26261](https://github.com/google-gemini/gemini-cli/pull/26261)
- fix(cli): do not override GOOGLE_CLOUD_PROJECT in Cloud Shell when using
  Vertex AI by @jackwotherspoon in
  [#24455](https://github.com/google-gemini/gemini-cli/pull/24455)
- docs(cli): add skill discovery troubleshooting checklist to tutorial by
  @pmenic in [#26018](https://github.com/google-gemini/gemini-cli/pull/26018)
- docs(policy-engine): link to tools reference for tool names and args by
  @Aaxhirrr in [#22081](https://github.com/google-gemini/gemini-cli/pull/22081)
- Fix posting invalid response to a comment by @gundermanc in
  [#26266](https://github.com/google-gemini/gemini-cli/pull/26266)
- fix(cli): prevent informational logs from polluting json output by
  @cocosheng-g in
  [#26264](https://github.com/google-gemini/gemini-cli/pull/26264)
- feat(ui): added microphone and updated placeholder for voice mode by @devr0306
  in [#26270](https://github.com/google-gemini/gemini-cli/pull/26270)
- feat(cli): Add 'list' subcommand to '/commands' by @Jwhyee in
  [#22324](https://github.com/google-gemini/gemini-cli/pull/22324)
- fix(core): ensure tool output cleanup on session deletion for legacy files by
  @cocosheng-g in
  [#26263](https://github.com/google-gemini/gemini-cli/pull/26263)
- Docs: Update Agent Skills documentation by @jkcinouye in
  [#22388](https://github.com/google-gemini/gemini-cli/pull/22388)
- test(acp): add missing coverage for extensions command error paths by
  @sahilkirad in
  [#25313](https://github.com/google-gemini/gemini-cli/pull/25313)
- Changelog for v0.40.0 by @gemini-cli-robot in
  [#26245](https://github.com/google-gemini/gemini-cli/pull/26245)
- fix: report AgentExecutionBlocked in non-interactive programmatic modes by
  @cocosheng-g in
  [#26262](https://github.com/google-gemini/gemini-cli/pull/26262)
- feat(extensions): add 'delete' as an alias for /extensions uninstall by
  @martin-hsu-test in
  [#25660](https://github.com/google-gemini/gemini-cli/pull/25660)
- fix(core): silently skip GEMINI.md paths that are directories (EISDIR) by
  @martin-hsu-test in
  [#25662](https://github.com/google-gemini/gemini-cli/pull/25662)
- fix(ci): checkout PR branch instead of main in bot workflow by @gundermanc in
  [#26289](https://github.com/google-gemini/gemini-cli/pull/26289)
- fix(cli): use resolved sandbox state for auto-update check by @Adib234 in
  [#26285](https://github.com/google-gemini/gemini-cli/pull/26285)
- # Metrics Integrity & Standardized Reporting (BT-01) by @.github/workflows/gemini-cli-bot-pulse.yml[bot] in [#26240](https://github.com/google-gemini/gemini-cli/pull/26240)
- Add Star History section to README by @bdmorgan in
  [#26290](https://github.com/google-gemini/gemini-cli/pull/26290)
- Add Star History section to README by @bdmorgan in
  [#26308](https://github.com/google-gemini/gemini-cli/pull/26308)
- Remove Star History section from README by @bdmorgan in
  [#26309](https://github.com/google-gemini/gemini-cli/pull/26309)
- test(evals): add behavioral eval for file creation and write_file tool
  selection by @akh64bit in
  [#26292](https://github.com/google-gemini/gemini-cli/pull/26292)
- feat(config): enable Gemma 4 models by default via Gemini API by @Abhijit-2592
  in [#26307](https://github.com/google-gemini/gemini-cli/pull/26307)
- fix(cli): insert voice transcription at cursor position instead of ap… by
  @Zheyuan-Lin in
  [#26287](https://github.com/google-gemini/gemini-cli/pull/26287)
- fix(ui): fix issue with box edges by @gundermanc in
  [#26148](https://github.com/google-gemini/gemini-cli/pull/26148)
- fix(cli): respect .env override for GOOGLE_CLOUD_PROJECT by @DavidAPierce in
  [#26288](https://github.com/google-gemini/gemini-cli/pull/26288)
- fix(ci): robust version checking in release verification by @scidomino in
  [#26337](https://github.com/google-gemini/gemini-cli/pull/26337)
- fix(cli): enable daemon relaunch in binary and bundle keytar by @ruomengz in
  [#26333](https://github.com/google-gemini/gemini-cli/pull/26333)
- fix(core): discourage unprompted git add . in prompt snippets by @akh64bit in
  [#26220](https://github.com/google-gemini/gemini-cli/pull/26220)
- feat(ui): added wave animation for voice mode by @devr0306 in
  [#26284](https://github.com/google-gemini/gemini-cli/pull/26284)
- fix(cli): prevent Escape from clearing input buffer (#17083) by @cocosheng-g
  in [#26339](https://github.com/google-gemini/gemini-cli/pull/26339)
- fix(cli): undeprecate --prompt and correct positional query docs by @Adib234
  in [#26329](https://github.com/google-gemini/gemini-cli/pull/26329)
- Metrics updates by @.github/workflows/gemini-cli-bot-pulse.yml[bot] in
  [#26348](https://github.com/google-gemini/gemini-cli/pull/26348)
- fix(core): remove "System: Please continue." injection on InvalidStream events
  by @SandyTao520 in
  [#26340](https://github.com/google-gemini/gemini-cli/pull/26340)
- docs(policy-engine): add tool argument keys reference and shell policy
  cross-links by @harshpujari in
  [#25292](https://github.com/google-gemini/gemini-cli/pull/25292)
- fix(cli): resolve Ghostty/raw-mode False Cancellation in oauth flow by
  @Aarchi-07 in [#25026](https://github.com/google-gemini/gemini-cli/pull/25026)
- fix(core): reset session-scoped state on resumption by @cocosheng-g in
  [#26342](https://github.com/google-gemini/gemini-cli/pull/26342)
- Fix bulk of remaining issues with generalist profile by @joshualitt in
  [#26073](https://github.com/google-gemini/gemini-cli/pull/26073)
- fix(core): make subagents aware of active approval modes by @akh64bit in
  [#23608](https://github.com/google-gemini/gemini-cli/pull/23608)
- fix(acp): resolve agent mode disconnect and improve mode awareness by @sripasg
  in [#26332](https://github.com/google-gemini/gemini-cli/pull/26332)
- docs(sdk): add JSDoc to exported interfaces in packages/sdk/src/types.ts by
  @cocosheng-g in
  [#26441](https://github.com/google-gemini/gemini-cli/pull/26441)
- perf: skip redundant GEMINI.md loading in partialConfig by @cocosheng-g in
  [#26443](https://github.com/google-gemini/gemini-cli/pull/26443)
- Enhance React guidelines by @psinha40898 in
  [#22667](https://github.com/google-gemini/gemini-cli/pull/22667)
- feat(core): reinforce Inquiry constraints to prevent unauthorized changes by
  @akh64bit in [#26310](https://github.com/google-gemini/gemini-cli/pull/26310)
- revert: fix(ci): robust version checking in release verification (#26337) by
  @scidomino in [#26450](https://github.com/google-gemini/gemini-cli/pull/26450)
- refactor(UI): created constants file for ThemeDialog by @devr0306 in
  [#26446](https://github.com/google-gemini/gemini-cli/pull/26446)
- docs: fix GitHub capitalization in releases guide by @haosenwang1018 in
  [#26379](https://github.com/google-gemini/gemini-cli/pull/26379)
- fix(cli): ensure branch indicator updates in sub-directories and worktrees by
  @Adib234 in [#26330](https://github.com/google-gemini/gemini-cli/pull/26330)
- feat: add minimal V8 heap snapshot utility for memory diagnostics by
  @cocosheng-g in
  [#26440](https://github.com/google-gemini/gemini-cli/pull/26440)
- fix(hooks): preserve non-text parts in fromHookLLMRequest by @SandyTao520 in
  [#26275](https://github.com/google-gemini/gemini-cli/pull/26275)
- fix(cli): allow early stdout when config is undefined by @cocosheng-g in
  [#26453](https://github.com/google-gemini/gemini-cli/pull/26453)
- fix(cli)#21297: clear skills consent dialog before reload by @manavmax in
  [#26431](https://github.com/google-gemini/gemini-cli/pull/26431)
- fix(cli): render LaTeX-style output as Unicode in the TUI by @dimssu in
  [#25802](https://github.com/google-gemini/gemini-cli/pull/25802)
- fix(core): use close event instead of exit in child_process fallback by
  @tusaryan in [#25695](https://github.com/google-gemini/gemini-cli/pull/25695)
- feat(voice): add privacy and compliance UX warning for Gemini Live backend by
  @cocosheng-g in
  [#26454](https://github.com/google-gemini/gemini-cli/pull/26454)
- feat(memory): add Auto Memory inbox flow with canonical-patch contract by
  @SandyTao520 in
  [#26338](https://github.com/google-gemini/gemini-cli/pull/26338)
- test(cleanup): fix temporary directory leaks in test suites by @Adib234 in
  [#26217](https://github.com/google-gemini/gemini-cli/pull/26217)
- feat: add ignoreLocalEnv setting and --ignore-env flag (#2493) by @cocosheng-g
  in [#26445](https://github.com/google-gemini/gemini-cli/pull/26445)
- docs(sdk): add JSDoc to all exported interfaces and types by @fauzan171 in
  [#26277](https://github.com/google-gemini/gemini-cli/pull/26277)
- feat(cli): improve /agents refresh logging by @cocosheng-g in
  [#26442](https://github.com/google-gemini/gemini-cli/pull/26442)
- Fix: make Dockerfile self-contained with multi-stage build by @Famous077 in
  [#24277](https://github.com/google-gemini/gemini-cli/pull/24277)
- fix(core): filter unsupported multimodal types from tool responses by
  @aishaneeshah in
  [#26352](https://github.com/google-gemini/gemini-cli/pull/26352)
- fix(core): properly format markdown in AskUser tool by unescaping newlines by
  @Adib234 in [#26349](https://github.com/google-gemini/gemini-cli/pull/26349)
- feat(bot): add actions spend metric script by @gundermanc in
  [#26463](https://github.com/google-gemini/gemini-cli/pull/26463)
- feat(cli): add /bug-memory command and auto-capture heap snapshot in /bug by
  @Anjaligarhwal in
  [#25639](https://github.com/google-gemini/gemini-cli/pull/25639)
- fix(cli): make SkillInboxDialog fit and scroll in alternate buffer by
  @SandyTao520 in
  [#26455](https://github.com/google-gemini/gemini-cli/pull/26455)
- Robust Scale-Safe Lifecycle Consolidation by @gemini-cli-robot in
  [#26355](https://github.com/google-gemini/gemini-cli/pull/26355)
- fix(ci): respect exempt labels when closing stale items by @gundermanc in
  [#26475](https://github.com/google-gemini/gemini-cli/pull/26475)
- fix(cli): use os.homedir() for home directory warning check by @TirthNaik-99
  in [#25890](https://github.com/google-gemini/gemini-cli/pull/25890)
- fix(a2a-server): resolve tool approval race condition and improve status
  reporting by @kschaab in
  [#26479](https://github.com/google-gemini/gemini-cli/pull/26479)
- fix(cli): prevent settings dialog border clipping using maxHeight by
  @jackwotherspoon in
  [#26507](https://github.com/google-gemini/gemini-cli/pull/26507)
- feat: allow queuing messages during compression (#24071) by @cocosheng-g in
  [#26506](https://github.com/google-gemini/gemini-cli/pull/26506)
- fix(core): retry on ERR_STREAM_PREMATURE_CLOSE errors by @cocosheng-g in
  [#26519](https://github.com/google-gemini/gemini-cli/pull/26519)
- fix(core): Minor fixes for generalist profile. by @joshualitt in
  [#26357](https://github.com/google-gemini/gemini-cli/pull/26357)
- fix(patch): cherry-pick 3627f47 to release/v0.42.0-preview.0-pr-26542 to patch
  version v0.42.0-preview.0 and create version 0.42.0-preview.1 by
  @gemini-cli-robot in
  [#26544](https://github.com/google-gemini/gemini-cli/pull/26544)
- fix(patch): cherry-pick 02995ba to release/v0.42.0-preview.1-pr-26568 to patch
  version v0.42.0-preview.1 and create version 0.42.0-preview.2 by
  @gemini-cli-robot in
  [#26590](https://github.com/google-gemini/gemini-cli/pull/26590)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.41.2...v0.42.0
