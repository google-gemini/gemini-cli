# Latest stable release: v0.37.2

Released: April 13, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Dynamic Sandbox Expansion:** Implemented dynamic sandbox expansion and
  worktree support for both Linux and Windows, enhancing development flexibility
  in restricted environments.
- **Tool-Based Topic Grouping (Chapters):** Introduced "Chapters" to logically
  group agent interactions based on tool usage and intent, providing a clearer
  narrative flow in long sessions.
- **Enhanced Browser Agent:** Added persistent session management, dynamic
  read-only tool discovery, and sandbox-aware initialization for the browser
  agent.
- **Security & Permission Hardening:** Implemented secret visibility lockdown
  for environment files and integrated integrity controls for Windows
  sandboxing.

## What's Changed

- fix(patch): cherry-pick 9d741ab to release/v0.37.1-pr-24565 to patch version
  v0.37.1 and create version 0.37.2 by @gemini-cli-robot in
  [#25322](https://github.com/google-gemini/gemini-cli/pull/25322)
- fix(acp): handle all InvalidStreamError types gracefully in prompt
  [#24540](https://github.com/google-gemini/gemini-cli/pull/24540)
- feat(acp): add support for /about command
  [#24649](https://github.com/google-gemini/gemini-cli/pull/24649)
- feat(acp): add /help command
  [#24839](https://github.com/google-gemini/gemini-cli/pull/24839)
- feat(evals): centralize test agents into test-utils for reuse by @Samee24 in
  [#23616](https://github.com/google-gemini/gemini-cli/pull/23616)
- revert: chore(config): disable agents by default by @abhipatel12 in
  [#23672](https://github.com/google-gemini/gemini-cli/pull/23672)
- fix(plan): update telemetry attribute keys and add timestamp by @Adib234 in
  [#23685](https://github.com/google-gemini/gemini-cli/pull/23685)
- fix(core): prevent premature MCP discovery completion by @jackwotherspoon in
  [#23637](https://github.com/google-gemini/gemini-cli/pull/23637)
- feat(browser): add maxActionsPerTask for browser agent setting by
  @cynthialong0-0 in
  [#23216](https://github.com/google-gemini/gemini-cli/pull/23216)
- fix(core): improve agent loader error formatting for empty paths by
  @adamfweidman in
  [#23690](https://github.com/google-gemini/gemini-cli/pull/23690)
- fix(cli): only show updating spinner when auto-update is in progress by
  @scidomino in [#23709](https://github.com/google-gemini/gemini-cli/pull/23709)
- Refine onboarding metrics to log the duration explicitly and use the tier
  name. by @yunaseoul in
  [#23678](https://github.com/google-gemini/gemini-cli/pull/23678)
- chore(tools): add toJSON to tools and invocations to reduce logging verbosity
  by @alisa-alisa in
  [#22899](https://github.com/google-gemini/gemini-cli/pull/22899)
- fix(cli): stabilize copy mode to prevent flickering and cursor resets by
  @mattKorwel in
  [#22584](https://github.com/google-gemini/gemini-cli/pull/22584)
- fix(test): move flaky ctrl-c-exit test to non-blocking suite by @mattKorwel in
  [#23732](https://github.com/google-gemini/gemini-cli/pull/23732)
- feat(skills): add ci skill for automated failure replication by @mattKorwel in
  [#23720](https://github.com/google-gemini/gemini-cli/pull/23720)
- feat(sandbox): implement forbiddenPaths for OS-specific sandbox managers by
  @ehedlund in [#23282](https://github.com/google-gemini/gemini-cli/pull/23282)
- fix(core): conditionally expose additional_permissions in shell tool by
  @galz10 in [#23729](https://github.com/google-gemini/gemini-cli/pull/23729)
- refactor(core): standardize OS-specific sandbox tests and extract linux helper
  methods by @ehedlund in
  [#23715](https://github.com/google-gemini/gemini-cli/pull/23715)
- format recently added script by @scidomino in
  [#23739](https://github.com/google-gemini/gemini-cli/pull/23739)
- fix(ui): prevent over-eager slash subcommand completion by @keithguerin in
  [#20136](https://github.com/google-gemini/gemini-cli/pull/20136)
- Fix dynamic model routing for gemini 3.1 pro to customtools model by
  @kevinjwang1 in
  [#23641](https://github.com/google-gemini/gemini-cli/pull/23641)
- feat(core): support inline agentCardJson for remote agents by @adamfweidman in
  [#23743](https://github.com/google-gemini/gemini-cli/pull/23743)
- fix(cli): skip console log/info in headless mode by @cynthialong0-0 in
  [#22739](https://github.com/google-gemini/gemini-cli/pull/22739)
- test(core): install bubblewrap on Linux CI for sandbox integration tests by
  @ehedlund in [#23583](https://github.com/google-gemini/gemini-cli/pull/23583)
- docs(reference): split tools table into category sections by @sheikhlimon in
  [#21516](https://github.com/google-gemini/gemini-cli/pull/21516)
- fix(browser): detect embedded URLs in query params to prevent allowedDomains
  bypass by @tony-shi in
  [#23225](https://github.com/google-gemini/gemini-cli/pull/23225)
- fix(browser): add proxy bypass constraint to domain restriction system prompt
  by @tony-shi in
  [#23229](https://github.com/google-gemini/gemini-cli/pull/23229)
- fix(policy): relax write_file argsPattern in plan mode to allow paths without
  session ID by @Adib234 in
  [#23695](https://github.com/google-gemini/gemini-cli/pull/23695)
- docs: fix grammar in CONTRIBUTING and numbering in sandbox docs by
  @splint-disk-8i in
  [#23448](https://github.com/google-gemini/gemini-cli/pull/23448)
- fix(acp): allow attachments by adding a permission prompt by @sripasg in
  [#23680](https://github.com/google-gemini/gemini-cli/pull/23680)
- fix(core): thread AbortSignal to chat compression requests (#20405) by
  @SH20RAJ in [#20778](https://github.com/google-gemini/gemini-cli/pull/20778)
- feat(core): implement Windows sandbox dynamic expansion Phase 1 and 2.1 by
  @scidomino in [#23691](https://github.com/google-gemini/gemini-cli/pull/23691)
- Add note about root privileges in sandbox docs by @diodesign in
  [#23314](https://github.com/google-gemini/gemini-cli/pull/23314)
- docs(core): document agent_card_json string literal options for remote agents
  by @adamfweidman in
  [#23797](https://github.com/google-gemini/gemini-cli/pull/23797)
- fix(cli): resolve TTY hang on headless environments by unconditionally
  resuming process.stdin before React Ink launch by @cocosheng-g in
  [#23673](https://github.com/google-gemini/gemini-cli/pull/23673)
- fix(ui): cleanup estimated string length hacks in composer by @keithguerin in
  [#23694](https://github.com/google-gemini/gemini-cli/pull/23694)
- feat(browser): dynamically discover read-only tools by @cynthialong0-0 in
  [#23805](https://github.com/google-gemini/gemini-cli/pull/23805)
- docs: clarify policy requirement for `general.plan.directory` in settings
  schema by @jerop in
  [#23784](https://github.com/google-gemini/gemini-cli/pull/23784)
- Revert "perf(cli): optimize --version startup time (#23671)" by @scidomino in
  [#23812](https://github.com/google-gemini/gemini-cli/pull/23812)
- don't silence errors from wombat by @scidomino in
  [#23822](https://github.com/google-gemini/gemini-cli/pull/23822)
- fix(ui): prevent escape key from cancelling requests in shell mode by
  @PrasannaPal21 in
  [#21245](https://github.com/google-gemini/gemini-cli/pull/21245)
- Changelog for v0.36.0-preview.0 by @gemini-cli-robot in
  [#23702](https://github.com/google-gemini/gemini-cli/pull/23702)
- feat(core,ui): Add experiment-gated support for gemini flash 3.1 lite by
  @chrstnb in [#23794](https://github.com/google-gemini/gemini-cli/pull/23794)
- Changelog for v0.36.0-preview.3 by @gemini-cli-robot in
  [#23827](https://github.com/google-gemini/gemini-cli/pull/23827)
- new linting check: github-actions-pinning by @alisa-alisa in
  [#23808](https://github.com/google-gemini/gemini-cli/pull/23808)
- fix(cli): show helpful guidance when no skills are available by @Niralisj in
  [#23785](https://github.com/google-gemini/gemini-cli/pull/23785)
- fix: Chat logs and errors handle tail tool calls correctly by @googlestrobe in
  [#22460](https://github.com/google-gemini/gemini-cli/pull/22460)
- Don't try removing a tag from a non-existent release. by @scidomino in
  [#23830](https://github.com/google-gemini/gemini-cli/pull/23830)
- fix(cli): allow ask question dialog to take full window height by @jacob314 in
  [#23693](https://github.com/google-gemini/gemini-cli/pull/23693)
- fix(core): strip leading underscores from error types in telemetry by
  @yunaseoul in [#23824](https://github.com/google-gemini/gemini-cli/pull/23824)
- Changelog for v0.35.0 by @gemini-cli-robot in
  [#23819](https://github.com/google-gemini/gemini-cli/pull/23819)
- feat(evals): add reliability harvester and 500/503 retry support by
  @alisa-alisa in
  [#23626](https://github.com/google-gemini/gemini-cli/pull/23626)
- feat(sandbox): dynamic Linux sandbox expansion and worktree support by @galz10
  in [#23692](https://github.com/google-gemini/gemini-cli/pull/23692)
- Merge examples of use into quickstart documentation by @diodesign in
  [#23319](https://github.com/google-gemini/gemini-cli/pull/23319)
- fix(cli): prioritize primary name matches in slash command search by @sehoon38
  in [#23850](https://github.com/google-gemini/gemini-cli/pull/23850)
- Changelog for v0.35.1 by @gemini-cli-robot in
  [#23840](https://github.com/google-gemini/gemini-cli/pull/23840)
- fix(browser): keep input blocker active across navigations by @kunal-10-cloud
  in [#22562](https://github.com/google-gemini/gemini-cli/pull/22562)
- feat(core): new skill to look for duplicated code while reviewing PRs by
  @devr0306 in [#23704](https://github.com/google-gemini/gemini-cli/pull/23704)
- fix(core): replace hardcoded non-interactive ASK_USER denial with explicit
  policy rules by @ruomengz in
  [#23668](https://github.com/google-gemini/gemini-cli/pull/23668)
- fix(plan): after exiting plan mode switches model to a flash model by @Adib234
  in [#23885](https://github.com/google-gemini/gemini-cli/pull/23885)
- feat(gcp): add development worker infrastructure by @mattKorwel in
  [#23814](https://github.com/google-gemini/gemini-cli/pull/23814)
- fix(a2a-server): A2A server should execute ask policies in interactive mode by
  @kschaab in [#23831](https://github.com/google-gemini/gemini-cli/pull/23831)
- feat(core): define TrajectoryProvider interface by @sehoon38 in
  [#23050](https://github.com/google-gemini/gemini-cli/pull/23050)
- Docs: Update quotas and pricing by @jkcinouye in
  [#23835](https://github.com/google-gemini/gemini-cli/pull/23835)
- fix(core): allow disabling environment variable redaction by @galz10 in
  [#23927](https://github.com/google-gemini/gemini-cli/pull/23927)
- feat(cli): enable notifications cross-platform via terminal bell fallback by
  @genneth in [#21618](https://github.com/google-gemini/gemini-cli/pull/21618)
- feat(sandbox): implement secret visibility lockdown for env files by
  @DavidAPierce in
  [#23712](https://github.com/google-gemini/gemini-cli/pull/23712)
- fix(core): remove shell outputChunks buffer caching to prevent memory bloat
  and sanitize prompt input by @spencer426 in
  [#23751](https://github.com/google-gemini/gemini-cli/pull/23751)
- feat(core): implement persistent browser session management by @kunal-10-cloud
  in [#21306](https://github.com/google-gemini/gemini-cli/pull/21306)
- refactor(core): delegate sandbox denial parsing to SandboxManager by
  @scidomino in [#23928](https://github.com/google-gemini/gemini-cli/pull/23928)
- dep(update) Update Ink version to 6.5.0 by @jacob314 in
  [#23843](https://github.com/google-gemini/gemini-cli/pull/23843)
- Docs: Update 'docs-writer' skill for relative links by @jkcinouye in
  [#21463](https://github.com/google-gemini/gemini-cli/pull/21463)
- Changelog for v0.36.0-preview.4 by @gemini-cli-robot in
  [#23935](https://github.com/google-gemini/gemini-cli/pull/23935)
- fix(acp): Update allow approval policy flow for ACP clients to fix config
  persistence and compatible with TUI by @sripasg in
  [#23818](https://github.com/google-gemini/gemini-cli/pull/23818)
- Changelog for v0.35.2 by @gemini-cli-robot in
  [#23960](https://github.com/google-gemini/gemini-cli/pull/23960)
- ACP integration documents by @g-samroberts in
  [#22254](https://github.com/google-gemini/gemini-cli/pull/22254)
- fix(core): explicitly set error names to avoid bundling renaming issues by
  @yunaseoul in [#23913](https://github.com/google-gemini/gemini-cli/pull/23913)
- feat(core): subagent isolation and cleanup hardening by @abhipatel12 in
  [#23903](https://github.com/google-gemini/gemini-cli/pull/23903)
- disable extension-reload test by @scidomino in
  [#24018](https://github.com/google-gemini/gemini-cli/pull/24018)
- feat(core): add forbiddenPaths to GlobalSandboxOptions and refactor
  createSandboxManager by @ehedlund in
  [#23936](https://github.com/google-gemini/gemini-cli/pull/23936)
- refactor(core): improve ignore resolution and fix directory-matching bug by
  @ehedlund in [#23816](https://github.com/google-gemini/gemini-cli/pull/23816)
- revert(core): support custom base URL via env vars by @spencer426 in
  [#23976](https://github.com/google-gemini/gemini-cli/pull/23976)
- Increase memory limited for eslint. by @jacob314 in
  [#24022](https://github.com/google-gemini/gemini-cli/pull/24022)
- fix(acp): prevent crash on empty response in ACP mode by @sripasg in
  [#23952](https://github.com/google-gemini/gemini-cli/pull/23952)
- feat(core): Land `AgentHistoryProvider`. by @joshualitt in
  [#23978](https://github.com/google-gemini/gemini-cli/pull/23978)
- fix(core): switch to subshells for shell tool wrapping to fix heredocs and
  edge cases by @abhipatel12 in
  [#24024](https://github.com/google-gemini/gemini-cli/pull/24024)
- Debug command. by @jacob314 in
  [#23851](https://github.com/google-gemini/gemini-cli/pull/23851)
- Changelog for v0.36.0-preview.5 by @gemini-cli-robot in
  [#24046](https://github.com/google-gemini/gemini-cli/pull/24046)
- Fix test flakes by globally mocking ink-spinner by @jacob314 in
  [#24044](https://github.com/google-gemini/gemini-cli/pull/24044)
- Enable network access in sandbox configuration by @galz10 in
  [#24055](https://github.com/google-gemini/gemini-cli/pull/24055)
- feat(context): add configurable memoryBoundaryMarkers setting by @SandyTao520
  in [#24020](https://github.com/google-gemini/gemini-cli/pull/24020)
- feat(core): implement windows sandbox expansion and denial detection by
  @scidomino in [#24027](https://github.com/google-gemini/gemini-cli/pull/24027)
- fix(core): resolve ACP Operation Aborted Errors in grep_search by @ivanporty
  in [#23821](https://github.com/google-gemini/gemini-cli/pull/23821)
- fix(hooks): prevent SessionEnd from firing twice in non-interactive mode by
  @krishdef7 in [#22139](https://github.com/google-gemini/gemini-cli/pull/22139)
- Re-word intro to Gemini 3 page. by @g-samroberts in
  [#24069](https://github.com/google-gemini/gemini-cli/pull/24069)
- fix(cli): resolve layout contention and flashing loop in StatusRow by
  @keithguerin in
  [#24065](https://github.com/google-gemini/gemini-cli/pull/24065)
- fix(sandbox): implement Windows Mandatory Integrity Control for GeminiSandbox
  by @galz10 in [#24057](https://github.com/google-gemini/gemini-cli/pull/24057)
- feat(core): implement tool-based topic grouping (Chapters) by @Abhijit-2592 in
  [#23150](https://github.com/google-gemini/gemini-cli/pull/23150)
- feat(cli): support 'tab to queue' for messages while generating by @gundermanc
  in [#24052](https://github.com/google-gemini/gemini-cli/pull/24052)
- feat(core): agnostic background task UI with CompletionBehavior by
  @adamfweidman in
  [#22740](https://github.com/google-gemini/gemini-cli/pull/22740)
- UX for topic narration tool by @gundermanc in
  [#24079](https://github.com/google-gemini/gemini-cli/pull/24079)
- fix: shellcheck warnings in scripts by @scidomino in
  [#24035](https://github.com/google-gemini/gemini-cli/pull/24035)
- test(evals): add comprehensive subagent delegation evaluations by @abhipatel12
  in [#24132](https://github.com/google-gemini/gemini-cli/pull/24132)
- fix(a2a-server): prioritize ADC before evaluating headless constraints for
  auth initialization by @spencer426 in
  [#23614](https://github.com/google-gemini/gemini-cli/pull/23614)
- Text can be added after /plan command by @rambleraptor in
  [#22833](https://github.com/google-gemini/gemini-cli/pull/22833)
- fix(cli): resolve missing F12 logs via global console store by @scidomino in
  [#24235](https://github.com/google-gemini/gemini-cli/pull/24235)
- fix broken tests by @scidomino in
  [#24279](https://github.com/google-gemini/gemini-cli/pull/24279)
- fix(evals): add update_topic behavioral eval by @gundermanc in
  [#24223](https://github.com/google-gemini/gemini-cli/pull/24223)
- feat(core): Unified Context Management and Tool Distillation. by @joshualitt
  in [#24157](https://github.com/google-gemini/gemini-cli/pull/24157)
- Default enable narration for the team. by @gundermanc in
  [#24224](https://github.com/google-gemini/gemini-cli/pull/24224)
- fix(core): ensure default agents provide tools and use model-specific schemas
  by @abhipatel12 in
  [#24268](https://github.com/google-gemini/gemini-cli/pull/24268)
- feat(cli): show Flash Lite Preview model regardless of user tier by @sehoon38
  in [#23904](https://github.com/google-gemini/gemini-cli/pull/23904)
- feat(cli): implement compact tool output by @jwhelangoog in
  [#20974](https://github.com/google-gemini/gemini-cli/pull/20974)
- Add security settings for tool sandboxing by @galz10 in
  [#23923](https://github.com/google-gemini/gemini-cli/pull/23923)
- chore(test-utils): switch integration tests to use PREVIEW_GEMINI_MODEL by
  @sehoon38 in [#24276](https://github.com/google-gemini/gemini-cli/pull/24276)
- feat(core): enable topic update narration for legacy models by @Abhijit-2592
  in [#24241](https://github.com/google-gemini/gemini-cli/pull/24241)
- feat(core): add project-level memory scope to save_memory tool by @SandyTao520
  in [#24161](https://github.com/google-gemini/gemini-cli/pull/24161)
- test(integration): fix plan mode write denial test false positive by @sehoon38
  in [#24299](https://github.com/google-gemini/gemini-cli/pull/24299)
- feat(plan): support `Plan` mode in untrusted folders by @Adib234 in
  [#17586](https://github.com/google-gemini/gemini-cli/pull/17586)
- fix(core): enable mid-stream retries for all models and re-enable compression
  test by @sehoon38 in
  [#24302](https://github.com/google-gemini/gemini-cli/pull/24302)
- Changelog for v0.36.0-preview.6 by @gemini-cli-robot in
  [#24082](https://github.com/google-gemini/gemini-cli/pull/24082)
- Changelog for v0.35.3 by @gemini-cli-robot in
  [#24083](https://github.com/google-gemini/gemini-cli/pull/24083)
- feat(cli): add auth info to footer by @sehoon38 in
  [#24042](https://github.com/google-gemini/gemini-cli/pull/24042)
- fix(browser): reset action counter for each agent session and let it ignore
  internal actions by @cynthialong0-0 in
  [#24228](https://github.com/google-gemini/gemini-cli/pull/24228)
- feat(plan): promote planning feature to stable by @ruomengz in
  [#24282](https://github.com/google-gemini/gemini-cli/pull/24282)
- fix(browser): terminate subagent immediately on domain restriction violations
  by @gsquared94 in
  [#24313](https://github.com/google-gemini/gemini-cli/pull/24313)
- feat(cli): add UI to update extensions by @ruomengz in
  [#23682](https://github.com/google-gemini/gemini-cli/pull/23682)
- Fix(browser): terminate immediately for "browser is already running" error by
  @cynthialong0-0 in
  [#24233](https://github.com/google-gemini/gemini-cli/pull/24233)
- docs: Add 'plan' option to approval mode in CLI reference by @YifanRuan in
  [#24134](https://github.com/google-gemini/gemini-cli/pull/24134)
- fix(core): batch macOS seatbelt rules into a profile file to prevent ARG_MAX
  errors by @ehedlund in
  [#24255](https://github.com/google-gemini/gemini-cli/pull/24255)
- fix(core): fix race condition between browser agent and main closing process
  by @cynthialong0-0 in
  [#24340](https://github.com/google-gemini/gemini-cli/pull/24340)
- perf(build): optimize build scripts for parallel execution and remove
  redundant checks by @sehoon38 in
  [#24307](https://github.com/google-gemini/gemini-cli/pull/24307)
- ci: install bubblewrap on Linux for release workflows by @ehedlund in
  [#24347](https://github.com/google-gemini/gemini-cli/pull/24347)
- chore(release): allow bundling for all builds, including stable by @sehoon38
  in [#24305](https://github.com/google-gemini/gemini-cli/pull/24305)
- Revert "Add security settings for tool sandboxing" by @jerop in
  [#24357](https://github.com/google-gemini/gemini-cli/pull/24357)
- docs: update subagents docs to not be experimental by @abhipatel12 in
  [#24343](https://github.com/google-gemini/gemini-cli/pull/24343)
- fix(core): implement **read and **write commands in sandbox managers by
  @galz10 in [#24283](https://github.com/google-gemini/gemini-cli/pull/24283)
- don't try to remove tags in dry run by @scidomino in
  [#24356](https://github.com/google-gemini/gemini-cli/pull/24356)
- fix(config): disable JIT context loading by default by @SandyTao520 in
  [#24364](https://github.com/google-gemini/gemini-cli/pull/24364)
- test(sandbox): add integration test for dynamic permission expansion by
  @galz10 in [#24359](https://github.com/google-gemini/gemini-cli/pull/24359)
- docs(policy): remove unsupported mcpName wildcard edge case by @abhipatel12 in
  [#24133](https://github.com/google-gemini/gemini-cli/pull/24133)
- docs: fix broken GEMINI.md link in CONTRIBUTING.md by @Panchal-Tirth in
  [#24182](https://github.com/google-gemini/gemini-cli/pull/24182)
- feat(core): infrastructure for event-driven subagent history by @abhipatel12
  in [#23914](https://github.com/google-gemini/gemini-cli/pull/23914)
- fix(core): resolve Plan Mode deadlock during plan file creation due to sandbox
  restrictions by @DavidAPierce in
  [#24047](https://github.com/google-gemini/gemini-cli/pull/24047)
- fix(core): fix browser agent UX issues and improve E2E test reliability by
  @gsquared94 in
  [#24312](https://github.com/google-gemini/gemini-cli/pull/24312)
- fix(ui): wrap topic and intent fields in TopicMessage by @jwhelangoog in
  [#24386](https://github.com/google-gemini/gemini-cli/pull/24386)
- refactor(core): Centralize context management logic into src/context by
  @joshualitt in
  [#24380](https://github.com/google-gemini/gemini-cli/pull/24380)
- fix(core): pin AuthType.GATEWAY to use Gemini 3.1 Pro/Flash Lite by default by
  @sripasg in [#24375](https://github.com/google-gemini/gemini-cli/pull/24375)
- feat(ui): add Tokyo Night theme by @danrneal in
  [#24054](https://github.com/google-gemini/gemini-cli/pull/24054)
- fix(cli): refactor test config loading and mock debugLogger in test-setup by
  @mattKorwel in
  [#24389](https://github.com/google-gemini/gemini-cli/pull/24389)
- Set memoryManager to false in settings.json by @mattKorwel in
  [#24393](https://github.com/google-gemini/gemini-cli/pull/24393)
- ink 6.6.3 by @jacob314 in
  [#24372](https://github.com/google-gemini/gemini-cli/pull/24372)
- fix(core): resolve subagent chat recording gaps and directory inheritance by
  @abhipatel12 in
  [#24368](https://github.com/google-gemini/gemini-cli/pull/24368)
- fix(cli): cap shell output at 10 MB to prevent RangeError crash by @ProthamD
  in [#24168](https://github.com/google-gemini/gemini-cli/pull/24168)
- feat(plan): conditionally add enter/exit plan mode tools based on current mode
  by @ruomengz in
  [#24378](https://github.com/google-gemini/gemini-cli/pull/24378)
- feat(core): prioritize discussion before formal plan approval by @jerop in
  [#24423](https://github.com/google-gemini/gemini-cli/pull/24423)
- fix(ui): add accelerated scrolling on alternate buffer mode by @devr0306 in
  [#23940](https://github.com/google-gemini/gemini-cli/pull/23940)
- feat(core): populate sandbox forbidden paths with project ignore file contents
  by @ehedlund in
  [#24038](https://github.com/google-gemini/gemini-cli/pull/24038)
- fix(core): ensure blue border overlay and input blocker to act correctly
  depending on browser agent activities by @cynthialong0-0 in
  [#24385](https://github.com/google-gemini/gemini-cli/pull/24385)
- fix(ui): removed additional vertical padding for tables by @devr0306 in
  [#24381](https://github.com/google-gemini/gemini-cli/pull/24381)
- fix(build): upload full bundle directory archive to GitHub releases by
  @sehoon38 in [#24403](https://github.com/google-gemini/gemini-cli/pull/24403)
- fix(build): wire bundle:browser-mcp into bundle pipeline by @gsquared94 in
  [#24424](https://github.com/google-gemini/gemini-cli/pull/24424)
- feat(browser): add sandbox-aware browser agent initialization by @gsquared94
  in [#24419](https://github.com/google-gemini/gemini-cli/pull/24419)
- feat(core): enhance tracker task schemas for detailed titles and descriptions
  by @anj-s in [#23902](https://github.com/google-gemini/gemini-cli/pull/23902)
- refactor(core): Unified context management settings schema by @joshualitt in
  [#24391](https://github.com/google-gemini/gemini-cli/pull/24391)
- feat(core): update browser agent prompt to check open pages first when
  bringing up by @cynthialong0-0 in
  [#24431](https://github.com/google-gemini/gemini-cli/pull/24431)
- fix(acp) refactor(core,cli): centralize model discovery logic in
  ModelConfigService by @sripasg in
  [#24392](https://github.com/google-gemini/gemini-cli/pull/24392)
- Changelog for v0.36.0-preview.7 by @gemini-cli-robot in
  [#24346](https://github.com/google-gemini/gemini-cli/pull/24346)
- fix: update task tracker storage location in system prompt by @anj-s in
  [#24034](https://github.com/google-gemini/gemini-cli/pull/24034)
- feat(browser): supersede stale snapshots to reclaim context-window tokens by
  @gsquared94 in
  [#24440](https://github.com/google-gemini/gemini-cli/pull/24440)
- docs(core): add subagent tool isolation draft doc by @akh64bit in
  [#23275](https://github.com/google-gemini/gemini-cli/pull/23275)
- fix(patch): cherry-pick 64c928f to release/v0.37.0-preview.0-pr-23257 to patch
  version v0.37.0-preview.0 and create version 0.37.0-preview.1 by
  @gemini-cli-robot in
  [#24561](https://github.com/google-gemini/gemini-cli/pull/24561)
- fix(patch): cherry-pick cb7f7d6 to release/v0.37.0-preview.1-pr-24342 to patch
  version v0.37.0-preview.1 and create version 0.37.0-preview.2 by
  @gemini-cli-robot in
  [#24842](https://github.com/google-gemini/gemini-cli/pull/24842)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.36.0...v0.37.2
