# Preview release: v0.36.0-preview.3

Released: March 25, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Subagent Architecture Enhancements:** Significant updates to subagents,
  including local execution, tool isolation, multi-registry discovery, dynamic
  tool filtering, and JIT context injection.
- **Enhanced Security & Sandboxing:** Implemented strict macOS sandboxing using
  Seatbelt allowlist, native Windows sandboxing, and support for
  "Write-Protected" governance files.
- **Agent Context & State Management:** Introduced task tracker protocol
  integration, 'blocked' statuses for tasks/todos, and `AgentSession` for
  improved state management and replay semantics.
- **Browser & ACP Capabilities:** Added privacy consent for the browser agent,
  sensitive action controls, improved API token usage metadata, and gateway auth
  support via ACP.
- **CLI & UX Improvements:** Implemented a refreshed Composer layout, expanded
  terminal fallback warnings, dynamic model resolution, and Git worktree support
  for isolated parallel sessions.

## What's Changed

- fix(patch): cherry-pick 055ff92 to release/v0.36.0-preview.0-pr-23672 to patch
  version v0.36.0-preview.0 and create version 0.36.0-preview.1 by
  @gemini-cli-robot in
  [#23723](https://github.com/google-gemini/gemini-cli/pull/23723)
- Changelog for v0.33.2 by @gemini-cli-robot in
  [#22730](https://github.com/google-gemini/gemini-cli/pull/22730)
- feat(core): multi-registry architecture and tool filtering for subagents by
  @akh64bit in [#22712](https://github.com/google-gemini/gemini-cli/pull/22712)
- Changelog for v0.34.0-preview.4 by @gemini-cli-robot in
  [#22752](https://github.com/google-gemini/gemini-cli/pull/22752)
- fix(devtools): use theme-aware text colors for console warnings and errors by
  @SandyTao520 in
  [#22181](https://github.com/google-gemini/gemini-cli/pull/22181)
- Add support for dynamic model Resolution to ModelConfigService by @kevinjwang1
  in [#22578](https://github.com/google-gemini/gemini-cli/pull/22578)
- chore(release): bump version to 0.36.0-nightly.20260317.2f90b4653 by
  @gemini-cli-robot in
  [#22858](https://github.com/google-gemini/gemini-cli/pull/22858)
- fix(cli): use active sessionId in useLogger and improve resume robustness by
  @mattKorwel in
  [#22606](https://github.com/google-gemini/gemini-cli/pull/22606)
- fix(cli): expand tilde in policy paths from settings.json by @abhipatel12 in
  [#22772](https://github.com/google-gemini/gemini-cli/pull/22772)
- fix(core): add actionable warnings for terminal fallbacks (#14426) by
  @spencer426 in
  [#22211](https://github.com/google-gemini/gemini-cli/pull/22211)
- feat(tracker): integrate task tracker protocol into core system prompt by
  @anj-s in [#22442](https://github.com/google-gemini/gemini-cli/pull/22442)
- chore: add posttest build hooks and fix missing dependencies by @NTaylorMullen
  in [#22865](https://github.com/google-gemini/gemini-cli/pull/22865)
- feat(a2a): add agent acknowledgment command and enhance registry discovery by
  @alisa-alisa in
  [#22389](https://github.com/google-gemini/gemini-cli/pull/22389)
- fix(cli): automatically add all VSCode workspace folders to Gemini context by
  @sakshisemalti in
  [#21380](https://github.com/google-gemini/gemini-cli/pull/21380)
- feat: add 'blocked' status to tasks and todos by @anj-s in
  [#22735](https://github.com/google-gemini/gemini-cli/pull/22735)
- refactor(cli): remove extra newlines in ShellToolMessage.tsx by @NTaylorMullen
  in [#22868](https://github.com/google-gemini/gemini-cli/pull/22868)
- fix(cli): lazily load settings in onModelChange to prevent stale closure data
  loss by @KumarADITHYA123 in
  [#20403](https://github.com/google-gemini/gemini-cli/pull/20403)
- feat(core): subagent local execution and tool isolation by @akh64bit in
  [#22718](https://github.com/google-gemini/gemini-cli/pull/22718)
- fix(cli): resolve subagent grouping and UI state persistence by @abhipatel12
  in [#22252](https://github.com/google-gemini/gemini-cli/pull/22252)
- refactor(ui): extract SessionBrowser search and navigation components by
  @abhipatel12 in
  [#22377](https://github.com/google-gemini/gemini-cli/pull/22377)
- fix: updates Docker image reference for GitHub MCP server by @jhhornn in
  [#22938](https://github.com/google-gemini/gemini-cli/pull/22938)
- refactor(cli): group subagent trajectory deletion and use native filesystem
  testing by @abhipatel12 in
  [#22890](https://github.com/google-gemini/gemini-cli/pull/22890)
- refactor(cli): simplify keypress and mouse providers and update tests by
  @scidomino in [#22853](https://github.com/google-gemini/gemini-cli/pull/22853)
- Changelog for v0.34.0 by @gemini-cli-robot in
  [#22860](https://github.com/google-gemini/gemini-cli/pull/22860)
- test(cli): simplify createMockSettings calls by @scidomino in
  [#22952](https://github.com/google-gemini/gemini-cli/pull/22952)
- feat(ui): format multi-line banner warnings with a bold title by @keithguerin
  in [#22955](https://github.com/google-gemini/gemini-cli/pull/22955)
- Docs: Remove references to stale Gemini CLI file structure info by
  @g-samroberts in
  [#22976](https://github.com/google-gemini/gemini-cli/pull/22976)
- feat(ui): remove write todo list tool from UI tips by @aniruddhaadak80 in
  [#22281](https://github.com/google-gemini/gemini-cli/pull/22281)
- Fix issue where subagent thoughts are appended. by @gundermanc in
  [#22975](https://github.com/google-gemini/gemini-cli/pull/22975)
- Feat/browser privacy consent by @kunal-10-cloud in
  [#21119](https://github.com/google-gemini/gemini-cli/pull/21119)
- fix(core): explicitly map execution context in LocalAgentExecutor by @akh64bit
  in [#22949](https://github.com/google-gemini/gemini-cli/pull/22949)
- feat(plan): support plan mode in non-interactive mode by @ruomengz in
  [#22670](https://github.com/google-gemini/gemini-cli/pull/22670)
- feat(core): implement strict macOS sandboxing using Seatbelt allowlist by
  @ehedlund in [#22832](https://github.com/google-gemini/gemini-cli/pull/22832)
- docs: add additional notes by @abhipatel12 in
  [#23008](https://github.com/google-gemini/gemini-cli/pull/23008)
- fix(cli): resolve duplicate footer on tool cancel via ESC (#21743) by
  @ruomengz in [#21781](https://github.com/google-gemini/gemini-cli/pull/21781)
- Changelog for v0.35.0-preview.1 by @gemini-cli-robot in
  [#23012](https://github.com/google-gemini/gemini-cli/pull/23012)
- fix(ui): fix flickering on small terminal heights by @devr0306 in
  [#21416](https://github.com/google-gemini/gemini-cli/pull/21416)
- fix(acp): provide more meta in tool_call_update by @Mervap in
  [#22663](https://github.com/google-gemini/gemini-cli/pull/22663)
- docs: add FAQ entry for checking Gemini CLI version by @surajsahani in
  [#21271](https://github.com/google-gemini/gemini-cli/pull/21271)
- feat(core): resilient subagent tool rejection with contextual feedback by
  @abhipatel12 in
  [#22951](https://github.com/google-gemini/gemini-cli/pull/22951)
- fix(cli): correctly handle auto-update for standalone binaries by @bdmorgan in
  [#23038](https://github.com/google-gemini/gemini-cli/pull/23038)
- feat(core): add content-utils by @adamfweidman in
  [#22984](https://github.com/google-gemini/gemini-cli/pull/22984)
- fix: circumvent genai sdk requirement for api key when using gateway auth via
  ACP by @sripasg in
  [#23042](https://github.com/google-gemini/gemini-cli/pull/23042)
- fix(core): don't persist browser consent sentinel in non-interactive mode by
  @jasonmatthewsuhari in
  [#23073](https://github.com/google-gemini/gemini-cli/pull/23073)
- fix(core): narrow browser agent description to prevent stealing URL tasks from
  web_fetch by @gsquared94 in
  [#23086](https://github.com/google-gemini/gemini-cli/pull/23086)
- feat(cli): Partial threading of AgentLoopContext. by @joshualitt in
  [#22978](https://github.com/google-gemini/gemini-cli/pull/22978)
- fix(browser-agent): enable "Allow all server tools" session policy by
  @cynthialong0-0 in
  [#22343](https://github.com/google-gemini/gemini-cli/pull/22343)
- refactor(cli): integrate real config loading into async test utils by
  @scidomino in [#23040](https://github.com/google-gemini/gemini-cli/pull/23040)
- feat(core): inject memory and JIT context into subagents by @abhipatel12 in
  [#23032](https://github.com/google-gemini/gemini-cli/pull/23032)
- Fix logging and virtual list. by @jacob314 in
  [#23080](https://github.com/google-gemini/gemini-cli/pull/23080)
- feat(core): cap JIT context upward traversal at git root by @SandyTao520 in
  [#23074](https://github.com/google-gemini/gemini-cli/pull/23074)
- Docs: Minor style updates from initial docs audit. by @g-samroberts in
  [#22872](https://github.com/google-gemini/gemini-cli/pull/22872)
- feat(core): add experimental memory manager agent to replace save_memory tool
  by @SandyTao520 in
  [#22726](https://github.com/google-gemini/gemini-cli/pull/22726)
- Changelog for v0.35.0-preview.2 by @gemini-cli-robot in
  [#23142](https://github.com/google-gemini/gemini-cli/pull/23142)
- Update website issue template for label and title by @g-samroberts in
  [#23036](https://github.com/google-gemini/gemini-cli/pull/23036)
- fix: upgrade ACP SDK from 0.12 to 0.16.1 by @sripasg in
  [#23132](https://github.com/google-gemini/gemini-cli/pull/23132)
- Update callouts to work on github. by @g-samroberts in
  [#22245](https://github.com/google-gemini/gemini-cli/pull/22245)
- feat: ACP: Add token usage metadata to the `send` method's return value by
  @sripasg in [#23148](https://github.com/google-gemini/gemini-cli/pull/23148)
- fix(plan): clarify that plan mode policies are combined with normal mode by
  @ruomengz in [#23158](https://github.com/google-gemini/gemini-cli/pull/23158)
- Add ModelChain support to ModelConfigService and make ModelDialog dynamic by
  @kevinjwang1 in
  [#22914](https://github.com/google-gemini/gemini-cli/pull/22914)
- Ensure that copied extensions are writable in the user's local directory by
  @kevinjwang1 in
  [#23016](https://github.com/google-gemini/gemini-cli/pull/23016)
- feat(core): implement native Windows sandboxing by @mattKorwel in
  [#21807](https://github.com/google-gemini/gemini-cli/pull/21807)
- feat(core): add support for admin-forced MCP server installations by
  @gsquared94 in
  [#23163](https://github.com/google-gemini/gemini-cli/pull/23163)
- chore(lint): ignore .gemini directory and recursive node_modules by
  @mattKorwel in
  [#23211](https://github.com/google-gemini/gemini-cli/pull/23211)
- feat(cli): conditionally exclude ask_user tool in ACP mode by @nmcnamara-eng
  in [#23045](https://github.com/google-gemini/gemini-cli/pull/23045)
- feat(core): introduce AgentSession and rename stream events to agent events by
  @mbleigh in [#23159](https://github.com/google-gemini/gemini-cli/pull/23159)
- feat(worktree): add Git worktree support for isolated parallel sessions by
  @jerop in [#22973](https://github.com/google-gemini/gemini-cli/pull/22973)
- Add support for linking in the extension registry by @kevinjwang1 in
  [#23153](https://github.com/google-gemini/gemini-cli/pull/23153)
- feat(extensions): add --skip-settings flag to install command by @Ratish1 in
  [#17212](https://github.com/google-gemini/gemini-cli/pull/17212)
- feat(telemetry): track if session is running in a Git worktree by @jerop in
  [#23265](https://github.com/google-gemini/gemini-cli/pull/23265)
- refactor(core): use absolute paths in GEMINI.md context markers by
  @SandyTao520 in
  [#23135](https://github.com/google-gemini/gemini-cli/pull/23135)
- fix(core): add sanitization to sub agent thoughts and centralize utilities by
  @devr0306 in [#22828](https://github.com/google-gemini/gemini-cli/pull/22828)
- feat(core): refine User-Agent for VS Code traffic (unified format) by
  @sehoon38 in [#23256](https://github.com/google-gemini/gemini-cli/pull/23256)
- Fix schema for ModelChains by @kevinjwang1 in
  [#23284](https://github.com/google-gemini/gemini-cli/pull/23284)
- test(cli): refactor tests for async render utilities by @scidomino in
  [#23252](https://github.com/google-gemini/gemini-cli/pull/23252)
- feat(core): add security prompt for browser agent by @cynthialong0-0 in
  [#23241](https://github.com/google-gemini/gemini-cli/pull/23241)
- refactor(ide): replace dynamic undici import with static fetch import by
  @cocosheng-g in
  [#23268](https://github.com/google-gemini/gemini-cli/pull/23268)
- test(cli): address unresolved feedback from PR #23252 by @scidomino in
  [#23303](https://github.com/google-gemini/gemini-cli/pull/23303)
- feat(browser): add sensitive action controls and read-only noise reduction by
  @cynthialong0-0 in
  [#22867](https://github.com/google-gemini/gemini-cli/pull/22867)
- Disabling failing test while investigating by @alisa-alisa in
  [#23311](https://github.com/google-gemini/gemini-cli/pull/23311)
- fix broken extension link in hooks guide by @Indrapal-70 in
  [#21728](https://github.com/google-gemini/gemini-cli/pull/21728)
- fix(core): fix agent description indentation by @abhipatel12 in
  [#23315](https://github.com/google-gemini/gemini-cli/pull/23315)
- Wrap the text under TOML rule for easier readability in policy-engine.md… by
  @CogitationOps in
  [#23076](https://github.com/google-gemini/gemini-cli/pull/23076)
- fix(extensions): revert broken extension removal behavior by @ehedlund in
  [#23317](https://github.com/google-gemini/gemini-cli/pull/23317)
- feat(core): set up onboarding telemetry by @yunaseoul in
  [#23118](https://github.com/google-gemini/gemini-cli/pull/23118)
- Retry evals on API error. by @gundermanc in
  [#23322](https://github.com/google-gemini/gemini-cli/pull/23322)
- fix(evals): remove tool restrictions and add compile-time guards by
  @SandyTao520 in
  [#23312](https://github.com/google-gemini/gemini-cli/pull/23312)
- fix(hooks): support 'ask' decision for BeforeTool hooks by @gundermanc in
  [#21146](https://github.com/google-gemini/gemini-cli/pull/21146)
- feat(browser): add warning message for session mode 'existing' by
  @cynthialong0-0 in
  [#23288](https://github.com/google-gemini/gemini-cli/pull/23288)
- chore(lint): enforce zero warnings and cleanup syntax restrictions by
  @alisa-alisa in
  [#22902](https://github.com/google-gemini/gemini-cli/pull/22902)
- fix(cli): add Esc instruction to HooksDialog footer by @abhipatel12 in
  [#23258](https://github.com/google-gemini/gemini-cli/pull/23258)
- Disallow and suppress misused spread operator. by @gundermanc in
  [#23294](https://github.com/google-gemini/gemini-cli/pull/23294)
- fix(core): refine CliHelpAgent description for better delegation by
  @abhipatel12 in
  [#23310](https://github.com/google-gemini/gemini-cli/pull/23310)
- fix(core): enable global session and persistent approval for web_fetch by
  @NTaylorMullen in
  [#23295](https://github.com/google-gemini/gemini-cli/pull/23295)
- fix(plan): add state transition override to prevent plan mode freeze by
  @Adib234 in [#23020](https://github.com/google-gemini/gemini-cli/pull/23020)
- fix(cli): record skill activation tool calls in chat history by @NTaylorMullen
  in [#23203](https://github.com/google-gemini/gemini-cli/pull/23203)
- fix(core): ensure subagent tool updates apply configuration overrides
  immediately by @abhipatel12 in
  [#23161](https://github.com/google-gemini/gemini-cli/pull/23161)
- fix(cli): resolve flicker at boundaries of list in BaseSelectionList by
  @jackwotherspoon in
  [#23298](https://github.com/google-gemini/gemini-cli/pull/23298)
- test(cli): force generic terminal in tests to fix snapshot failures by
  @abhipatel12 in
  [#23499](https://github.com/google-gemini/gemini-cli/pull/23499)
- Evals: PR Guidance adding workflow by @alisa-alisa in
  [#23164](https://github.com/google-gemini/gemini-cli/pull/23164)
- feat(core): refactor SandboxManager to a stateless architecture and introduce
  explicit Deny interface by @ehedlund in
  [#23141](https://github.com/google-gemini/gemini-cli/pull/23141)
- feat(core): add event-translator and update agent types by @adamfweidman in
  [#22985](https://github.com/google-gemini/gemini-cli/pull/22985)
- perf(cli): parallelize and background startup cleanup tasks by @sehoon38 in
  [#23545](https://github.com/google-gemini/gemini-cli/pull/23545)
- fix: "allow always" for commands with paths by @scidomino in
  [#23558](https://github.com/google-gemini/gemini-cli/pull/23558)
- fix(cli): prevent terminal escape sequences from leaking on exit by
  @mattKorwel in
  [#22682](https://github.com/google-gemini/gemini-cli/pull/22682)
- feat(cli): implement full "GEMINI CLI" logo for logged-out state by
  @keithguerin in
  [#22412](https://github.com/google-gemini/gemini-cli/pull/22412)
- fix(plan): reserve minimum height for selection list in AskUserDialog by
  @ruomengz in [#23280](https://github.com/google-gemini/gemini-cli/pull/23280)
- fix(core): harden AgentSession replay semantics by @adamfweidman in
  [#23548](https://github.com/google-gemini/gemini-cli/pull/23548)
- test(core): migrate hook tests to scheduler by @abhipatel12 in
  [#23496](https://github.com/google-gemini/gemini-cli/pull/23496)
- chore(config): disable agents by default by @abhipatel12 in
  [#23546](https://github.com/google-gemini/gemini-cli/pull/23546)
- fix(ui): make tool confirmations take up entire terminal height by @devr0306
  in [#22366](https://github.com/google-gemini/gemini-cli/pull/22366)
- fix(core): prevent redundant remote agent loading on model switch by
  @adamfweidman in
  [#23576](https://github.com/google-gemini/gemini-cli/pull/23576)
- refactor(core): update production type imports from coreToolScheduler by
  @abhipatel12 in
  [#23498](https://github.com/google-gemini/gemini-cli/pull/23498)
- feat(cli): always prefix extension skills with colon separator by
  @NTaylorMullen in
  [#23566](https://github.com/google-gemini/gemini-cli/pull/23566)
- fix(core): properly support allowRedirect in policy engine by @scidomino in
  [#23579](https://github.com/google-gemini/gemini-cli/pull/23579)
- fix(cli): prevent subcommand shadowing and skip auth for commands by
  @mattKorwel in
  [#23177](https://github.com/google-gemini/gemini-cli/pull/23177)
- fix(test): move flaky tests to non-blocking suite by @mattKorwel in
  [#23259](https://github.com/google-gemini/gemini-cli/pull/23259)
- Changelog for v0.35.0-preview.3 by @gemini-cli-robot in
  [#23574](https://github.com/google-gemini/gemini-cli/pull/23574)
- feat(skills): add behavioral-evals skill with fixing and promoting guides by
  @abhipatel12 in
  [#23349](https://github.com/google-gemini/gemini-cli/pull/23349)
- refactor(core): delete obsolete coreToolScheduler by @abhipatel12 in
  [#23502](https://github.com/google-gemini/gemini-cli/pull/23502)
- Changelog for v0.35.0-preview.4 by @gemini-cli-robot in
  [#23581](https://github.com/google-gemini/gemini-cli/pull/23581)
- feat(core): add LegacyAgentSession by @adamfweidman in
  [#22986](https://github.com/google-gemini/gemini-cli/pull/22986)
- feat(test-utils): add TestMcpServerBuilder and support in TestRig by
  @abhipatel12 in
  [#23491](https://github.com/google-gemini/gemini-cli/pull/23491)
- fix(core)!: Force policy config to specify toolName by @kschaab in
  [#23330](https://github.com/google-gemini/gemini-cli/pull/23330)
- eval(save_memory): add multi-turn interactive evals for memoryManager by
  @SandyTao520 in
  [#23572](https://github.com/google-gemini/gemini-cli/pull/23572)
- fix(telemetry): patch memory leak and enforce logPrompts privacy by
  @spencer426 in
  [#23281](https://github.com/google-gemini/gemini-cli/pull/23281)
- perf(cli): background IDE client to speed up initialization by @sehoon38 in
  [#23603](https://github.com/google-gemini/gemini-cli/pull/23603)
- fix(cli): prevent Ctrl+D exit when input buffer is not empty by @wtanaka in
  [#23306](https://github.com/google-gemini/gemini-cli/pull/23306)
- fix: ACP: separate conversational text from execute tool command title by
  @sripasg in [#23179](https://github.com/google-gemini/gemini-cli/pull/23179)
- feat(evals): add behavioral evaluations for subagent routing by @Samee24 in
  [#23272](https://github.com/google-gemini/gemini-cli/pull/23272)
- refactor(cli,core): foundational layout, identity management, and type safety
  by @jwhelangoog in
  [#23286](https://github.com/google-gemini/gemini-cli/pull/23286)
- fix(core): accurately reflect subagent tool failure in UI by @abhipatel12 in
  [#23187](https://github.com/google-gemini/gemini-cli/pull/23187)
- Changelog for v0.35.0-preview.5 by @gemini-cli-robot in
  [#23606](https://github.com/google-gemini/gemini-cli/pull/23606)
- feat(ui): implement refreshed UX for Composer layout by @jwhelangoog in
  [#21212](https://github.com/google-gemini/gemini-cli/pull/21212)
- fix: API key input dialog user interaction when selected Gemini API Key by
  @kartikangiras in
  [#21057](https://github.com/google-gemini/gemini-cli/pull/21057)
- docs: update `/mcp refresh` to `/mcp reload` by @adamfweidman in
  [#23631](https://github.com/google-gemini/gemini-cli/pull/23631)
- Implementation of sandbox "Write-Protected" Governance Files by @DavidAPierce
  in [#23139](https://github.com/google-gemini/gemini-cli/pull/23139)
- feat(sandbox): dynamic macOS sandbox expansion and worktree support by @galz10
  in [#23301](https://github.com/google-gemini/gemini-cli/pull/23301)
- fix(acp): Pass the cwd to `AcpFileSystemService` to avoid looping failures in
  asking for perms to write plan md file by @sripasg in
  [#23612](https://github.com/google-gemini/gemini-cli/pull/23612)
- fix(plan): sandbox path resolution in Plan Mode to prevent hallucinations by
  @Adib234 in [#22737](https://github.com/google-gemini/gemini-cli/pull/22737)
- feat(ui): allow immediate user input during startup by @sehoon38 in
  [#23661](https://github.com/google-gemini/gemini-cli/pull/23661)
- refactor(sandbox): reorganize Windows sandbox files by @galz10 in
  [#23645](https://github.com/google-gemini/gemini-cli/pull/23645)
- fix(core): improve remote agent streaming UI and UX by @adamfweidman in
  [#23633](https://github.com/google-gemini/gemini-cli/pull/23633)
- perf(cli): optimize --version startup time by @sehoon38 in
  [#23671](https://github.com/google-gemini/gemini-cli/pull/23671)
- refactor(core): stop gemini CLI from producing unsafe casts by @gundermanc in
  [#23611](https://github.com/google-gemini/gemini-cli/pull/23611)
- use enableAutoUpdate in test rig by @scidomino in
  [#23681](https://github.com/google-gemini/gemini-cli/pull/23681)
- feat(core): change user-facing auth type from oauth2 to oauth by @adamfweidman
  in [#23639](https://github.com/google-gemini/gemini-cli/pull/23639)
- chore(deps): fix npm audit vulnerabilities by @scidomino in
  [#23679](https://github.com/google-gemini/gemini-cli/pull/23679)
- test(evals): fix overlapping act() deadlock in app-test-helper by @Adib234 in
  [#23666](https://github.com/google-gemini/gemini-cli/pull/23666)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.35.0-preview.5...v0.36.0-preview.3
