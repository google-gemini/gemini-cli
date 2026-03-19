# Latest stable release: v0.34.0

Released: March 17, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Plan Mode Enabled by Default**: The comprehensive planning capability is now
  enabled by default, allowing for better structured task management and
  execution.
- **Enhanced Sandboxing Capabilities**: Added support for native gVisor (runsc)
  sandboxing as well as experimental LXC container sandboxing to provide more
  robust and isolated execution environments.
- **Improved Loop Detection & Recovery**: Implemented iterative loop detection
  and model feedback mechanisms to prevent the CLI from getting stuck in
  repetitive actions.
- **Customizable UI Elements**: You can now configure a custom footer using the
  new `/footer` command, and enjoy standardized semantic focus colors for better
  history visibility.
- **Extensive Subagent Updates**: Refinements across the tracker visualization
  tools, background process logging, and broader fallback support for models in
  tool execution scenarios.

## What's Changed

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
- feat(voice): implement speech-friendly response formatter by @ayush31010 in
  [#20989](https://github.com/google-gemini/gemini-cli/pull/20989)
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
- fix(patch): cherry-pick 45faf4d to release/v0.34.0-preview.0-pr-22148
  [CONFLICTS] by @gemini-cli-robot in
  [#22174](https://github.com/google-gemini/gemini-cli/pull/22174)
- fix(patch): cherry-pick 8432bce to release/v0.34.0-preview.1-pr-22069 to patch
  version v0.34.0-preview.1 and create version 0.34.0-preview.2 by
  @gemini-cli-robot in
  [#22205](https://github.com/google-gemini/gemini-cli/pull/22205)
- fix(patch): cherry-pick 24adacd to release/v0.34.0-preview.2-pr-22332 to patch
  version v0.34.0-preview.2 and create version 0.34.0-preview.3 by
  @gemini-cli-robot in
  [#22391](https://github.com/google-gemini/gemini-cli/pull/22391)
- fix(patch): cherry-pick 48130eb to release/v0.34.0-preview.3-pr-22665 to patch
  version v0.34.0-preview.3 and create version 0.34.0-preview.4 by
  @gemini-cli-robot in
  [#22719](https://github.com/google-gemini/gemini-cli/pull/22719)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.33.2...v0.34.0
