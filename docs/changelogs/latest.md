# Latest stable release: v0.25.0

Released: January 20, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Skills and Agents Improvements:** Enhanced `activate_skill` tool, new
  `pr-creator` skill, default enablement of skills, improved `cli_help` agent,
  and a new `/agents refresh` command.
- **UI/UX Refinements:** Transparent feedback for skills, ability to switch
  focus between shell and input with Tab, and dynamic terminal tab titles.
- **Core Functionality & Performance:** Support for built-in agent skills,
  refined Gemini 3 system instructions, caching ignore instances for
  performance, and improved retry mechanisms.
- **Bug Fixes and Stability:** Numerous bug fixes across the CLI, core, and
  workflows, including issues with subagent delegation, unicode character
  crashes, and sticky header regressions.

## What's Changed

- feat(core): improve activate_skill tool and use lowercase XML tags by
  @NTaylorMullen in
  [#16009](https://github.com/google-gemini/gemini-cli/pull/16009)
- Add initiation method telemetry property by @gundermanc in
  [#15818](https://github.com/google-gemini/gemini-cli/pull/15818)
- chore(release): bump version to 0.25.0-nightly.20260107.59a18e710 by
  @gemini-cli-robot in
  [#16048](https://github.com/google-gemini/gemini-cli/pull/16048)
- Hx support by @kevinfjiang in
  [#16032](https://github.com/google-gemini/gemini-cli/pull/16032)
- [Skills] Foundation: Centralize management logic and feedback rendering by
  @NTaylorMullen in
  [#15952](https://github.com/google-gemini/gemini-cli/pull/15952)
- Introduce GEMINI_CLI_HOME for strict test isolation by @NTaylorMullen in
  [#15907](https://github.com/google-gemini/gemini-cli/pull/15907)
- [Skills] Multi-scope skill enablement and shadowing fix by @NTaylorMullen in
  [#15953](https://github.com/google-gemini/gemini-cli/pull/15953)
- policy: extract legacy policy from core tool scheduler to policy engine by
  @abhipatel12 in
  [#15902](https://github.com/google-gemini/gemini-cli/pull/15902)
- Enhance TestRig with process management and timeouts by @NTaylorMullen in
  [#15908](https://github.com/google-gemini/gemini-cli/pull/15908)
- Update troubleshooting doc for UNABLE_TO_GET_ISSUER_CERT_LOCALLY by @sehoon38
  in [#16069](https://github.com/google-gemini/gemini-cli/pull/16069)
- Add keytar to dependencies by @chrstnb in
  [#15928](https://github.com/google-gemini/gemini-cli/pull/15928)
- Simplify extension settings command by @chrstnb in
  [#16001](https://github.com/google-gemini/gemini-cli/pull/16001)
- feat(admin): implement extensions disabled by @skeshive in
  [#16024](https://github.com/google-gemini/gemini-cli/pull/16024)
- Core data structure updates for Rewind functionality by @Adib234 in
  [#15714](https://github.com/google-gemini/gemini-cli/pull/15714)
- feat(hooks): simplify hook firing with HookSystem wrapper methods by @ved015
  in [#15982](https://github.com/google-gemini/gemini-cli/pull/15982)
- Add exp.gws_experiment field to LogEventEntry by @gsquared94 in
  [#16062](https://github.com/google-gemini/gemini-cli/pull/16062)
- Revert "feat(admin): implement extensions disabled" by @chrstnb in
  [#16082](https://github.com/google-gemini/gemini-cli/pull/16082)
- feat(core): Decouple enabling hooks UI from subsystem. by @joshualitt in
  [#16074](https://github.com/google-gemini/gemini-cli/pull/16074)
- docs: add docs for hooks + extensions by @abhipatel12 in
  [#16073](https://github.com/google-gemini/gemini-cli/pull/16073)
- feat(core): Preliminary changes for subagent model routing. by @joshualitt in
  [#16035](https://github.com/google-gemini/gemini-cli/pull/16035)
- Optimize CI workflow: Parallelize jobs and cache linters by @NTaylorMullen in
  [#16054](https://github.com/google-gemini/gemini-cli/pull/16054)
- Add option to fallback for capacity errors in ProQuotaDi… by @sehoon38 in
  [#16050](https://github.com/google-gemini/gemini-cli/pull/16050)
- feat: add confirmation details support + jsonrpc vs http rest support by
  @adamfweidman in
  [#16079](https://github.com/google-gemini/gemini-cli/pull/16079)
- fix(workflows): fix and limit labels for pr-triage.sh script by @jacob314 in
  [#16096](https://github.com/google-gemini/gemini-cli/pull/16096)
- Fix and rename introspection agent -> cli help agent by @scidomino in
  [#16097](https://github.com/google-gemini/gemini-cli/pull/16097)
- Docs: Changelogs update 20260105 by @jkcinouye in
  [#15937](https://github.com/google-gemini/gemini-cli/pull/15937)
- enable cli_help agent by default by @scidomino in
  [#16100](https://github.com/google-gemini/gemini-cli/pull/16100)
- Optimize json-output tests with mock responses by @NTaylorMullen in
  [#16102](https://github.com/google-gemini/gemini-cli/pull/16102)
- Fix CI for forks by @scidomino in
  [#16113](https://github.com/google-gemini/gemini-cli/pull/16113)
- Reduce nags about PRs that reference issues but don't fix them. by @jacob314
  in [#16112](https://github.com/google-gemini/gemini-cli/pull/16112)
- feat(cli): add filepath autosuggestion after slash commands by @jasmeetsb in
  [#14738](https://github.com/google-gemini/gemini-cli/pull/14738)
- Add upgrade option for paid users by @cayden-google in
  [#15978](https://github.com/google-gemini/gemini-cli/pull/15978)
- [Skills] UX Polishing: Transparent feedback and CLI refinements by
  @NTaylorMullen in
  [#15954](https://github.com/google-gemini/gemini-cli/pull/15954)
- Polish: Move 'Failed to load skills' warning to debug logs by @NTaylorMullen
  in [#16142](https://github.com/google-gemini/gemini-cli/pull/16142)
- feat(cli): export chat history in /bug and prefill GitHub issue by
  @NTaylorMullen in
  [#16115](https://github.com/google-gemini/gemini-cli/pull/16115)
- bug(core): fix issue with overrides to bases. by @joshualitt in
  [#15255](https://github.com/google-gemini/gemini-cli/pull/15255)
- enableInteractiveShell for external tooling relying on a2a server by
  @DavidAPierce in
  [#16080](https://github.com/google-gemini/gemini-cli/pull/16080)
- Reapply "feat(admin): implement extensions disabled" (#16082) by @skeshive in
  [#16109](https://github.com/google-gemini/gemini-cli/pull/16109)
- bug(core): Fix spewie getter in hookTranslator.ts by @joshualitt in
  [#16108](https://github.com/google-gemini/gemini-cli/pull/16108)
- feat(hooks): add mcp_context to BeforeTool and AfterTool hook inputs by @vrv
  in [#15656](https://github.com/google-gemini/gemini-cli/pull/15656)
- Add extension linking capabilities in cli by @kevinjwang1 in
  [#16040](https://github.com/google-gemini/gemini-cli/pull/16040)
- Update the page's title to be consistent and show in site. by @kschaab in
  [#16174](https://github.com/google-gemini/gemini-cli/pull/16174)
- docs: correct typo in bufferFastReturn JSDoc ("accomodate" → "accommodate") by
  @minglu7 in [#16056](https://github.com/google-gemini/gemini-cli/pull/16056)
- fix: typo in MCP servers settings description by @alphanota in
  [#15929](https://github.com/google-gemini/gemini-cli/pull/15929)
- fix: yolo should auto allow redirection by @abhipatel12 in
  [#16183](https://github.com/google-gemini/gemini-cli/pull/16183)
- fix(cli): disableYoloMode shouldn't enforce default approval mode against args
  by @psinha40898 in
  [#16155](https://github.com/google-gemini/gemini-cli/pull/16155)
- feat: add native Sublime Text support to IDE detection by @phreakocious in
  [#16083](https://github.com/google-gemini/gemini-cli/pull/16083)
- refactor(core): extract ToolModificationHandler from scheduler by @abhipatel12
  in [#16118](https://github.com/google-gemini/gemini-cli/pull/16118)
- Add support for Antigravity terminal in terminal setup utility by @raky291 in
  [#16051](https://github.com/google-gemini/gemini-cli/pull/16051)
- feat(core): Wire up model routing to subagents. by @joshualitt in
  [#16043](https://github.com/google-gemini/gemini-cli/pull/16043)
- feat(cli): add /agents slash command to list available agents by @adamfweidman
  in [#16182](https://github.com/google-gemini/gemini-cli/pull/16182)
- docs(cli): fix includeDirectories nesting in configuration.md by @maru0804 in
  [#15067](https://github.com/google-gemini/gemini-cli/pull/15067)
- feat: implement file system reversion utilities for rewind by @Adib234 in
  [#15715](https://github.com/google-gemini/gemini-cli/pull/15715)
- Always enable redaction in GitHub actions. by @gundermanc in
  [#16200](https://github.com/google-gemini/gemini-cli/pull/16200)
- fix: remove unsupported 'enabled' key from workflow config by @Han5991 in
  [#15611](https://github.com/google-gemini/gemini-cli/pull/15611)
- docs: Remove redundant and duplicate documentation files by @liqzheng in
  [#14699](https://github.com/google-gemini/gemini-cli/pull/14699)
- docs: shorten run command and use published version by @dsherret in
  [#16172](https://github.com/google-gemini/gemini-cli/pull/16172)
- test(command-registry): increase initialization test timeout by @wszqkzqk in
  [#15979](https://github.com/google-gemini/gemini-cli/pull/15979)
- Ensure TERM is set to xterm-256color by @falouu in
  [#15828](https://github.com/google-gemini/gemini-cli/pull/15828)
- The telemetry.js script should handle paths that contain spaces by @JohnJAS in
  [#12078](https://github.com/google-gemini/gemini-cli/pull/12078)
- ci: guard links workflow from running on forks by @wtanaka in
  [#15461](https://github.com/google-gemini/gemini-cli/pull/15461)
- ci: guard nightly release workflow from running on forks by @wtanaka in
  [#15463](https://github.com/google-gemini/gemini-cli/pull/15463)
- Support @ suggestions for subagenets by @sehoon38 in
  [#16201](https://github.com/google-gemini/gemini-cli/pull/16201)
- feat(hooks): Support explicit stop and block execution control in model hooks
  by @SandyTao520 in
  [#15947](https://github.com/google-gemini/gemini-cli/pull/15947)
- Refine Gemini 3 system instructions to reduce model verbosity by
  @NTaylorMullen in
  [#16139](https://github.com/google-gemini/gemini-cli/pull/16139)
- chore: clean up unused models and use consts by @sehoon38 in
  [#16246](https://github.com/google-gemini/gemini-cli/pull/16246)
- Always enable bracketed paste by @scidomino in
  [#16179](https://github.com/google-gemini/gemini-cli/pull/16179)
- refactor: migrate clearCommand hook calls to HookSystem by @ved015 in
  [#16157](https://github.com/google-gemini/gemini-cli/pull/16157)
- refactor: migrate app containter hook calls to hook system by @ishaanxgupta in
  [#16161](https://github.com/google-gemini/gemini-cli/pull/16161)
- Show settings source in extensions lists by @chrstnb in
  [#16207](https://github.com/google-gemini/gemini-cli/pull/16207)
- feat(skills): add pr-creator skill and enable skills by @NTaylorMullen in
  [#16232](https://github.com/google-gemini/gemini-cli/pull/16232)
- fix: handle Shift+Space in Kitty keyboard protocol terminals by @tt-a1i in
  [#15767](https://github.com/google-gemini/gemini-cli/pull/15767)
- feat(core, ui): Add /agents refresh command. by @joshualitt in
  [#16204](https://github.com/google-gemini/gemini-cli/pull/16204)
- feat(core): add local experiments override via GEMINI_EXP by @kevin-ramdass in
  [#16181](https://github.com/google-gemini/gemini-cli/pull/16181)
- feat(ui): reduce home directory warning noise and add opt-out setting by
  @NTaylorMullen in
  [#16229](https://github.com/google-gemini/gemini-cli/pull/16229)
- refactor: migrate chatCompressionService to use HookSystem by @ved015 in
  [#16259](https://github.com/google-gemini/gemini-cli/pull/16259)
- fix: properly use systemMessage for hooks in UI by @jackwotherspoon in
  [#16250](https://github.com/google-gemini/gemini-cli/pull/16250)
- Infer modifyOtherKeys support by @scidomino in
  [#16270](https://github.com/google-gemini/gemini-cli/pull/16270)
- feat(core): Cache ignore instances for performance by @EricRahm in
  [#16185](https://github.com/google-gemini/gemini-cli/pull/16185)
- feat: apply remote admin settings (no-op) by @skeshive in
  [#16106](https://github.com/google-gemini/gemini-cli/pull/16106)
- Autogenerate docs/cli/settings.md docs/getting-started/configuration.md was
  already autogenerated but settings.md was not. by @jacob314 in
  [#14408](https://github.com/google-gemini/gemini-cli/pull/14408)
- refactor(config): remove legacy V1 settings migration logic by @galz10 in
  [#16252](https://github.com/google-gemini/gemini-cli/pull/16252)
- Fix an issue where the agent stops prematurely by @gundermanc in
  [#16269](https://github.com/google-gemini/gemini-cli/pull/16269)
- Update system prompt to prefer non-interactive commands by @NTaylorMullen in
  [#16117](https://github.com/google-gemini/gemini-cli/pull/16117)
- Update ink version to 6.4.7 by @jacob314 in
  [#16284](https://github.com/google-gemini/gemini-cli/pull/16284)
- Support for Built-in Agent Skills by @NTaylorMullen in
  [#16045](https://github.com/google-gemini/gemini-cli/pull/16045)
- fix(skills): remove "Restart required" message from non-interactive commands
  by @NTaylorMullen in
  [#16307](https://github.com/google-gemini/gemini-cli/pull/16307)
- remove unused sessionHookTriggers and exports by @ved015 in
  [#16324](https://github.com/google-gemini/gemini-cli/pull/16324)
- Triage action cleanup by @bdmorgan in
  [#16319](https://github.com/google-gemini/gemini-cli/pull/16319)
- fix: Add event-driven trigger to issue triage workflow by @bdmorgan in
  [#16334](https://github.com/google-gemini/gemini-cli/pull/16334)
- fix(workflows): resolve triage workflow failures and actionlint errors by
  @bdmorgan in [#16338](https://github.com/google-gemini/gemini-cli/pull/16338)
- docs: add note about experimental hooks by @abhipatel12 in
  [#16337](https://github.com/google-gemini/gemini-cli/pull/16337)
- feat(cli): implement passive activity logger for session analysis by
  @SandyTao520 in
  [#15829](https://github.com/google-gemini/gemini-cli/pull/15829)
- feat(cli): add /chat debug command for nightly builds by @abhipatel12 in
  [#16339](https://github.com/google-gemini/gemini-cli/pull/16339)
- style: format pr-creator skill by @NTaylorMullen in
  [#16381](https://github.com/google-gemini/gemini-cli/pull/16381)
- feat(cli): Hooks enable-all/disable-all feature with dynamic status by
  @AbdulTawabJuly in
  [#15552](https://github.com/google-gemini/gemini-cli/pull/15552)
- fix(core): ensure silent local subagent delegation while allowing remote
  confirmation by @adamfweidman in
  [#16395](https://github.com/google-gemini/gemini-cli/pull/16395)
- Markdown w/ Frontmatter Agent Parser by @sehoon38 in
  [#16094](https://github.com/google-gemini/gemini-cli/pull/16094)
- Fix crash on unicode character by @chrstnb in
  [#16420](https://github.com/google-gemini/gemini-cli/pull/16420)
- Attempt to resolve OOM w/ useMemo on history items by @chrstnb in
  [#16424](https://github.com/google-gemini/gemini-cli/pull/16424)
- fix(core): ensure sub-agent schema and prompt refresh during runtime by
  @adamfweidman in
  [#16409](https://github.com/google-gemini/gemini-cli/pull/16409)
- Update extension examples by @chrstnb in
  [#16274](https://github.com/google-gemini/gemini-cli/pull/16274)
- revert the change that was recently added from a fix by @sehoon38 in
  [#16390](https://github.com/google-gemini/gemini-cli/pull/16390)
- Add other hook wrapper methods to hooksystem by @ved015 in
  [#16361](https://github.com/google-gemini/gemini-cli/pull/16361)
- feat: introduce useRewindLogic hook for conversation history navigation by
  @Adib234 in [#15716](https://github.com/google-gemini/gemini-cli/pull/15716)
- docs: Fix formatting issue in memport documentation by @wanglc02 in
  [#14774](https://github.com/google-gemini/gemini-cli/pull/14774)
- fix(policy): enhance shell command safety and parsing by @allenhutchison in
  [#15034](https://github.com/google-gemini/gemini-cli/pull/15034)
- fix(core): avoid 'activate_skill' re-registration warning by @NTaylorMullen in
  [#16398](https://github.com/google-gemini/gemini-cli/pull/16398)
- perf(workflows): optimize PR triage script for faster execution by @bdmorgan
  in [#16355](https://github.com/google-gemini/gemini-cli/pull/16355)
- feat(admin): prompt user to restart the CLI if they change auth to oauth
  mid-session or don't have auth type selected at start of session by @skeshive
  in [#16426](https://github.com/google-gemini/gemini-cli/pull/16426)
- Update cli-help agent's system prompt in sub-agents section by @sehoon38 in
  [#16441](https://github.com/google-gemini/gemini-cli/pull/16441)
- Revert "Update extension examples" by @chrstnb in
  [#16442](https://github.com/google-gemini/gemini-cli/pull/16442)
- Fix: add back fastreturn support by @scidomino in
  [#16440](https://github.com/google-gemini/gemini-cli/pull/16440)
- feat(a2a): Introduce /memory command for a2a server by @cocosheng-g in
  [#14456](https://github.com/google-gemini/gemini-cli/pull/14456)
- docs: fix broken internal link by using relative path by @Gong-Mi in
  [#15371](https://github.com/google-gemini/gemini-cli/pull/15371)
- migrate yolo/auto-edit keybindings by @scidomino in
  [#16457](https://github.com/google-gemini/gemini-cli/pull/16457)
- feat(cli): add install and uninstall commands for skills by @NTaylorMullen in
  [#16377](https://github.com/google-gemini/gemini-cli/pull/16377)
- feat(ui): use Tab to switch focus between shell and input by @jacob314 in
  [#14332](https://github.com/google-gemini/gemini-cli/pull/14332)
- feat(core): support shipping built-in skills with the CLI by @NTaylorMullen in
  [#16300](https://github.com/google-gemini/gemini-cli/pull/16300)
- Collect hardware details telemetry. by @gundermanc in
  [#16119](https://github.com/google-gemini/gemini-cli/pull/16119)
- feat(agents): improve UI feedback and parser reliability by @NTaylorMullen in
  [#16459](https://github.com/google-gemini/gemini-cli/pull/16459)
- Migrate keybindings by @scidomino in
  [#16460](https://github.com/google-gemini/gemini-cli/pull/16460)
- feat(cli): cleanup activity logs alongside session files by @SandyTao520 in
  [#16399](https://github.com/google-gemini/gemini-cli/pull/16399)
- feat(cli): implement dynamic terminal tab titles for CLI status by
  @NTaylorMullen in
  [#16378](https://github.com/google-gemini/gemini-cli/pull/16378)
- feat(core): add disableLLMCorrection setting to skip auto-correction in edit
  tools by @SandyTao520 in
  [#16000](https://github.com/google-gemini/gemini-cli/pull/16000)
- fix: Set both tab and window title instead of just window title by
  @NTaylorMullen in
  [#16464](https://github.com/google-gemini/gemini-cli/pull/16464)
- fix(policy): ensure MCP policies match unqualified names in non-interactive
  mode by @NTaylorMullen in
  [#16490](https://github.com/google-gemini/gemini-cli/pull/16490)
- fix(cli): refine 'Action Required' indicator and focus hints by @NTaylorMullen
  in [#16497](https://github.com/google-gemini/gemini-cli/pull/16497)
- Refactor beforeAgent and afterAgent hookEvents to follow desired output by
  @ved015 in [#16495](https://github.com/google-gemini/gemini-cli/pull/16495)
- feat(agents): clarify mandatory YAML frontmatter for sub-agents by
  @NTaylorMullen in
  [#16515](https://github.com/google-gemini/gemini-cli/pull/16515)
- docs(telemetry): add Google Cloud Monitoring dashboard documentation by @jerop
  in [#16520](https://github.com/google-gemini/gemini-cli/pull/16520)
- Implement support for subagents as extensions. by @gundermanc in
  [#16473](https://github.com/google-gemini/gemini-cli/pull/16473)
- refactor: make baseTimestamp optional in addItem and remove redundant calls by
  @sehoon38 in [#16471](https://github.com/google-gemini/gemini-cli/pull/16471)
- Improve key binding names and descriptions by @scidomino in
  [#16529](https://github.com/google-gemini/gemini-cli/pull/16529)
- feat(core, cli): Add support for agents in settings.json. by @joshualitt in
  [#16433](https://github.com/google-gemini/gemini-cli/pull/16433)
- fix(cli): fix 'gemini skills install' unknown argument error by @NTaylorMullen
  in [#16537](https://github.com/google-gemini/gemini-cli/pull/16537)
- chore(ui): optimize AgentsStatus layout with dense list style and group
  separation by @adamfweidman in
  [#16545](https://github.com/google-gemini/gemini-cli/pull/16545)
- fix(cli): allow @ file selector on slash command lines by @galz10 in
  [#16370](https://github.com/google-gemini/gemini-cli/pull/16370)
- fix(ui): resolve sticky header regression in tool messages by @jacob314 in
  [#16514](https://github.com/google-gemini/gemini-cli/pull/16514)
- feat(core): Align internal agent settings with configs exposed through
  settings.json by @joshualitt in
  [#16458](https://github.com/google-gemini/gemini-cli/pull/16458)
- fix(cli): copy uses OSC52 only in SSH/WSL by @assagman in
  [#16554](https://github.com/google-gemini/gemini-cli/pull/16554)
- docs(skills): clarify skill directory structure and file location by
  @NTaylorMullen in
  [#16532](https://github.com/google-gemini/gemini-cli/pull/16532)
- Fix: make ctrl+x use preferred editor by @scidomino in
  [#16556](https://github.com/google-gemini/gemini-cli/pull/16556)
- fix(core): Resolve race condition in tool response reporting by @abhipatel12
  in [#16557](https://github.com/google-gemini/gemini-cli/pull/16557)
- feat(ui): highlight persist mode status in ModelDialog by @sehoon38 in
  [#16483](https://github.com/google-gemini/gemini-cli/pull/16483)
- refactor: clean up A2A task output for users and LLMs by @adamfweidman in
  [#16561](https://github.com/google-gemini/gemini-cli/pull/16561)
- feat(core/ui): enhance retry mechanism and UX by @sehoon38 in
  [#16489](https://github.com/google-gemini/gemini-cli/pull/16489)
- Modernize MaxSizedBox to use and ResizeObservers by @jacob314 in
  [#16565](https://github.com/google-gemini/gemini-cli/pull/16565)
- Behavioral evals framework. by @gundermanc in
  [#16047](https://github.com/google-gemini/gemini-cli/pull/16047)
- Aggregate test results. by @gundermanc in
  [#16581](https://github.com/google-gemini/gemini-cli/pull/16581)
- feat(admin): support admin-enforced settings for Agent Skills by
  @NTaylorMullen in
  [#16406](https://github.com/google-gemini/gemini-cli/pull/16406)
- fix(patch): cherry-pick cfdc4cf to release/v0.25.0-preview.0-pr-16759 to patch
  version v0.25.0-preview.0 and create version 0.25.0-preview.1 by
  @gemini-cli-robot in
  [#16866](https://github.com/google-gemini/gemini-cli/pull/16866)
- Patch #16730 into v0.25.0 preview by @chrstnb in
  [#16882](https://github.com/google-gemini/gemini-cli/pull/16882)
- fix(patch): cherry-pick 3b55581 to release/v0.25.0-preview.2-pr-16506 to patch
  version v0.25.0-preview.2 and create version 0.25.0-preview.3 by
  @gemini-cli-robot in
  [#17098](https://github.com/google-gemini/gemini-cli/pull/17098)

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.24.5...v0.25.0
