# Preview release: v0.38.0-preview.0

Released: April 08, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Context Management:** Introduced a Context Compression Service to optimize
  context window usage and landed a background memory service for skill
  extraction.
- **Enhanced Security:** Implemented context-aware persistent policy approvals
  for smarter tool permissions and enabled `web_fetch` in plan mode with user
  confirmation.
- **Workflow Monitoring:** Added background process monitoring and inspection
  tools for better visibility into long-running tasks.
- **UI/UX Refinements:** Enhanced the tool confirmation UI, selection layout,
  and added support for selective topic expansion and click-to-expand.
- **Core Stability:** Improved sandbox reliability on Linux and Windows,
  resolved shebang compatibility issues, and fixed various crashes in the CLI
  and core services.

## What's Changed

- fix(cli): refresh slash command list after /skills reload by @NTaylorMullen in
  [#24454](https://github.com/google-gemini/gemini-cli/pull/24454)
- Update README.md for links. by @g-samroberts in
  [#22759](https://github.com/google-gemini/gemini-cli/pull/22759)
- fix(core): ensure complete_task tool calls are recorded in chat history by
  @abhipatel12 in
  [#24437](https://github.com/google-gemini/gemini-cli/pull/24437)
- feat(policy): explicitly allow web_fetch in plan mode with ask_user by
  @Adib234 in [#24456](https://github.com/google-gemini/gemini-cli/pull/24456)
- fix(core): refactor linux sandbox to fix ARG_MAX crashes by @ehedlund in
  [#24286](https://github.com/google-gemini/gemini-cli/pull/24286)
- feat(config): add experimental.adk.agentSessionNoninteractiveEnabled setting
  by @adamfweidman in
  [#24439](https://github.com/google-gemini/gemini-cli/pull/24439)
- Changelog for v0.36.0-preview.8 by @gemini-cli-robot in
  [#24453](https://github.com/google-gemini/gemini-cli/pull/24453)
- feat(cli): change default loadingPhrases to 'off' to hide tips by @keithguerin
  in [#24342](https://github.com/google-gemini/gemini-cli/pull/24342)
- fix(cli): ensure agent stops when all declinable tools are cancelled by
  @NTaylorMullen in
  [#24479](https://github.com/google-gemini/gemini-cli/pull/24479)
- fix(core): enhance sandbox usability and fix build error by @galz10 in
  [#24460](https://github.com/google-gemini/gemini-cli/pull/24460)
- Terminal Serializer Optimization by @jacob314 in
  [#24485](https://github.com/google-gemini/gemini-cli/pull/24485)
- Auto configure memory. by @jacob314 in
  [#24474](https://github.com/google-gemini/gemini-cli/pull/24474)
- Unused error variables in catch block are not allowed by @alisa-alisa in
  [#24487](https://github.com/google-gemini/gemini-cli/pull/24487)
- feat(core): add background memory service for skill extraction by @SandyTao520
  in [#24274](https://github.com/google-gemini/gemini-cli/pull/24274)
- feat: implement high-signal PR regression check for evaluations by
  @alisa-alisa in
  [#23937](https://github.com/google-gemini/gemini-cli/pull/23937)
- Fix shell output display by @jacob314 in
  [#24490](https://github.com/google-gemini/gemini-cli/pull/24490)
- fix(ui): resolve unwanted vertical spacing around various tool output
  treatments by @jwhelangoog in
  [#24449](https://github.com/google-gemini/gemini-cli/pull/24449)
- revert(cli): bring back input box and footer visibility in copy mode by
  @sehoon38 in [#24504](https://github.com/google-gemini/gemini-cli/pull/24504)
- fix(cli): prevent crash in AnsiOutputText when handling non-array data by
  @sehoon38 in [#24498](https://github.com/google-gemini/gemini-cli/pull/24498)
- feat(cli): support default values for environment variables by @ruomengz in
  [#24469](https://github.com/google-gemini/gemini-cli/pull/24469)
- Implement background process monitoring and inspection tools by @cocosheng-g
  in [#23799](https://github.com/google-gemini/gemini-cli/pull/23799)
- docs(browser-agent): update stale browser agent documentation by @gsquared94
  in [#24463](https://github.com/google-gemini/gemini-cli/pull/24463)
- fix: enable browser_agent in integration tests and add localhost fixture tests
  by @gsquared94 in
  [#24523](https://github.com/google-gemini/gemini-cli/pull/24523)
- fix(browser): handle computer-use model detection for analyze_screenshot by
  @gsquared94 in
  [#24502](https://github.com/google-gemini/gemini-cli/pull/24502)
- feat(core): Land ContextCompressionService by @joshualitt in
  [#24483](https://github.com/google-gemini/gemini-cli/pull/24483)
- feat(core): scope subagent workspace directories via AsyncLocalStorage by
  @SandyTao520 in
  [#24445](https://github.com/google-gemini/gemini-cli/pull/24445)
- Update ink version to 6.6.7 by @jacob314 in
  [#24514](https://github.com/google-gemini/gemini-cli/pull/24514)
- fix(acp): handle all InvalidStreamError types gracefully in prompt by @sripasg
  in [#24540](https://github.com/google-gemini/gemini-cli/pull/24540)
- Fix crash when vim editor is not found in PATH on Windows by
  @Nagajyothi-tammisetti in
  [#22423](https://github.com/google-gemini/gemini-cli/pull/22423)
- fix(core): move project memory dir under tmp directory by @SandyTao520 in
  [#24542](https://github.com/google-gemini/gemini-cli/pull/24542)
- Enable 'Other' option for yesno question type by @ruomengz in
  [#24545](https://github.com/google-gemini/gemini-cli/pull/24545)
- fix(cli): clear stale retry/loading state after cancellation (#21096) by
  @Aaxhirrr in [#21960](https://github.com/google-gemini/gemini-cli/pull/21960)
- Changelog for v0.37.0-preview.0 by @gemini-cli-robot in
  [#24464](https://github.com/google-gemini/gemini-cli/pull/24464)
- feat(core): implement context-aware persistent policy approvals by @jerop in
  [#23257](https://github.com/google-gemini/gemini-cli/pull/23257)
- docs: move agent disabling instructions and update remote agent status by
  @jackwotherspoon in
  [#24559](https://github.com/google-gemini/gemini-cli/pull/24559)
- feat(cli): migrate nonInteractiveCli to LegacyAgentSession by @adamfweidman in
  [#22987](https://github.com/google-gemini/gemini-cli/pull/22987)
- fix(core): unsafe type assertions in Core File System #19712 by
  @aniketsaurav18 in
  [#19739](https://github.com/google-gemini/gemini-cli/pull/19739)
- fix(ui): hide model quota in /stats and refactor quota display by @danzaharia1
  in [#24206](https://github.com/google-gemini/gemini-cli/pull/24206)
- Changelog for v0.36.0 by @gemini-cli-robot in
  [#24558](https://github.com/google-gemini/gemini-cli/pull/24558)
- Changelog for v0.37.0-preview.1 by @gemini-cli-robot in
  [#24568](https://github.com/google-gemini/gemini-cli/pull/24568)
- docs: add missing .md extensions to internal doc links by @ishaan-arora-1 in
  [#24145](https://github.com/google-gemini/gemini-cli/pull/24145)
- fix(ui): fixed table styling by @devr0306 in
  [#24565](https://github.com/google-gemini/gemini-cli/pull/24565)
- fix(core): pass includeDirectories to sandbox configuration by @galz10 in
  [#24573](https://github.com/google-gemini/gemini-cli/pull/24573)
- feat(ui): enable "TerminalBuffer" mode to solve flicker by @jacob314 in
  [#24512](https://github.com/google-gemini/gemini-cli/pull/24512)
- docs: clarify release coordination by @scidomino in
  [#24575](https://github.com/google-gemini/gemini-cli/pull/24575)
- fix(core): remove broken PowerShell translation and fix native \_\_write in
  Windows sandbox by @scidomino in
  [#24571](https://github.com/google-gemini/gemini-cli/pull/24571)
- Add instructions for how to start react in prod and force react to prod mode
  by @jacob314 in
  [#24590](https://github.com/google-gemini/gemini-cli/pull/24590)
- feat(cli): minimalist sandbox status labels by @galz10 in
  [#24582](https://github.com/google-gemini/gemini-cli/pull/24582)
- Feat/browser agent metrics by @kunal-10-cloud in
  [#24210](https://github.com/google-gemini/gemini-cli/pull/24210)
- test: fix Windows CI execution and resolve exposed platform failures by
  @ehedlund in [#24476](https://github.com/google-gemini/gemini-cli/pull/24476)
- feat(core,cli): prioritize summary for topics (#24608) by @Abhijit-2592 in
  [#24609](https://github.com/google-gemini/gemini-cli/pull/24609)
- show color by @jacob314 in
  [#24613](https://github.com/google-gemini/gemini-cli/pull/24613)
- feat(cli): enable compact tool output by default (#24509) by @jwhelangoog in
  [#24510](https://github.com/google-gemini/gemini-cli/pull/24510)
- fix(core): inject skill system instructions into subagent prompts if activated
  by @abhipatel12 in
  [#24620](https://github.com/google-gemini/gemini-cli/pull/24620)
- fix(core): improve windows sandbox reliability and fix integration tests by
  @ehedlund in [#24480](https://github.com/google-gemini/gemini-cli/pull/24480)
- fix(core): ensure sandbox approvals are correctly persisted and matched for
  proactive expansions by @galz10 in
  [#24577](https://github.com/google-gemini/gemini-cli/pull/24577)
- feat(cli) Scrollbar for input prompt by @jacob314 in
  [#21992](https://github.com/google-gemini/gemini-cli/pull/21992)
- Do not run pr-eval workflow when no steering changes detected by @alisa-alisa
  in [#24621](https://github.com/google-gemini/gemini-cli/pull/24621)
- Fix restoration of topic headers. by @gundermanc in
  [#24650](https://github.com/google-gemini/gemini-cli/pull/24650)
- feat(core): discourage update topic tool for simple tasks by @Samee24 in
  [#24640](https://github.com/google-gemini/gemini-cli/pull/24640)
- fix(core): ensure global temp directory is always in sandbox allowed paths by
  @galz10 in [#24638](https://github.com/google-gemini/gemini-cli/pull/24638)
- fix(core): detect uninitialized lines by @jacob314 in
  [#24646](https://github.com/google-gemini/gemini-cli/pull/24646)
- docs: update sandboxing documentation and toolSandboxing settings by @galz10
  in [#24655](https://github.com/google-gemini/gemini-cli/pull/24655)
- feat(cli): enhance tool confirmation UI and selection layout by @galz10 in
  [#24376](https://github.com/google-gemini/gemini-cli/pull/24376)
- feat(acp): add support for `/about` command by @sripasg in
  [#24649](https://github.com/google-gemini/gemini-cli/pull/24649)
- feat(cli): add role specific metrics to /stats by @cynthialong0-0 in
  [#24659](https://github.com/google-gemini/gemini-cli/pull/24659)
- split context by @jacob314 in
  [#24623](https://github.com/google-gemini/gemini-cli/pull/24623)
- fix(cli): remove -S from shebang to fix Windows and BSD execution by
  @scidomino in [#24756](https://github.com/google-gemini/gemini-cli/pull/24756)
- Fix issue where topic headers can be posted back to back by @gundermanc in
  [#24759](https://github.com/google-gemini/gemini-cli/pull/24759)
- fix(core): handle partial llm_request in BeforeModel hook override by
  @krishdef7 in [#22326](https://github.com/google-gemini/gemini-cli/pull/22326)
- fix(ui): improve narration suppression and reduce flicker by @gundermanc in
  [#24635](https://github.com/google-gemini/gemini-cli/pull/24635)
- fix(ui): fixed auth race condition causing logo to flicker by @devr0306 in
  [#24652](https://github.com/google-gemini/gemini-cli/pull/24652)
- fix(browser): remove premature browser cleanup after subagent invocation by
  @gsquared94 in
  [#24753](https://github.com/google-gemini/gemini-cli/pull/24753)
- Revert "feat(core,cli): prioritize summary for topics (#24608)" by
  @Abhijit-2592 in
  [#24777](https://github.com/google-gemini/gemini-cli/pull/24777)
- relax tool sandboxing overrides for plan mode to match defaults. by
  @DavidAPierce in
  [#24762](https://github.com/google-gemini/gemini-cli/pull/24762)
- fix(cli): respect global environment variable allowlist by @scidomino in
  [#24767](https://github.com/google-gemini/gemini-cli/pull/24767)
- fix(cli): ensure skills list outputs to stdout in non-interactive environments
  by @spencer426 in
  [#24566](https://github.com/google-gemini/gemini-cli/pull/24566)
- Add an eval for and fix unsafe cloning behavior. by @gundermanc in
  [#24457](https://github.com/google-gemini/gemini-cli/pull/24457)
- fix(policy): allow complete_task in plan mode by @abhipatel12 in
  [#24771](https://github.com/google-gemini/gemini-cli/pull/24771)
- feat(telemetry): add browser agent clearcut metrics by @gsquared94 in
  [#24688](https://github.com/google-gemini/gemini-cli/pull/24688)
- feat(cli): support selective topic expansion and click-to-expand by
  @Abhijit-2592 in
  [#24793](https://github.com/google-gemini/gemini-cli/pull/24793)
- temporarily disable sandbox integration test on windows by @ehedlund in
  [#24786](https://github.com/google-gemini/gemini-cli/pull/24786)
- Remove flakey test by @scidomino in
  [#24837](https://github.com/google-gemini/gemini-cli/pull/24837)
- Alisa/approve button by @alisa-alisa in
  [#24645](https://github.com/google-gemini/gemini-cli/pull/24645)
- feat(hooks): display hook system messages in UI by @mbleigh in
  [#24616](https://github.com/google-gemini/gemini-cli/pull/24616)
- fix(core): propagate BeforeModel hook model override end-to-end by @krishdef7
  in [#24784](https://github.com/google-gemini/gemini-cli/pull/24784)
- chore: fix formatting for behavioral eval skill reference file by @abhipatel12
  in [#24846](https://github.com/google-gemini/gemini-cli/pull/24846)
- fix: use directory junctions on Windows for skill linking by @enjoykumawat in
  [#24823](https://github.com/google-gemini/gemini-cli/pull/24823)
- fix(cli): prevent multiple banner increments on remount by @sehoon38 in
  [#24843](https://github.com/google-gemini/gemini-cli/pull/24843)
- feat(acp): add /help command by @sripasg in
  [#24839](https://github.com/google-gemini/gemini-cli/pull/24839)
- fix(core): remove tmux alternate buffer warning by @jackwotherspoon in
  [#24852](https://github.com/google-gemini/gemini-cli/pull/24852)
- Improve sandbox error matching and caching by @DavidAPierce in
  [#24550](https://github.com/google-gemini/gemini-cli/pull/24550)
- feat(core): add agent protocol UI types and experimental flag by @mbleigh in
  [#24275](https://github.com/google-gemini/gemini-cli/pull/24275)
- feat(core): use experiment flags for default fetch timeouts by @yunaseoul in
  [#24261](https://github.com/google-gemini/gemini-cli/pull/24261)
- Revert "fix(ui): improve narration suppression and reduce flicker (#2… by
  @gundermanc in
  [#24857](https://github.com/google-gemini/gemini-cli/pull/24857)
- refactor(cli): remove duplication in interactive shell awaiting input hint by
  @JayadityaGit in
  [#24801](https://github.com/google-gemini/gemini-cli/pull/24801)
- refactor(core): make LegacyAgentSession dependencies optional by @mbleigh in
  [#24287](https://github.com/google-gemini/gemini-cli/pull/24287)
- Changelog for v0.37.0-preview.2 by @gemini-cli-robot in
  [#24848](https://github.com/google-gemini/gemini-cli/pull/24848)
- fix(cli): always show shell command description or actual command by @jacob314
  in [#24774](https://github.com/google-gemini/gemini-cli/pull/24774)
- Added flag for ept size and increased default size by @devr0306 in
  [#24859](https://github.com/google-gemini/gemini-cli/pull/24859)
- fix(core): dispose Scheduler to prevent McpProgress listener leak by
  @Anjaligarhwal in
  [#24870](https://github.com/google-gemini/gemini-cli/pull/24870)
- fix(cli): switch default back to terminalBuffer=false and fix regressions
  introduced for that mode by @jacob314 in
  [#24873](https://github.com/google-gemini/gemini-cli/pull/24873)
- feat(cli): switch to ctrl+g from ctrl-x by @jacob314 in
  [#24861](https://github.com/google-gemini/gemini-cli/pull/24861)
- fix: isolate concurrent browser agent instances by @gsquared94 in
  [#24794](https://github.com/google-gemini/gemini-cli/pull/24794)
- docs: update MCP server OAuth redirect port documentation by @adamfweidman in
  [#24844](https://github.com/google-gemini/gemini-cli/pull/24844)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.37.0-preview.2...v0.38.0-preview.0
