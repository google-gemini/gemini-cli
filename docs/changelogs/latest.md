# Latest stable release: v0.35.3

Released: March 28, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Customizable Keyboard Shortcuts:** Significant improvements to input
  flexibility with support for custom keybindings, literal character bindings,
  and extended terminal protocol keys.
- **Vim Mode Enhancements:** Further refinement of the Vim modal editing
  experience, adding common motions like \`X\`, \`~\`, \`r\`, and \`f/F/t/T\`,
  along with yank and paste support.
- **Enhanced Security through Sandboxing:** Introduction of a unified
  \`SandboxManager\` and integration of Linux-native sandboxing (bubblewrap and
  seccomp) to isolate tool execution and improve system security.
- **JIT Context Discovery:** Improved performance and accuracy by enabling
  Just-In-Time context loading for file system tools, ensuring the model has the
  most relevant information without overwhelming the context.
- **Subagent & Performance Updates:** Subagents are now enabled by default,
  supported by a model-driven parallel tool scheduler and code splitting for
  faster startup and more efficient task execution.

## What's Changed

- fix(patch): cherry-pick 765fb67 to release/v0.35.2-pr-24055 [CONFLICTS] by
  @gemini-cli-robot in
  [#24063](https://github.com/google-gemini/gemini-cli/pull/24063)
- fix(core): allow disabling environment variable redaction by @galz10 in
  [#23927](https://github.com/google-gemini/gemini-cli/pull/23927)
- fix(a2a-server): A2A server should execute ask policies in interactive mode by
  @keith.schaab in
  [#23831](https://github.com/google-gemini/gemini-cli/pull/23831)
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
- fix(core): remove OAuth check from handle fallback and clean up stray file by
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
- fix(patch): cherry-pick 4e5dfd0 to release/v0.35.0-preview.1-pr-23074 to patch
  version v0.35.0-preview.1 and create version 0.35.0-preview.2 by
  @gemini-cli-robot in
  [#23134](https://github.com/google-gemini/gemini-cli/pull/23134)
- fix(patch): cherry-pick daf3691 to release/v0.35.0-preview.2-pr-23558 to patch
  version v0.35.0-preview.2 and create version 0.35.0-preview.3 by
  @gemini-cli-robot in
  [#23565](https://github.com/google-gemini/gemini-cli/pull/23565)
- fix(patch): cherry-pick b2d6dc4 to release/v0.35.0-preview.4-pr-23546
  [CONFLICTS] by @gemini-cli-robot in
  [#23585](https://github.com/google-gemini/gemini-cli/pull/23585)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.34.0...v0.35.3
