# Latest stable release: v0.26.0

Released: January 27, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Enhanced Agent and Skill Capabilities:** This release introduces the new
  `skill-creator` built-in skill, enables Agent Skills by default, and adds a
  generalist agent to improve task routing. Security for skill installation has
  also been enhanced with new consent prompts.
- **Improved UI and UX:** A new "Rewind" feature lets you walk back through
  conversation history. We've also added an `/introspect` command for debugging
  and unified various shell confirmation dialogs for a more consistent user
  experience.
- **Core Stability and Performance:** This release includes significant
  performance improvements, including a fix for PDF token estimation,
  optimizations for large inputs, and prevention of OOM crashes. Key memory
  management components like `LRUCache` have also been updated.
- **Scheduler and Policy Refactoring:** The core tool scheduler has been
  decoupled into distinct orchestration, policy, and confirmation components,
  and we've added an experimental event-driven scheduler to improve performance
  and reliability.

## What's Changed

- fix: PDF token estimation (#16494) by @korade-krushna in
  [#16527](https://github.com/google-gemini/gemini-cli/pull/16527)
- chore(release): bump version to 0.26.0-nightly.20260114.bb6c57414 by
  @gemini-cli-robot in
  [#16604](https://github.com/google-gemini/gemini-cli/pull/16604)
- docs: clarify F12 to open debug console by @jackwotherspoon in
  [#16570](https://github.com/google-gemini/gemini-cli/pull/16570)
- docs: Remove .md extension from internal links in architecture.md by
  @medic-code in
  [#12899](https://github.com/google-gemini/gemini-cli/pull/12899)
- Add an experimental setting for extension config by @chrstnb in
  [#16506](https://github.com/google-gemini/gemini-cli/pull/16506)
- feat: add Rewind Confirmation dialog and Rewind Viewer component by @Adib234
  in [#15717](https://github.com/google-gemini/gemini-cli/pull/15717)
- fix(a2a): Don't throw errors for GeminiEventType Retry and InvalidStream. by
  @ehedlund in [#16541](https://github.com/google-gemini/gemini-cli/pull/16541)
- prefactor: add rootCommands as array so it can be used for policy parsing by
  @abhipatel12 in
  [#16640](https://github.com/google-gemini/gemini-cli/pull/16640)
- remove unnecessary \x7f key bindings by @scidomino in
  [#16646](https://github.com/google-gemini/gemini-cli/pull/16646)
- docs(skills): use body-file in pr-creator skill for better reliability by
  @abhipatel12 in
  [#16642](https://github.com/google-gemini/gemini-cli/pull/16642)
- chore(automation): recursive labeling for workstream descendants by @bdmorgan
  in [#16609](https://github.com/google-gemini/gemini-cli/pull/16609)
- feat: introduce 'skill-creator' built-in skill and CJS management tools by
  @NTaylorMullen in
  [#16394](https://github.com/google-gemini/gemini-cli/pull/16394)
- chore(automation): remove automated PR size and complexity labeler by
  @bdmorgan in [#16648](https://github.com/google-gemini/gemini-cli/pull/16648)
- refactor(skills): replace 'project' with 'workspace' scope by @NTaylorMullen
  in [#16380](https://github.com/google-gemini/gemini-cli/pull/16380)
- Docs: Update release notes for 1/13/2026 by @jkcinouye in
  [#16583](https://github.com/google-gemini/gemini-cli/pull/16583)
- Simplify paste handling by @scidomino in
  [#16654](https://github.com/google-gemini/gemini-cli/pull/16654)
- chore(automation): improve scheduled issue triage discovery and throughput by
  @bdmorgan in [#16652](https://github.com/google-gemini/gemini-cli/pull/16652)
- fix(acp): run exit cleanup when stdin closes by @codefromthecrypt in
  [#14953](https://github.com/google-gemini/gemini-cli/pull/14953)
- feat(scheduler): add types needed for event driven scheduler by @abhipatel12
  in [#16641](https://github.com/google-gemini/gemini-cli/pull/16641)
- Remove unused rewind key binding by @scidomino in
  [#16659](https://github.com/google-gemini/gemini-cli/pull/16659)
- Remove sequence binding by @scidomino in
  [#16664](https://github.com/google-gemini/gemini-cli/pull/16664)
- feat(cli): undeprecate the --prompt flag by @alexaustin007 in
  [#13981](https://github.com/google-gemini/gemini-cli/pull/13981)
- chore: update dependabot configuration by @cosmopax in
  [#13507](https://github.com/google-gemini/gemini-cli/pull/13507)
- feat(config): add 'auto' alias for default model selection by @sehoon38 in
  [#16661](https://github.com/google-gemini/gemini-cli/pull/16661)
- Enable & disable agents by @sehoon38 in
  [#16225](https://github.com/google-gemini/gemini-cli/pull/16225)
- cleanup: Improve keybindings by @scidomino in
  [#16672](https://github.com/google-gemini/gemini-cli/pull/16672)
- Add timeout for shell-utils to prevent hangs. by @jacob314 in
  [#16667](https://github.com/google-gemini/gemini-cli/pull/16667)
- feat(plan): add experimental plan flag by @jerop in
  [#16650](https://github.com/google-gemini/gemini-cli/pull/16650)
- feat(cli): add security consent prompts for skill installation by
  @NTaylorMullen in
  [#16549](https://github.com/google-gemini/gemini-cli/pull/16549)
- fix: replace 3 consecutive periods with ellipsis character by @Vist233 in
  [#16587](https://github.com/google-gemini/gemini-cli/pull/16587)
- chore(automation): ensure status/need-triage is applied and never cleared
  automatically by @bdmorgan in
  [#16657](https://github.com/google-gemini/gemini-cli/pull/16657)
- fix: Handle colons in skill description frontmatter by @maru0804 in
  [#16345](https://github.com/google-gemini/gemini-cli/pull/16345)
- refactor(core): harden skill frontmatter parsing by @NTaylorMullen in
  [#16705](https://github.com/google-gemini/gemini-cli/pull/16705)
- feat(skills): add conflict detection and warnings for skill overrides by
  @NTaylorMullen in
  [#16709](https://github.com/google-gemini/gemini-cli/pull/16709)
- feat(scheduler): add SchedulerStateManager for reactive tool state by
  @abhipatel12 in
  [#16651](https://github.com/google-gemini/gemini-cli/pull/16651)
- chore(automation): enforce 'help wanted' label permissions and update
  guidelines by @bdmorgan in
  [#16707](https://github.com/google-gemini/gemini-cli/pull/16707)
- fix(core): resolve circular dependency via tsconfig paths by @sehoon38 in
  [#16730](https://github.com/google-gemini/gemini-cli/pull/16730)
- chore/release: bump version to 0.26.0-nightly.20260115.6cb3ae4e0 by
  @gemini-cli-robot in
  [#16738](https://github.com/google-gemini/gemini-cli/pull/16738)
- fix(automation): correct status/need-issue label matching wildcard by
  @bdmorgan in [#16727](https://github.com/google-gemini/gemini-cli/pull/16727)
- fix(automation): prevent label-enforcer loop by ignoring all bots by @bdmorgan
  in [#16746](https://github.com/google-gemini/gemini-cli/pull/16746)
- Add links to supported locations and minor fixes by @g-samroberts in
  [#16476](https://github.com/google-gemini/gemini-cli/pull/16476)
- feat(policy): add source tracking to policy rules by @allenhutchison in
  [#16670](https://github.com/google-gemini/gemini-cli/pull/16670)
- feat(automation): enforce '🔒 maintainer only' and fix bot loop by @bdmorgan
  in [#16751](https://github.com/google-gemini/gemini-cli/pull/16751)
- Make merged settings non-nullable and fix all lints related to that. by
  @jacob314 in [#16647](https://github.com/google-gemini/gemini-cli/pull/16647)
- fix(core): prevent ModelInfo event emission on aborted signal by @sehoon38 in
  [#16752](https://github.com/google-gemini/gemini-cli/pull/16752)
- Replace relative paths to fix website build by @chrstnb in
  [#16755](https://github.com/google-gemini/gemini-cli/pull/16755)
- Restricting to localhost by @cocosheng-g in
  [#16548](https://github.com/google-gemini/gemini-cli/pull/16548)
- fix(cli): add explicit dependency on color-convert by @sehoon38 in
  [#16757](https://github.com/google-gemini/gemini-cli/pull/16757)
- fix(automation): robust label enforcement with permission checks by @bdmorgan
  in [#16762](https://github.com/google-gemini/gemini-cli/pull/16762)
- fix(cli): prevent OOM crash by limiting file search traversal and adding
  timeout by @galz10 in
  [#16696](https://github.com/google-gemini/gemini-cli/pull/16696)
- fix(cli): safely handle /dev/tty access on macOS by @korade-krushna in
  [#16531](https://github.com/google-gemini/gemini-cli/pull/16531)
- docs: clarify workspace test execution in GEMINI.md by @mattKorwel in
  [#16764](https://github.com/google-gemini/gemini-cli/pull/16764)
- Add support for running available commands prior to MCP servers loading by
  @Adib234 in [#15596](https://github.com/google-gemini/gemini-cli/pull/15596)
- feat(plan): add experimental 'plan' approval mode by @jerop in
  [#16753](https://github.com/google-gemini/gemini-cli/pull/16753)
- feat(scheduler): add functional awaitConfirmation utility by @abhipatel12 in
  [#16721](https://github.com/google-gemini/gemini-cli/pull/16721)
- fix(infra): update maintainer rollup label to 'workstream-rollup' by @bdmorgan
  in [#16809](https://github.com/google-gemini/gemini-cli/pull/16809)
- fix(infra): use GraphQL to detect direct parents in rollup workflow by
  @bdmorgan in [#16811](https://github.com/google-gemini/gemini-cli/pull/16811)
- chore(workflows): rename label-workstream-rollup workflow by @bdmorgan in
  [#16818](https://github.com/google-gemini/gemini-cli/pull/16818)
- skip simple-mcp-server.test.ts by @scidomino in
  [#16842](https://github.com/google-gemini/gemini-cli/pull/16842)
- Steer outer agent to use expert subagents when present by @gundermanc in
  [#16763](https://github.com/google-gemini/gemini-cli/pull/16763)
- Fix race condition by awaiting scheduleToolCalls by @chrstnb in
  [#16759](https://github.com/google-gemini/gemini-cli/pull/16759)
- cleanup: Organize key bindings by @scidomino in
  [#16798](https://github.com/google-gemini/gemini-cli/pull/16798)
- feat(core): Add generalist agent. by @joshualitt in
  [#16638](https://github.com/google-gemini/gemini-cli/pull/16638)
- perf(ui): optimize text buffer and highlighting for large inputs by
  @NTaylorMullen in
  [#16782](https://github.com/google-gemini/gemini-cli/pull/16782)
- fix(core): fix PTY descriptor shell leak by @galz10 in
  [#16773](https://github.com/google-gemini/gemini-cli/pull/16773)
- feat(plan): enforce strict read-only policy and halt execution on violation by
  @jerop in [#16849](https://github.com/google-gemini/gemini-cli/pull/16849)
- remove need-triage label from bug_report template by @sehoon38 in
  [#16864](https://github.com/google-gemini/gemini-cli/pull/16864)
- fix(core): truncate large telemetry log entries by @sehoon38 in
  [#16769](https://github.com/google-gemini/gemini-cli/pull/16769)
- docs(extensions): add Agent Skills support and mark feature as experimental by
  @NTaylorMullen in
  [#16859](https://github.com/google-gemini/gemini-cli/pull/16859)
- fix(core): surface warnings for invalid hook event names in configuration
  (#16788) by @sehoon38 in
  [#16873](https://github.com/google-gemini/gemini-cli/pull/16873)
- feat(plan): remove read_many_files from approval mode policies by @jerop in
  [#16876](https://github.com/google-gemini/gemini-cli/pull/16876)
- feat(admin): implement admin controls polling and restart prompt by @skeshive
  in [#16627](https://github.com/google-gemini/gemini-cli/pull/16627)
- Remove LRUCache class migrating to mnemoist by @jacob314 in
  [#16872](https://github.com/google-gemini/gemini-cli/pull/16872)
- feat(settings): rename negative settings to positive naming (disable* ->
  enable*) by @afarber in
  [#14142](https://github.com/google-gemini/gemini-cli/pull/14142)
- refactor(cli): unify shell confirmation dialogs by @NTaylorMullen in
  [#16828](https://github.com/google-gemini/gemini-cli/pull/16828)
- feat(agent): enable agent skills by default by @NTaylorMullen in
  [#16736](https://github.com/google-gemini/gemini-cli/pull/16736)
- refactor(core): foundational truncation refactoring and token estimation
  optimization by @NTaylorMullen in
  [#16824](https://github.com/google-gemini/gemini-cli/pull/16824)
- fix(hooks): enable /hooks disable to reliably stop single hooks by
  @abhipatel12 in
  [#16804](https://github.com/google-gemini/gemini-cli/pull/16804)
- Don't commit unless user asks us to. by @gundermanc in
  [#16902](https://github.com/google-gemini/gemini-cli/pull/16902)
- chore: remove a2a-adapter and bump @a2a-js/sdk to 0.3.8 by @adamfweidman in
  [#16800](https://github.com/google-gemini/gemini-cli/pull/16800)
- fix: Show experiment values in settings UI for compressionThreshold by
  @ishaanxgupta in
  [#16267](https://github.com/google-gemini/gemini-cli/pull/16267)
- feat(cli): replace relative keyboard shortcuts link with web URL by
  @imaliabbas in
  [#16479](https://github.com/google-gemini/gemini-cli/pull/16479)
- fix(core): resolve PKCE length issue and stabilize OAuth redirect port by
  @sehoon38 in [#16815](https://github.com/google-gemini/gemini-cli/pull/16815)
- Delete rewind documentation for now by @Adib234 in
  [#16932](https://github.com/google-gemini/gemini-cli/pull/16932)
- Stabilize skill-creator CI and package format by @NTaylorMullen in
  [#17001](https://github.com/google-gemini/gemini-cli/pull/17001)
- Stabilize the git evals by @gundermanc in
  [#16989](https://github.com/google-gemini/gemini-cli/pull/16989)
- fix(core): attempt compression before context overflow check by @NTaylorMullen
  in [#16914](https://github.com/google-gemini/gemini-cli/pull/16914)
- Fix inverted logic. by @gundermanc in
  [#17007](https://github.com/google-gemini/gemini-cli/pull/17007)
- chore(scripts): add duplicate issue closer script and fix lint errors by
  @bdmorgan in [#16997](https://github.com/google-gemini/gemini-cli/pull/16997)
- docs: update README and config guide to reference Gemini 3 by @JayadityaGit in
  [#15806](https://github.com/google-gemini/gemini-cli/pull/15806)
- fix(cli): correct Homebrew installation detection by @kij in
  [#14727](https://github.com/google-gemini/gemini-cli/pull/14727)
- Demote git evals to nightly run. by @gundermanc in
  [#17030](https://github.com/google-gemini/gemini-cli/pull/17030)
- fix(cli): use OSC-52 clipboard copy in Windows Terminal by @Thomas-Shephard in
  [#16920](https://github.com/google-gemini/gemini-cli/pull/16920)
- Fix: Process all parts in response chunks when thought is first by @pyrytakala
  in [#13539](https://github.com/google-gemini/gemini-cli/pull/13539)
- fix(automation): fix jq quoting error in pr-triage.sh by @Kimsoo0119 in
  [#16958](https://github.com/google-gemini/gemini-cli/pull/16958)
- refactor(core): decouple scheduler into orchestration, policy, and
  confirmation by @abhipatel12 in
  [#16895](https://github.com/google-gemini/gemini-cli/pull/16895)
- feat: add /introspect slash command by @NTaylorMullen in
  [#17048](https://github.com/google-gemini/gemini-cli/pull/17048)
- refactor(cli): centralize tool mapping and decouple legacy scheduler by
  @abhipatel12 in
  [#17044](https://github.com/google-gemini/gemini-cli/pull/17044)
- fix(ui): ensure rationale renders before tool calls by @NTaylorMullen in
  [#17043](https://github.com/google-gemini/gemini-cli/pull/17043)
- fix(workflows): use author_association for maintainer check by @bdmorgan in
  [#17060](https://github.com/google-gemini/gemini-cli/pull/17060)
- fix return type of fireSessionStartEvent to defaultHookOutput by @ved015 in
  [#16833](https://github.com/google-gemini/gemini-cli/pull/16833)
- feat(cli): add experiment gate for event-driven scheduler by @abhipatel12 in
  [#17055](https://github.com/google-gemini/gemini-cli/pull/17055)
- feat(core): improve shell redirection transparency and security by
  @NTaylorMullen in
  [#16486](https://github.com/google-gemini/gemini-cli/pull/16486)
- fix(core): deduplicate ModelInfo emission in GeminiClient by @NTaylorMullen in
  [#17075](https://github.com/google-gemini/gemini-cli/pull/17075)
- docs(themes): remove unsupported DiffModified color key by @jw409 in
  [#17073](https://github.com/google-gemini/gemini-cli/pull/17073)
- fix: update currentSequenceModel when modelChanged by @adamfweidman in
  [#17051](https://github.com/google-gemini/gemini-cli/pull/17051)
- feat(core): enhanced anchored iterative context compression with
  self-verification by @rmedranollamas in
  [#15710](https://github.com/google-gemini/gemini-cli/pull/15710)
- Fix mcp instructions by @chrstnb in
  [#16439](https://github.com/google-gemini/gemini-cli/pull/16439)
- [A2A] Disable checkpointing if git is not installed by @cocosheng-g in
  [#16896](https://github.com/google-gemini/gemini-cli/pull/16896)
- feat(admin): set admin.skills.enabled based on advancedFeaturesEnabled setting
  by @skeshive in
  [#17095](https://github.com/google-gemini/gemini-cli/pull/17095)
- Test coverage for hook exit code cases by @gundermanc in
  [#17041](https://github.com/google-gemini/gemini-cli/pull/17041)
- Revert "Revert "Update extension examples"" by @chrstnb in
  [#16445](https://github.com/google-gemini/gemini-cli/pull/16445)
- fix(core): Provide compact, actionable errors for agent delegation failures by
  @SandyTao520 in
  [#16493](https://github.com/google-gemini/gemini-cli/pull/16493)
- fix: migrate BeforeModel and AfterModel hooks to HookSystem by @ved015 in
  [#16599](https://github.com/google-gemini/gemini-cli/pull/16599)
- feat(admin): apply admin settings to gemini skills/mcp/extensions commands by
  @skeshive in [#17102](https://github.com/google-gemini/gemini-cli/pull/17102)
- fix(core): update telemetry token count after session resume by @psinha40898
  in [#15491](https://github.com/google-gemini/gemini-cli/pull/15491)
- Demote the subagent test to nightly by @gundermanc in
  [#17105](https://github.com/google-gemini/gemini-cli/pull/17105)
- feat(plan): telemetry to track adoption and usage of plan mode by @Adib234 in
  [#16863](https://github.com/google-gemini/gemini-cli/pull/16863)
- feat: Add flash lite utility fallback chain by @adamfweidman in
  [#17056](https://github.com/google-gemini/gemini-cli/pull/17056)
- Fixes Windows crash: "Cannot resize a pty that has already exited" by @dzammit
  in [#15757](https://github.com/google-gemini/gemini-cli/pull/15757)
- feat(core): Add initial eval for generalist agent. by @joshualitt in
  [#16856](https://github.com/google-gemini/gemini-cli/pull/16856)
- feat(core): unify agent enabled and disabled flags by @SandyTao520 in
  [#17127](https://github.com/google-gemini/gemini-cli/pull/17127)
- fix(core): resolve auto model in default strategy by @sehoon38 in
  [#17116](https://github.com/google-gemini/gemini-cli/pull/17116)
- docs: update project context and pr-creator workflow by @NTaylorMullen in
  [#17119](https://github.com/google-gemini/gemini-cli/pull/17119)
- fix(cli): send gemini-cli version as mcp client version by @dsp in
  [#13407](https://github.com/google-gemini/gemini-cli/pull/13407)
- fix(cli): resolve Ctrl+Enter and Ctrl+J newline issues by @imadraude in
  [#17021](https://github.com/google-gemini/gemini-cli/pull/17021)
- Remove missing sidebar item by @chrstnb in
  [#17145](https://github.com/google-gemini/gemini-cli/pull/17145)
- feat(core): Ensure all properties in hooks object are event names. by
  @joshualitt in
  [#16870](https://github.com/google-gemini/gemini-cli/pull/16870)
- fix(cli): fix newline support broken in previous PR by @scidomino in
  [#17159](https://github.com/google-gemini/gemini-cli/pull/17159)
- Add interactive ValidationDialog for handling 403 VALIDATION_REQUIRED errors.
  by @gsquared94 in
  [#16231](https://github.com/google-gemini/gemini-cli/pull/16231)
- Add Esc-Esc to clear prompt when it's not empty by @Adib234 in
  [#17131](https://github.com/google-gemini/gemini-cli/pull/17131)
- Avoid spurious warnings about unexpected renders triggered by appEvents and
  coreEvents. by @jacob314 in
  [#17160](https://github.com/google-gemini/gemini-cli/pull/17160)
- fix(cli): resolve home/end keybinding conflict by @scidomino in
  [#17124](https://github.com/google-gemini/gemini-cli/pull/17124)
- fix(cli): display 'http' type on mcp list by @pamanta in
  [#16915](https://github.com/google-gemini/gemini-cli/pull/16915)
- fix bad fallback logic external editor logic by @scidomino in
  [#17166](https://github.com/google-gemini/gemini-cli/pull/17166)
- Fix bug where System scopes weren't migrated. by @jacob314 in
  [#17174](https://github.com/google-gemini/gemini-cli/pull/17174)
- Fix mcp tool lookup in tool registry by @werdnum in
  [#17054](https://github.com/google-gemini/gemini-cli/pull/17054)

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.25.2...v0.26.0
