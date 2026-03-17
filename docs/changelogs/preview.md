# Preview release: v0.35.0-preview.1

Released: March 17, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Plan Mode Enabled by Default:** Plan Mode is now enabled out-of-the-box,
  providing a structured planning workflow and keeping approved plans during
  chat compression.
- **Sandboxing Enhancements:** Added experimental LXC container sandbox support
  and native gVisor (`runsc`) sandboxing for improved security and isolation.
- **Tracker Visualization and Tools:** Introduced CRUD tools and visualization
  for trackers, along with task tracker strategy improvements.
- **Browser Agent Improvements:** Enhanced the browser agent with progress
  emission, a new automation overlay, and additional integration tests.
- **CLI and UI Updates:** Standardized semantic focus colors, polished shell
  autocomplete rendering, unified keybinding infrastructure, and added custom
  footer configuration options.

## What's Changed

- feat(cli): customizable keyboard shortcuts by @scidomino in
  [#21945](https://github.com/google-gemini/gemini-cli/pull/21945)
- feat(core): Thread `AgentLoopContext` through core. by @joshualitt in
  [#21944](https://github.com/google-gemini/gemini-cli/pull/21944)
- chore(release): bump version to 0.35.0-nightly.20260311.657f19c1f by
  @gemini-cli-robot in
  [#21966](https://github.com/google-gemini/gemini-cli/pull/21966)
- refactor(a2a): remove legacy CoreToolScheduler by @adamfweidman in
  [#21955](https://github.com/google-gemini/gemini-cli/pull/21955)
- feat(ui): add missing vim mode motions (X, ~, r, f/F/t/T, df/dt and friends)
  by @aanari in [#21932](https://github.com/google-gemini/gemini-cli/pull/21932)
- Feat/retry fetch notifications by @aishaneeshah in
  [#21813](https://github.com/google-gemini/gemini-cli/pull/21813)
- fix(core): remove OAuth check from handleFallback and clean up stray file by
  @sehoon38 in [#21962](https://github.com/google-gemini/gemini-cli/pull/21962)
- feat(cli): support literal character keybindings and extended Kitty protocol
  keys by @scidomino in
  [#21972](https://github.com/google-gemini/gemini-cli/pull/21972)
- fix(ui): clamp cursor to last char after all NORMAL mode deletes by @aanari in
  [#21973](https://github.com/google-gemini/gemini-cli/pull/21973)
- test(core): add missing tests for prompts/utils.ts by @krrishverma1805-web in
  [#19941](https://github.com/google-gemini/gemini-cli/pull/19941)
- fix(cli): allow scrolling keys in copy mode (Ctrl+S selection mode) by
  @nsalerni in [#19933](https://github.com/google-gemini/gemini-cli/pull/19933)
- docs(cli): add custom keybinding documentation by @scidomino in
  [#21980](https://github.com/google-gemini/gemini-cli/pull/21980)
- docs: fix misleading YOLO mode description in defaultApprovalMode by
  @Gyanranjan-Priyam in
  [#21878](https://github.com/google-gemini/gemini-cli/pull/21878)
- fix: clean up /clear and /resume by @jackwotherspoon in
  [#22007](https://github.com/google-gemini/gemini-cli/pull/22007)
- fix(core)#20941: reap orphaned descendant processes on PTY abort by @manavmax
  in [#21124](https://github.com/google-gemini/gemini-cli/pull/21124)
- fix(core): update language detection to use LSP 3.18 identifiers by @yunaseoul
  in [#21931](https://github.com/google-gemini/gemini-cli/pull/21931)
- feat(cli): support removing keybindings via '-' prefix by @scidomino in
  [#22042](https://github.com/google-gemini/gemini-cli/pull/22042)
- feat(policy): add --admin-policy flag for supplemental admin policies by
  @galz10 in [#20360](https://github.com/google-gemini/gemini-cli/pull/20360)
- merge duplicate imports packages/cli/src subtask1 by @Nixxx19 in
  [#22040](https://github.com/google-gemini/gemini-cli/pull/22040)
- perf(core): parallelize user quota and experiments fetching in refreshAuth by
  @sehoon38 in [#21648](https://github.com/google-gemini/gemini-cli/pull/21648)
- Changelog for v0.34.0-preview.0 by @gemini-cli-robot in
  [#21965](https://github.com/google-gemini/gemini-cli/pull/21965)
- Changelog for v0.33.0 by @gemini-cli-robot in
  [#21967](https://github.com/google-gemini/gemini-cli/pull/21967)
- fix(core): handle EISDIR in robustRealpath on Windows by @sehoon38 in
  [#21984](https://github.com/google-gemini/gemini-cli/pull/21984)
- feat(core): include initiationMethod in conversation interaction telemetry by
  @yunaseoul in [#22054](https://github.com/google-gemini/gemini-cli/pull/22054)
- feat(ui): add vim yank/paste (y/p/P) with unnamed register by @aanari in
  [#22026](https://github.com/google-gemini/gemini-cli/pull/22026)
- fix(core): enable numerical routing for api key users by @sehoon38 in
  [#21977](https://github.com/google-gemini/gemini-cli/pull/21977)
- feat(telemetry): implement retry attempt telemetry for network related retries
  by @aishaneeshah in
  [#22027](https://github.com/google-gemini/gemini-cli/pull/22027)
- fix(policy): remove unnecessary escapeRegex from pattern builders by
  @spencer426 in
  [#21921](https://github.com/google-gemini/gemini-cli/pull/21921)
- fix(core): preserve dynamic tool descriptions on session resume by @sehoon38
  in [#18835](https://github.com/google-gemini/gemini-cli/pull/18835)
- chore: allow 'gemini-3.1' in sensitive keyword linter by @scidomino in
  [#22065](https://github.com/google-gemini/gemini-cli/pull/22065)
- feat(core): support custom base URL via env vars by @junaiddshaukat in
  [#21561](https://github.com/google-gemini/gemini-cli/pull/21561)
- merge duplicate imports packages/cli/src subtask2 by @Nixxx19 in
  [#22051](https://github.com/google-gemini/gemini-cli/pull/22051)
- fix(core): silently retry API errors up to 3 times before halting session by
  @spencer426 in
  [#21989](https://github.com/google-gemini/gemini-cli/pull/21989)
- feat(core): simplify subagent success UI and improve early termination display
  by @abhipatel12 in
  [#21917](https://github.com/google-gemini/gemini-cli/pull/21917)
- merge duplicate imports packages/cli/src subtask3 by @Nixxx19 in
  [#22056](https://github.com/google-gemini/gemini-cli/pull/22056)
- fix(hooks): fix BeforeAgent/AfterAgent inconsistencies (#18514) by @krishdef7
  in [#21383](https://github.com/google-gemini/gemini-cli/pull/21383)
- feat(core): implement SandboxManager interface and config schema by @galz10 in
  [#21774](https://github.com/google-gemini/gemini-cli/pull/21774)
- docs: document npm deprecation warnings as safe to ignore by @h30s in
  [#20692](https://github.com/google-gemini/gemini-cli/pull/20692)
- fix: remove status/need-triage from maintainer-only issues by @SandyTao520 in
  [#22044](https://github.com/google-gemini/gemini-cli/pull/22044)
- fix(core): propagate subagent context to policy engine by @NTaylorMullen in
  [#22086](https://github.com/google-gemini/gemini-cli/pull/22086)
- fix(cli): resolve skill uninstall failure when skill name is updated by
  @NTaylorMullen in
  [#22085](https://github.com/google-gemini/gemini-cli/pull/22085)
- docs(plan): clarify interactive plan editing with Ctrl+X by @Adib234 in
  [#22076](https://github.com/google-gemini/gemini-cli/pull/22076)
- fix(policy): ensure user policies are loaded when policyPaths is empty by
  @NTaylorMullen in
  [#22090](https://github.com/google-gemini/gemini-cli/pull/22090)
- Docs: Add documentation for model steering (experimental). by @jkcinouye in
  [#21154](https://github.com/google-gemini/gemini-cli/pull/21154)
- Add issue for automated changelogs by @g-samroberts in
  [#21912](https://github.com/google-gemini/gemini-cli/pull/21912)
- fix(core): secure argsPattern and revert WEB_FETCH_TOOL_NAME escalation by
  @spencer426 in
  [#22104](https://github.com/google-gemini/gemini-cli/pull/22104)
- feat(core): differentiate User-Agent for a2a-server and ACP clients by
  @bdmorgan in [#22059](https://github.com/google-gemini/gemini-cli/pull/22059)
- refactor(core): extract ExecutionLifecycleService for tool backgrounding by
  @adamfweidman in
  [#21717](https://github.com/google-gemini/gemini-cli/pull/21717)
- feat: Display pending and confirming tool calls by @sripasg in
  [#22106](https://github.com/google-gemini/gemini-cli/pull/22106)
- feat(browser): implement input blocker overlay during automation by
  @kunal-10-cloud in
  [#21132](https://github.com/google-gemini/gemini-cli/pull/21132)
- fix: register themes on extension load not start by @jackwotherspoon in
  [#22148](https://github.com/google-gemini/gemini-cli/pull/22148)
- feat(ui): Do not show Ultra users /upgrade hint (#22154) by @sehoon38 in
  [#22156](https://github.com/google-gemini/gemini-cli/pull/22156)
- chore: remove unnecessary log for themes by @jackwotherspoon in
  [#22165](https://github.com/google-gemini/gemini-cli/pull/22165)
- fix(core): resolve MCP tool FQN validation, schema export, and wildcards in
  subagents by @abhipatel12 in
  [#22069](https://github.com/google-gemini/gemini-cli/pull/22069)
- fix(cli): validate --model argument at startup by @JaisalJain in
  [#21393](https://github.com/google-gemini/gemini-cli/pull/21393)
- fix(core): handle policy ALLOW for exit_plan_mode by @backnotprop in
  [#21802](https://github.com/google-gemini/gemini-cli/pull/21802)
- feat(telemetry): add Clearcut instrumentation for AI credits billing events by
  @gsquared94 in
  [#22153](https://github.com/google-gemini/gemini-cli/pull/22153)
- feat(core): add google credentials provider for remote agents by @adamfweidman
  in [#21024](https://github.com/google-gemini/gemini-cli/pull/21024)
- test(cli): add integration test for node deprecation warnings by @Nixxx19 in
  [#20215](https://github.com/google-gemini/gemini-cli/pull/20215)
- feat(cli): allow safe tools to execute concurrently while agent is busy by
  @spencer426 in
  [#21988](https://github.com/google-gemini/gemini-cli/pull/21988)
- feat(core): implement model-driven parallel tool scheduler by @abhipatel12 in
  [#21933](https://github.com/google-gemini/gemini-cli/pull/21933)
- update vulnerable deps by @scidomino in
  [#22180](https://github.com/google-gemini/gemini-cli/pull/22180)
- fix(core): fix startup stats to use int values for timestamps and durations by
  @yunaseoul in [#22201](https://github.com/google-gemini/gemini-cli/pull/22201)
- fix(core): prevent duplicate tool schemas for instantiated tools by
  @abhipatel12 in
  [#22204](https://github.com/google-gemini/gemini-cli/pull/22204)
- fix(core): add proxy routing support for remote A2A subagents by @adamfweidman
  in [#22199](https://github.com/google-gemini/gemini-cli/pull/22199)
- fix(core/ide): add Antigravity CLI fallbacks by @apfine in
  [#22030](https://github.com/google-gemini/gemini-cli/pull/22030)
- fix(browser): fix duplicate function declaration error in browser agent by
  @gsquared94 in
  [#22207](https://github.com/google-gemini/gemini-cli/pull/22207)
- feat(core): implement Stage 1 improvements for webfetch tool by @aishaneeshah
  in [#21313](https://github.com/google-gemini/gemini-cli/pull/21313)
- Changelog for v0.34.0-preview.1 by @gemini-cli-robot in
  [#22194](https://github.com/google-gemini/gemini-cli/pull/22194)
- perf(cli): enable code splitting and deferred UI loading by @sehoon38 in
  [#22117](https://github.com/google-gemini/gemini-cli/pull/22117)
- fix: remove unused img.png from project root by @SandyTao520 in
  [#22222](https://github.com/google-gemini/gemini-cli/pull/22222)
- docs(local model routing): add docs on how to use Gemma for local model
  routing by @douglas-reid in
  [#21365](https://github.com/google-gemini/gemini-cli/pull/21365)
- feat(a2a): enable native gRPC support and protocol routing by @alisa-alisa in
  [#21403](https://github.com/google-gemini/gemini-cli/pull/21403)
- fix(cli): escape @ symbols on paste to prevent unintended file expansion by
  @krishdef7 in [#21239](https://github.com/google-gemini/gemini-cli/pull/21239)
- feat(core): add trajectoryId to ConversationOffered telemetry by @yunaseoul in
  [#22214](https://github.com/google-gemini/gemini-cli/pull/22214)
- docs: clarify that tools.core is an allowlist for ALL built-in tools by
  @hobostay in [#18813](https://github.com/google-gemini/gemini-cli/pull/18813)
- docs(plan): document hooks with plan mode by @ruomengz in
  [#22197](https://github.com/google-gemini/gemini-cli/pull/22197)
- Changelog for v0.33.1 by @gemini-cli-robot in
  [#22235](https://github.com/google-gemini/gemini-cli/pull/22235)
- build(ci): fix false positive evals trigger on merge commits by @gundermanc in
  [#22237](https://github.com/google-gemini/gemini-cli/pull/22237)
- fix(core): explicitly pass messageBus to policy engine for MCP tool saves by
  @abhipatel12 in
  [#22255](https://github.com/google-gemini/gemini-cli/pull/22255)
- feat(core): Fully migrate packages/core to AgentLoopContext. by @joshualitt in
  [#22115](https://github.com/google-gemini/gemini-cli/pull/22115)
- feat(core): increase sub-agent turn and time limits by @bdmorgan in
  [#22196](https://github.com/google-gemini/gemini-cli/pull/22196)
- feat(core): instrument file system tools for JIT context discovery by
  @SandyTao520 in
  [#22082](https://github.com/google-gemini/gemini-cli/pull/22082)
- refactor(ui): extract pure session browser utilities by @abhipatel12 in
  [#22256](https://github.com/google-gemini/gemini-cli/pull/22256)
- fix(plan): Fix AskUser evals by @Adib234 in
  [#22074](https://github.com/google-gemini/gemini-cli/pull/22074)
- fix(settings): prevent j/k navigation keys from intercepting edit buffer input
  by @student-ankitpandit in
  [#21865](https://github.com/google-gemini/gemini-cli/pull/21865)
- feat(skills): improve async-pr-review workflow and logging by @mattKorwel in
  [#21790](https://github.com/google-gemini/gemini-cli/pull/21790)
- refactor(cli): consolidate getErrorMessage utility to core by @scidomino in
  [#22190](https://github.com/google-gemini/gemini-cli/pull/22190)
- fix(core): show descriptive error messages when saving settings fails by
  @afarber in [#18095](https://github.com/google-gemini/gemini-cli/pull/18095)
- docs(core): add authentication guide for remote subagents by @adamfweidman in
  [#22178](https://github.com/google-gemini/gemini-cli/pull/22178)
- docs: overhaul subagents documentation and add /agents command by @abhipatel12
  in [#22345](https://github.com/google-gemini/gemini-cli/pull/22345)
- refactor(ui): extract SessionBrowser static ui components by @abhipatel12 in
  [#22348](https://github.com/google-gemini/gemini-cli/pull/22348)
- test: add Object.create context regression test and tool confirmation
  integration test by @gsquared94 in
  [#22356](https://github.com/google-gemini/gemini-cli/pull/22356)
- feat(tracker): return TodoList display for tracker tools by @anj-s in
  [#22060](https://github.com/google-gemini/gemini-cli/pull/22060)
- feat(agent): add allowed domain restrictions for browser agent by
  @cynthialong0-0 in
  [#21775](https://github.com/google-gemini/gemini-cli/pull/21775)
- chore/release: bump version to 0.35.0-nightly.20260313.bb060d7a9 by
  @gemini-cli-robot in
  [#22251](https://github.com/google-gemini/gemini-cli/pull/22251)
- Move keychain fallback to keychain service by @chrstnb in
  [#22332](https://github.com/google-gemini/gemini-cli/pull/22332)
- feat(core): integrate SandboxManager to sandbox all process-spawning tools by
  @galz10 in [#22231](https://github.com/google-gemini/gemini-cli/pull/22231)
- fix(cli): support CJK input and full Unicode scalar values in terminal
  protocols by @scidomino in
  [#22353](https://github.com/google-gemini/gemini-cli/pull/22353)
- Promote stable tests. by @gundermanc in
  [#22253](https://github.com/google-gemini/gemini-cli/pull/22253)
- feat(tracker): add tracker policy by @anj-s in
  [#22379](https://github.com/google-gemini/gemini-cli/pull/22379)
- feat(security): add disableAlwaysAllow setting to disable auto-approvals by
  @galz10 in [#21941](https://github.com/google-gemini/gemini-cli/pull/21941)
- Revert "fix(cli): validate --model argument at startup" by @sehoon38 in
  [#22378](https://github.com/google-gemini/gemini-cli/pull/22378)
- fix(mcp): handle equivalent root resource URLs in OAuth validation by @galz10
  in [#20231](https://github.com/google-gemini/gemini-cli/pull/20231)
- fix(core): use session-specific temp directory for task tracker by @anj-s in
  [#22382](https://github.com/google-gemini/gemini-cli/pull/22382)
- Fix issue where config was undefined. by @gundermanc in
  [#22397](https://github.com/google-gemini/gemini-cli/pull/22397)
- fix(core): deduplicate project memory when JIT context is enabled by
  @SandyTao520 in
  [#22234](https://github.com/google-gemini/gemini-cli/pull/22234)
- feat(prompts): implement Topic-Action-Summary model for verbosity reduction by
  @Abhijit-2592 in
  [#21503](https://github.com/google-gemini/gemini-cli/pull/21503)
- fix(core): fix manual deletion of subagent histories by @abhipatel12 in
  [#22407](https://github.com/google-gemini/gemini-cli/pull/22407)
- Add registry var by @kevinjwang1 in
  [#22224](https://github.com/google-gemini/gemini-cli/pull/22224)
- Add ModelDefinitions to ModelConfigService by @kevinjwang1 in
  [#22302](https://github.com/google-gemini/gemini-cli/pull/22302)
- fix(cli): improve command conflict handling for skills by @NTaylorMullen in
  [#21942](https://github.com/google-gemini/gemini-cli/pull/21942)
- fix(core): merge user settings with extension-provided MCP servers by
  @abhipatel12 in
  [#22484](https://github.com/google-gemini/gemini-cli/pull/22484)
- fix(core): skip discovery for incomplete MCP configs and resolve merge race
  condition by @abhipatel12 in
  [#22494](https://github.com/google-gemini/gemini-cli/pull/22494)
- fix(automation): harden stale PR closer permissions and maintainer detection
  by @bdmorgan in
  [#22558](https://github.com/google-gemini/gemini-cli/pull/22558)
- fix(automation): evaluate staleness before checking protected labels by
  @bdmorgan in [#22561](https://github.com/google-gemini/gemini-cli/pull/22561)
- feat(agent): replace the runtime npx for browser agent chrome devtool mcp with
  pre-built bundle by @cynthialong0-0 in
  [#22213](https://github.com/google-gemini/gemini-cli/pull/22213)
- perf: optimize TrackerService dependency checks by @anj-s in
  [#22384](https://github.com/google-gemini/gemini-cli/pull/22384)
- docs(policy): remove trailing space from commandPrefix examples by @kawasin73
  in [#22264](https://github.com/google-gemini/gemini-cli/pull/22264)
- fix(a2a-server): resolve unsafe assignment lint errors by @ehedlund in
  [#22661](https://github.com/google-gemini/gemini-cli/pull/22661)
- fix: Adjust ToolGroupMessage filtering to hide Confirming and show Canceled
  tool calls. by @sripasg in
  [#22230](https://github.com/google-gemini/gemini-cli/pull/22230)
- Disallow Object.create() and reflect. by @gundermanc in
  [#22408](https://github.com/google-gemini/gemini-cli/pull/22408)
- Guard pro model usage by @sehoon38 in
  [#22665](https://github.com/google-gemini/gemini-cli/pull/22665)
- refactor(core): Creates AgentSession abstraction for consolidated agent
  interface. by @mbleigh in
  [#22270](https://github.com/google-gemini/gemini-cli/pull/22270)
- docs(changelog): remove internal commands from release notes by
  @jackwotherspoon in
  [#22529](https://github.com/google-gemini/gemini-cli/pull/22529)
- feat: enable subagents by @abhipatel12 in
  [#22386](https://github.com/google-gemini/gemini-cli/pull/22386)
- feat(extensions): implement cryptographic integrity verification for extension
  updates by @ehedlund in
  [#21772](https://github.com/google-gemini/gemini-cli/pull/21772)
- feat(tracker): polish UI sorting and formatting by @anj-s in
  [#22437](https://github.com/google-gemini/gemini-cli/pull/22437)
- Changelog for v0.34.0-preview.2 by @gemini-cli-robot in
  [#22220](https://github.com/google-gemini/gemini-cli/pull/22220)
- fix(core): fix three JIT context bugs in read_file, read_many_files, and
  memoryDiscovery by @SandyTao520 in
  [#22679](https://github.com/google-gemini/gemini-cli/pull/22679)
- refactor(core): introduce InjectionService with source-aware injection and
  backend-native background completions by @adamfweidman in
  [#22544](https://github.com/google-gemini/gemini-cli/pull/22544)
- Linux sandbox bubblewrap by @DavidAPierce in
  [#22680](https://github.com/google-gemini/gemini-cli/pull/22680)
- feat(core): increase thought signature retry resilience by @bdmorgan in
  [#22202](https://github.com/google-gemini/gemini-cli/pull/22202)
- feat(core): implement Stage 2 security and consistency improvements for
  web_fetch by @aishaneeshah in
  [#22217](https://github.com/google-gemini/gemini-cli/pull/22217)
- refactor(core): replace positional execute params with ExecuteOptions bag by
  @adamfweidman in
  [#22674](https://github.com/google-gemini/gemini-cli/pull/22674)
- feat(config): enable JIT context loading by default by @SandyTao520 in
  [#22736](https://github.com/google-gemini/gemini-cli/pull/22736)
- fix(config): ensure discoveryMaxDirs is passed to global config during
  initialization by @kevin-ramdass in
  [#22744](https://github.com/google-gemini/gemini-cli/pull/22744)
- fix(plan): allowlist get_internal_docs in Plan Mode by @Adib234 in
  [#22668](https://github.com/google-gemini/gemini-cli/pull/22668)
- Changelog for v0.34.0-preview.3 by @gemini-cli-robot in
  [#22393](https://github.com/google-gemini/gemini-cli/pull/22393)
- feat(core): add foundation for subagent tool isolation by @akh64bit in
  [#22708](https://github.com/google-gemini/gemini-cli/pull/22708)
- fix(core): handle surrogate pairs in truncateString by @sehoon38 in
  [#22754](https://github.com/google-gemini/gemini-cli/pull/22754)
- fix(cli): override j/k navigation in settings dialog to fix search input
  conflict by @sehoon38 in
  [#22800](https://github.com/google-gemini/gemini-cli/pull/22800)
- feat(plan): add 'All the above' option to multi-select AskUser questions by
  @Adib234 in [#22365](https://github.com/google-gemini/gemini-cli/pull/22365)
- docs: distribute package-specific GEMINI.md context to each package by
  @SandyTao520 in
  [#22734](https://github.com/google-gemini/gemini-cli/pull/22734)
- fix(cli): clean up stale pasted placeholder metadata after word/line deletions
  by @Jomak-x in
  [#20375](https://github.com/google-gemini/gemini-cli/pull/20375)
- refactor(core): align JIT memory placement with tiered context model by
  @SandyTao520 in
  [#22766](https://github.com/google-gemini/gemini-cli/pull/22766)
- Linux sandbox seccomp by @DavidAPierce in
  [#22815](https://github.com/google-gemini/gemini-cli/pull/22815)
- fix(patch): cherry-pick 24adacd to release/v0.34.0-preview.2-pr-22332 to patch
  version v0.34.0-preview.2 and create version 0.34.0-preview.3 by
  @gemini-cli-robot in
  [#22391](https://github.com/google-gemini/gemini-cli/pull/22391)
- fix(patch): cherry-pick 8432bce to release/v0.34.0-preview.1-pr-22069 to patch
  version v0.34.0-preview.1 and create version 0.34.0-preview.2 by
  @gemini-cli-robot in
  [#22205](https://github.com/google-gemini/gemini-cli/pull/22205)
- fix(patch): cherry-pick 45faf4d to release/v0.34.0-preview.0-pr-22148
  [CONFLICTS] by @gemini-cli-robot in
  [#22174](https://github.com/google-gemini/gemini-cli/pull/22174)
- feat(cli): add chat resume footer on session quit by @lordshashank in
  [#20667](https://github.com/google-gemini/gemini-cli/pull/20667)
- Support bold and other styles in svg snapshots by @jacob314 in
  [#20937](https://github.com/google-gemini/gemini-cli/pull/20937)
- fix(core): increase A2A agent timeout to 30 minutes by @adamfweidman in
  [#21028](https://github.com/google-gemini/gemini-cli/pull/21028)
- Cleanup old branches. by @jacob314 in
  [#19354](https://github.com/google-gemini/gemini-cli/pull/19354)
- chore(release): bump version to 0.34.0-nightly.20260303.34f0c1538 by
  @gemini-cli-robot in
  [#21034](https://github.com/google-gemini/gemini-cli/pull/21034)
- feat(ui): standardize semantic focus colors and enhance history visibility by
  @keithguerin in
  [#20745](https://github.com/google-gemini/gemini-cli/pull/20745)
- fix: merge duplicate imports in packages/core (3/4) by @Nixxx19 in
  [#20928](https://github.com/google-gemini/gemini-cli/pull/20928)
- Add extra safety checks for proto pollution by @jacob314 in
  [#20396](https://github.com/google-gemini/gemini-cli/pull/20396)
- feat(core): Add tracker CRUD tools & visualization by @anj-s in
  [#19489](https://github.com/google-gemini/gemini-cli/pull/19489)
- Revert "fix(ui): persist expansion in AskUser dialog when navigating options"
  by @jacob314 in
  [#21042](https://github.com/google-gemini/gemini-cli/pull/21042)
- Changelog for v0.33.0-preview.0 by @gemini-cli-robot in
  [#21030](https://github.com/google-gemini/gemini-cli/pull/21030)
- fix: model persistence for all scenarios by @sripasg in
  [#21051](https://github.com/google-gemini/gemini-cli/pull/21051)
- chore/release: bump version to 0.34.0-nightly.20260304.28af4e127 by
  @gemini-cli-robot in
  [#21054](https://github.com/google-gemini/gemini-cli/pull/21054)
- Consistently guard restarts against concurrent auto updates by @scidomino in
  [#21016](https://github.com/google-gemini/gemini-cli/pull/21016)
- Defensive coding to reduce the risk of Maximum update depth errors by
  @jacob314 in [#20940](https://github.com/google-gemini/gemini-cli/pull/20940)
- fix(cli): Polish shell autocomplete rendering to be a little more shell native
  feeling. by @jacob314 in
  [#20931](https://github.com/google-gemini/gemini-cli/pull/20931)
- Docs: Update plan mode docs by @jkcinouye in
  [#19682](https://github.com/google-gemini/gemini-cli/pull/19682)
- fix(mcp): Notifications/tools/list_changed support not working by @jacob314 in
  [#21050](https://github.com/google-gemini/gemini-cli/pull/21050)
- fix(cli): register extension lifecycle events in DebugProfiler by
  @fayerman-source in
  [#20101](https://github.com/google-gemini/gemini-cli/pull/20101)
- chore(dev): update vscode settings for typescriptreact by @rohit-4321 in
  [#19907](https://github.com/google-gemini/gemini-cli/pull/19907)
- fix(cli): enable multi-arch docker builds for sandbox by @ru-aish in
  [#19821](https://github.com/google-gemini/gemini-cli/pull/19821)
- Changelog for v0.32.0 by @gemini-cli-robot in
  [#21033](https://github.com/google-gemini/gemini-cli/pull/21033)
- Changelog for v0.33.0-preview.1 by @gemini-cli-robot in
  [#21058](https://github.com/google-gemini/gemini-cli/pull/21058)
- feat(core): improve @scripts/copy_files.js autocomplete to prioritize
  filenames by @sehoon38 in
  [#21064](https://github.com/google-gemini/gemini-cli/pull/21064)
- feat(sandbox): add experimental LXC container sandbox support by @h30s in
  [#20735](https://github.com/google-gemini/gemini-cli/pull/20735)
- feat(evals): add overall pass rate row to eval nightly summary table by
  @gundermanc in
  [#20905](https://github.com/google-gemini/gemini-cli/pull/20905)
- feat(telemetry): include language in telemetry and fix accepted lines
  computation by @gundermanc in
  [#21126](https://github.com/google-gemini/gemini-cli/pull/21126)
- Changelog for v0.32.1 by @gemini-cli-robot in
  [#21055](https://github.com/google-gemini/gemini-cli/pull/21055)
- feat(core): add robustness tests, logging, and metrics for CodeAssistServer
  SSE parsing by @yunaseoul in
  [#21013](https://github.com/google-gemini/gemini-cli/pull/21013)
- feat: add issue assignee workflow by @kartikangiras in
  [#21003](https://github.com/google-gemini/gemini-cli/pull/21003)
- fix: improve error message when OAuth succeeds but project ID is required by
  @Nixxx19 in [#21070](https://github.com/google-gemini/gemini-cli/pull/21070)
- feat(loop-reduction): implement iterative loop detection and model feedback by
  @aishaneeshah in
  [#20763](https://github.com/google-gemini/gemini-cli/pull/20763)
- chore(github): require prompt approvers for agent prompt files by @gundermanc
  in [#20896](https://github.com/google-gemini/gemini-cli/pull/20896)
- Docs: Create tools reference by @jkcinouye in
  [#19470](https://github.com/google-gemini/gemini-cli/pull/19470)
- fix(core, a2a-server): prevent hang during OAuth in non-interactive sessions
  by @spencer426 in
  [#21045](https://github.com/google-gemini/gemini-cli/pull/21045)
- chore(cli): enable deprecated settings removal by default by @yashodipmore in
  [#20682](https://github.com/google-gemini/gemini-cli/pull/20682)
- feat(core): Disable fast ack helper for hints. by @joshualitt in
  [#21011](https://github.com/google-gemini/gemini-cli/pull/21011)
- fix(ui): suppress redundant failure note when tool error note is shown by
  @NTaylorMullen in
  [#21078](https://github.com/google-gemini/gemini-cli/pull/21078)
- docs: document planning workflows with Conductor example by @jerop in
  [#21166](https://github.com/google-gemini/gemini-cli/pull/21166)
- feat(release): ship esbuild bundle in npm package by @genneth in
  [#19171](https://github.com/google-gemini/gemini-cli/pull/19171)
- fix(extensions): preserve symlinks in extension source path while enforcing
  folder trust by @galz10 in
  [#20867](https://github.com/google-gemini/gemini-cli/pull/20867)
- fix(cli): defer tool exclusions to policy engine in non-interactive mode by
  @EricRahm in [#20639](https://github.com/google-gemini/gemini-cli/pull/20639)
- fix(ui): removed double padding on rendered content by @devr0306 in
  [#21029](https://github.com/google-gemini/gemini-cli/pull/21029)
- fix(core): truncate excessively long lines in grep search output by
  @gundermanc in
  [#21147](https://github.com/google-gemini/gemini-cli/pull/21147)
- feat: add custom footer configuration via `/footer` by @jackwotherspoon in
  [#19001](https://github.com/google-gemini/gemini-cli/pull/19001)
- perf(core): fix OOM crash in long-running sessions by @WizardsForgeGames in
  [#19608](https://github.com/google-gemini/gemini-cli/pull/19608)
- refactor(cli): categorize built-in themes into dark/ and light/ directories by
  @JayadityaGit in
  [#18634](https://github.com/google-gemini/gemini-cli/pull/18634)
- fix(core): explicitly allow codebase_investigator and cli_help in read-only
  mode by @Adib234 in
  [#21157](https://github.com/google-gemini/gemini-cli/pull/21157)
- test: add browser agent integration tests by @kunal-10-cloud in
  [#21151](https://github.com/google-gemini/gemini-cli/pull/21151)
- fix(cli): fix enabling kitty codes on Windows Terminal by @scidomino in
  [#21136](https://github.com/google-gemini/gemini-cli/pull/21136)
- refactor(core): extract shared OAuth flow primitives from MCPOAuthProvider by
  @SandyTao520 in
  [#20895](https://github.com/google-gemini/gemini-cli/pull/20895)
- fix(ui): add partial output to cancelled shell UI by @devr0306 in
  [#21178](https://github.com/google-gemini/gemini-cli/pull/21178)
- fix(cli): replace hardcoded keybinding strings with dynamic formatters by
  @scidomino in [#21159](https://github.com/google-gemini/gemini-cli/pull/21159)
- DOCS: Update quota and pricing page by @g-samroberts in
  [#21194](https://github.com/google-gemini/gemini-cli/pull/21194)
- feat(telemetry): implement Clearcut logging for startup statistics by
  @yunaseoul in [#21172](https://github.com/google-gemini/gemini-cli/pull/21172)
- feat(triage): add area/documentation to issue triage by @g-samroberts in
  [#21222](https://github.com/google-gemini/gemini-cli/pull/21222)
- Fix so shell calls are formatted by @jacob314 in
  [#21237](https://github.com/google-gemini/gemini-cli/pull/21237)
- feat(cli): add native gVisor (runsc) sandboxing support by @Zheyuan-Lin in
  [#21062](https://github.com/google-gemini/gemini-cli/pull/21062)
- docs: use absolute paths for internal links in plan-mode.md by @jerop in
  [#21299](https://github.com/google-gemini/gemini-cli/pull/21299)
- fix(core): prevent unhandled AbortError crash during stream loop detection by
  @7hokerz in [#21123](https://github.com/google-gemini/gemini-cli/pull/21123)
- fix:reorder env var redaction checks to scan values first by @kartikangiras in
  [#21059](https://github.com/google-gemini/gemini-cli/pull/21059)
- fix(acp): rename --experimental-acp to --acp & remove Zed-specific refrences
  by @skeshive in
  [#21171](https://github.com/google-gemini/gemini-cli/pull/21171)
- feat(core): fallback to 2.5 models with no access for toolcalls by @sehoon38
  in [#21283](https://github.com/google-gemini/gemini-cli/pull/21283)
- test(core): improve testing for API request/response parsing by @sehoon38 in
  [#21227](https://github.com/google-gemini/gemini-cli/pull/21227)
- docs(links): update docs-writer skill and fix broken link by @g-samroberts in
  [#21314](https://github.com/google-gemini/gemini-cli/pull/21314)
- Fix code colorizer ansi escape bug. by @jacob314 in
  [#21321](https://github.com/google-gemini/gemini-cli/pull/21321)
- remove wildcard behavior on keybindings by @scidomino in
  [#21315](https://github.com/google-gemini/gemini-cli/pull/21315)
- feat(acp): Add support for AI Gateway auth by @skeshive in
  [#21305](https://github.com/google-gemini/gemini-cli/pull/21305)
- fix(theme): improve theme color contrast for macOS Terminal.app by @clocky in
  [#21175](https://github.com/google-gemini/gemini-cli/pull/21175)
- feat (core): Implement tracker related SI changes by @anj-s in
  [#19964](https://github.com/google-gemini/gemini-cli/pull/19964)
- Changelog for v0.33.0-preview.2 by @gemini-cli-robot in
  [#21333](https://github.com/google-gemini/gemini-cli/pull/21333)
- Changelog for v0.33.0-preview.3 by @gemini-cli-robot in
  [#21347](https://github.com/google-gemini/gemini-cli/pull/21347)
- docs: format release times as HH:MM UTC by @pavan-sh in
  [#20726](https://github.com/google-gemini/gemini-cli/pull/20726)
- fix(cli): implement --all flag for extensions uninstall by @sehoon38 in
  [#21319](https://github.com/google-gemini/gemini-cli/pull/21319)
- docs: fix incorrect relative links to command reference by @kanywst in
  [#20964](https://github.com/google-gemini/gemini-cli/pull/20964)
- documentiong ensures ripgrep by @Jatin24062005 in
  [#21298](https://github.com/google-gemini/gemini-cli/pull/21298)
- fix(core): handle AbortError thrown during processTurn by @MumuTW in
  [#21296](https://github.com/google-gemini/gemini-cli/pull/21296)
- docs(cli): clarify ! command output visibility in shell commands tutorial by
  @MohammedADev in
  [#21041](https://github.com/google-gemini/gemini-cli/pull/21041)
- fix: logic for task tracker strategy and remove tracker tools by @anj-s in
  [#21355](https://github.com/google-gemini/gemini-cli/pull/21355)
- fix(partUtils): display media type and size for inline data parts by @Aboudjem
  in [#21358](https://github.com/google-gemini/gemini-cli/pull/21358)
- Fix(accessibility): add screen reader support to RewindViewer by @Famous077 in
  [#20750](https://github.com/google-gemini/gemini-cli/pull/20750)
- fix(hooks): propagate stopHookActive in AfterAgent retry path (#20426) by
  @Aarchi-07 in [#20439](https://github.com/google-gemini/gemini-cli/pull/20439)
- fix(core): deduplicate GEMINI.md files by device/inode on case-insensitive
  filesystems (#19904) by @Nixxx19 in
  [#19915](https://github.com/google-gemini/gemini-cli/pull/19915)
- feat(core): add concurrency safety guidance for subagent delegation (#17753)
  by @abhipatel12 in
  [#21278](https://github.com/google-gemini/gemini-cli/pull/21278)
- feat(ui): dynamically generate all keybinding hints by @scidomino in
  [#21346](https://github.com/google-gemini/gemini-cli/pull/21346)
- feat(core): implement unified KeychainService and migrate token storage by
  @ehedlund in [#21344](https://github.com/google-gemini/gemini-cli/pull/21344)
- fix(cli): gracefully handle --resume when no sessions exist by @SandyTao520 in
  [#21429](https://github.com/google-gemini/gemini-cli/pull/21429)
- fix(plan): keep approved plan during chat compression by @ruomengz in
  [#21284](https://github.com/google-gemini/gemini-cli/pull/21284)
- feat(core): implement generic CacheService and optimize setupUser by @sehoon38
  in [#21374](https://github.com/google-gemini/gemini-cli/pull/21374)
- Update quota and pricing documentation with subscription tiers by @srithreepo
  in [#21351](https://github.com/google-gemini/gemini-cli/pull/21351)
- fix(core): append correct OTLP paths for HTTP exporters by
  @sebastien-prudhomme in
  [#16836](https://github.com/google-gemini/gemini-cli/pull/16836)
- Changelog for v0.33.0-preview.4 by @gemini-cli-robot in
  [#21354](https://github.com/google-gemini/gemini-cli/pull/21354)
- feat(cli): implement dot-prefixing for slash command conflicts by @ehedlund in
  [#20979](https://github.com/google-gemini/gemini-cli/pull/20979)
- refactor(core): standardize MCP tool naming to mcp\_ FQN format by
  @abhipatel12 in
  [#21425](https://github.com/google-gemini/gemini-cli/pull/21425)
- feat(cli): hide gemma settings from display and mark as experimental by
  @abhipatel12 in
  [#21471](https://github.com/google-gemini/gemini-cli/pull/21471)
- feat(skills): refine string-reviewer guidelines and description by @clocky in
  [#20368](https://github.com/google-gemini/gemini-cli/pull/20368)
- fix(core): whitelist TERM and COLORTERM in environment sanitization by
  @deadsmash07 in
  [#20514](https://github.com/google-gemini/gemini-cli/pull/20514)
- fix(billing): fix overage strategy lifecycle and settings integration by
  @gsquared94 in
  [#21236](https://github.com/google-gemini/gemini-cli/pull/21236)
- fix: expand paste placeholders in TextInput on submit by @Jefftree in
  [#19946](https://github.com/google-gemini/gemini-cli/pull/19946)
- fix(core): add in-memory cache to ChatRecordingService to prevent OOM by
  @SandyTao520 in
  [#21502](https://github.com/google-gemini/gemini-cli/pull/21502)
- feat(cli): overhaul thinking UI by @keithguerin in
  [#18725](https://github.com/google-gemini/gemini-cli/pull/18725)
- fix(ui): unify Ctrl+O expansion hint experience across buffer modes by
  @jwhelangoog in
  [#21474](https://github.com/google-gemini/gemini-cli/pull/21474)
- fix(cli): correct shell height reporting by @jacob314 in
  [#21492](https://github.com/google-gemini/gemini-cli/pull/21492)
- Make test suite pass when the GEMINI_SYSTEM_MD env variable or
  GEMINI_WRITE_SYSTEM_MD variable happens to be set locally/ by @jacob314 in
  [#21480](https://github.com/google-gemini/gemini-cli/pull/21480)
- Disallow underspecified types by @gundermanc in
  [#21485](https://github.com/google-gemini/gemini-cli/pull/21485)
- refactor(cli): standardize on 'reload' verb for all components by @keithguerin
  in [#20654](https://github.com/google-gemini/gemini-cli/pull/20654)
- feat(cli): Invert quota language to 'percent used' by @keithguerin in
  [#20100](https://github.com/google-gemini/gemini-cli/pull/20100)
- Docs: Add documentation for notifications (experimental)(macOS) by @jkcinouye
  in [#21163](https://github.com/google-gemini/gemini-cli/pull/21163)
- Code review comments as a pr by @jacob314 in
  [#21209](https://github.com/google-gemini/gemini-cli/pull/21209)
- feat(cli): unify /chat and /resume command UX by @LyalinDotCom in
  [#20256](https://github.com/google-gemini/gemini-cli/pull/20256)
- docs: fix typo 'allowslisted' -> 'allowlisted' in mcp-server.md by
  @Gyanranjan-Priyam in
  [#21665](https://github.com/google-gemini/gemini-cli/pull/21665)
- fix(core): display actual graph output in tracker_visualize tool by @anj-s in
  [#21455](https://github.com/google-gemini/gemini-cli/pull/21455)
- fix(core): sanitize SSE-corrupted JSON and domain strings in error
  classification by @gsquared94 in
  [#21702](https://github.com/google-gemini/gemini-cli/pull/21702)
- Docs: Make documentation links relative by @diodesign in
  [#21490](https://github.com/google-gemini/gemini-cli/pull/21490)
- feat(cli): expose /tools desc as explicit subcommand for discoverability by
  @aworki in [#21241](https://github.com/google-gemini/gemini-cli/pull/21241)
- feat(cli): add /compact alias for /compress command by @jackwotherspoon in
  [#21711](https://github.com/google-gemini/gemini-cli/pull/21711)
- feat(plan): enable Plan Mode by default by @jerop in
  [#21713](https://github.com/google-gemini/gemini-cli/pull/21713)
- feat(core): Introduce `AgentLoopContext`. by @joshualitt in
  [#21198](https://github.com/google-gemini/gemini-cli/pull/21198)
- fix(core): resolve symlinks for non-existent paths during validation by
  @Adib234 in [#21487](https://github.com/google-gemini/gemini-cli/pull/21487)
- docs: document tool exclusion from memory via deny policy by @Abhijit-2592 in
  [#21428](https://github.com/google-gemini/gemini-cli/pull/21428)
- perf(core): cache loadApiKey to reduce redundant keychain access by @sehoon38
  in [#21520](https://github.com/google-gemini/gemini-cli/pull/21520)
- feat(cli): implement /upgrade command by @sehoon38 in
  [#21511](https://github.com/google-gemini/gemini-cli/pull/21511)
- Feat/browser agent progress emission by @kunal-10-cloud in
  [#21218](https://github.com/google-gemini/gemini-cli/pull/21218)
- fix(settings): display objects as JSON instead of [object Object] by
  @Zheyuan-Lin in
  [#21458](https://github.com/google-gemini/gemini-cli/pull/21458)
- Unmarshall update by @DavidAPierce in
  [#21721](https://github.com/google-gemini/gemini-cli/pull/21721)
- Update mcp's list function to check for disablement. by @DavidAPierce in
  [#21148](https://github.com/google-gemini/gemini-cli/pull/21148)
- robustness(core): static checks to validate history is immutable by @jacob314
  in [#21228](https://github.com/google-gemini/gemini-cli/pull/21228)
- refactor(cli): better react patterns for BaseSettingsDialog by @psinha40898 in
  [#21206](https://github.com/google-gemini/gemini-cli/pull/21206)
- feat(security): implement robust IP validation and safeFetch foundation by
  @alisa-alisa in
  [#21401](https://github.com/google-gemini/gemini-cli/pull/21401)
- feat(core): improve subagent result display by @joshualitt in
  [#20378](https://github.com/google-gemini/gemini-cli/pull/20378)
- docs: fix broken markdown syntax and anchor links in /tools by @campox747 in
  [#20902](https://github.com/google-gemini/gemini-cli/pull/20902)
- feat(policy): support subagent-specific policies in TOML by @akh64bit in
  [#21431](https://github.com/google-gemini/gemini-cli/pull/21431)
- Add script to speed up reviewing PRs adding a worktree. by @jacob314 in
  [#21748](https://github.com/google-gemini/gemini-cli/pull/21748)
- fix(core): prevent infinite recursion in symlink resolution by @Adib234 in
  [#21750](https://github.com/google-gemini/gemini-cli/pull/21750)
- fix(docs): fix headless mode docs by @ame2en in
  [#21287](https://github.com/google-gemini/gemini-cli/pull/21287)
- feat/redesign header compact by @jacob314 in
  [#20922](https://github.com/google-gemini/gemini-cli/pull/20922)
- refactor: migrate to useKeyMatchers hook by @scidomino in
  [#21753](https://github.com/google-gemini/gemini-cli/pull/21753)
- perf(cli): cache loadSettings to reduce redundant disk I/O at startup by
  @sehoon38 in [#21521](https://github.com/google-gemini/gemini-cli/pull/21521)
- fix(core): resolve Windows line ending and path separation bugs across CLI by
  @muhammadusman586 in
  [#21068](https://github.com/google-gemini/gemini-cli/pull/21068)
- docs: fix heading formatting in commands.md and phrasing in tools-api.md by
  @campox747 in [#20679](https://github.com/google-gemini/gemini-cli/pull/20679)
- refactor(ui): unify keybinding infrastructure and support string
  initialization by @scidomino in
  [#21776](https://github.com/google-gemini/gemini-cli/pull/21776)
- Add support for updating extension sources and names by @chrstnb in
  [#21715](https://github.com/google-gemini/gemini-cli/pull/21715)
- fix(core): handle GUI editor non-zero exit codes gracefully by @reyyanxahmed
  in [#20376](https://github.com/google-gemini/gemini-cli/pull/20376)
- fix(core): destroy PTY on kill() and exception to prevent fd leak by @nbardy
  in [#21693](https://github.com/google-gemini/gemini-cli/pull/21693)
- fix(docs): update theme screenshots and add missing themes by @ashmod in
  [#20689](https://github.com/google-gemini/gemini-cli/pull/20689)
- refactor(cli): rename 'return' key to 'enter' internally by @scidomino in
  [#21796](https://github.com/google-gemini/gemini-cli/pull/21796)
- build(release): restrict npm bundling to non-stable tags by @sehoon38 in
  [#21821](https://github.com/google-gemini/gemini-cli/pull/21821)
- fix(core): override toolRegistry property for sub-agent schedulers by
  @gsquared94 in
  [#21766](https://github.com/google-gemini/gemini-cli/pull/21766)
- fix(cli): make footer items equally spaced by @jacob314 in
  [#21843](https://github.com/google-gemini/gemini-cli/pull/21843)
- docs: clarify global policy rules application in plan mode by @jerop in
  [#21864](https://github.com/google-gemini/gemini-cli/pull/21864)
- fix(core): ensure correct flash model steering in plan mode implementation
  phase by @jerop in
  [#21871](https://github.com/google-gemini/gemini-cli/pull/21871)
- fix(core): update @a2a-js/sdk to 0.3.11 by @adamfweidman in
  [#21875](https://github.com/google-gemini/gemini-cli/pull/21875)
- refactor(core): improve API response error logging when retry by @yunaseoul in
  [#21784](https://github.com/google-gemini/gemini-cli/pull/21784)
- fix(ui): handle headless execution in credits and upgrade dialogs by
  @gsquared94 in
  [#21850](https://github.com/google-gemini/gemini-cli/pull/21850)
- fix(core): treat retryable errors with >5 min delay as terminal quota errors
  by @gsquared94 in
  [#21881](https://github.com/google-gemini/gemini-cli/pull/21881)
- feat(telemetry): add specific PR, issue, and custom tracking IDs for GitHub
  Actions by @cocosheng-g in
  [#21129](https://github.com/google-gemini/gemini-cli/pull/21129)
- feat(core): add OAuth2 Authorization Code auth provider for A2A agents by
  @SandyTao520 in
  [#21496](https://github.com/google-gemini/gemini-cli/pull/21496)
- feat(cli): give visibility to /tools list command in the TUI and follow the
  subcommand pattern of other commands by @JayadityaGit in
  [#21213](https://github.com/google-gemini/gemini-cli/pull/21213)
- Handle dirty worktrees better and warn about running scripts/review.sh on
  untrusted code. by @jacob314 in
  [#21791](https://github.com/google-gemini/gemini-cli/pull/21791)
- feat(policy): support auto-add to policy by default and scoped persistence by
  @spencer426 in
  [#20361](https://github.com/google-gemini/gemini-cli/pull/20361)
- fix(core): handle AbortError when ESC cancels tool execution by @PrasannaPal21
  in [#20863](https://github.com/google-gemini/gemini-cli/pull/20863)
- fix(release): Improve Patch Release Workflow Comments: Clearer Approval
  Guidance by @jerop in
  [#21894](https://github.com/google-gemini/gemini-cli/pull/21894)
- docs: clarify telemetry setup and comprehensive data map by @jerop in
  [#21879](https://github.com/google-gemini/gemini-cli/pull/21879)
- feat(core): add per-model token usage to stream-json output by @yongruilin in
  [#21839](https://github.com/google-gemini/gemini-cli/pull/21839)
- docs: remove experimental badge from plan mode in sidebar by @jerop in
  [#21906](https://github.com/google-gemini/gemini-cli/pull/21906)
- fix(cli): prevent race condition in loop detection retry by @skyvanguard in
  [#17916](https://github.com/google-gemini/gemini-cli/pull/17916)
- Add behavioral evals for tracker by @anj-s in
  [#20069](https://github.com/google-gemini/gemini-cli/pull/20069)
- fix(auth): update terminology to 'sign in' and 'sign out' by @clocky in
  [#20892](https://github.com/google-gemini/gemini-cli/pull/20892)
- docs(mcp): standardize mcp tool fqn documentation by @abhipatel12 in
  [#21664](https://github.com/google-gemini/gemini-cli/pull/21664)
- fix(ui): prevent empty tool-group border stubs after filtering by @Aaxhirrr in
  [#21852](https://github.com/google-gemini/gemini-cli/pull/21852)
- make command names consistent by @scidomino in
  [#21907](https://github.com/google-gemini/gemini-cli/pull/21907)
- refactor: remove agent_card_requires_auth config flag by @adamfweidman in
  [#21914](https://github.com/google-gemini/gemini-cli/pull/21914)
- feat(a2a): implement standardized normalization and streaming reassembly by
  @alisa-alisa in
  [#21402](https://github.com/google-gemini/gemini-cli/pull/21402)
- feat(cli): enable skill activation via slash commands by @NTaylorMullen in
  [#21758](https://github.com/google-gemini/gemini-cli/pull/21758)
- docs(cli): mention per-model token usage in stream-json result event by
  @yongruilin in
  [#21908](https://github.com/google-gemini/gemini-cli/pull/21908)
- fix(plan): prevent plan truncation in approval dialog by supporting
  unconstrained heights by @Adib234 in
  [#21037](https://github.com/google-gemini/gemini-cli/pull/21037)
- feat(a2a): switch from callback-based to event-driven tool scheduler by
  @cocosheng-g in
  [#21467](https://github.com/google-gemini/gemini-cli/pull/21467)
- feat(voice): implement speech-friendly response formatter by @Solventerritory
  in [#20989](https://github.com/google-gemini/gemini-cli/pull/20989)
- feat: add pulsating blue border automation overlay to browser agent by
  @kunal-10-cloud in
  [#21173](https://github.com/google-gemini/gemini-cli/pull/21173)
- Add extensionRegistryURI setting to change where the registry is read from by
  @kevinjwang1 in
  [#20463](https://github.com/google-gemini/gemini-cli/pull/20463)
- fix: patch gaxios v7 Array.toString() stream corruption by @gsquared94 in
  [#21884](https://github.com/google-gemini/gemini-cli/pull/21884)
- fix: prevent hangs in non-interactive mode and improve agent guidance by
  @cocosheng-g in
  [#20893](https://github.com/google-gemini/gemini-cli/pull/20893)
- Add ExtensionDetails dialog and support install by @chrstnb in
  [#20845](https://github.com/google-gemini/gemini-cli/pull/20845)
- chore/release: bump version to 0.34.0-nightly.20260310.4653b126f by
  @gemini-cli-robot in
  [#21816](https://github.com/google-gemini/gemini-cli/pull/21816)
- Changelog for v0.33.0-preview.13 by @gemini-cli-robot in
  [#21927](https://github.com/google-gemini/gemini-cli/pull/21927)
- fix(cli): stabilize prompt layout to prevent jumping when typing by
  @NTaylorMullen in
  [#21081](https://github.com/google-gemini/gemini-cli/pull/21081)
- fix: preserve prompt text when cancelling streaming by @Nixxx19 in
  [#21103](https://github.com/google-gemini/gemini-cli/pull/21103)
- fix: robust UX for remote agent errors by @Shyam-Raghuwanshi in
  [#20307](https://github.com/google-gemini/gemini-cli/pull/20307)
- feat: implement background process logging and cleanup by @galz10 in
  [#21189](https://github.com/google-gemini/gemini-cli/pull/21189)
- Changelog for v0.33.0-preview.14 by @gemini-cli-robot in
  [#21938](https://github.com/google-gemini/gemini-cli/pull/21938)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.33.0-preview.15...v0.35.0-preview.1
