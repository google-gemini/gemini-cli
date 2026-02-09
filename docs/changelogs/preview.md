# Preview release: Release v0.28.0-preview.0

Released: February 3, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Improved Hooks Management:** Hooks enable/disable functionality now aligns
  with skills and offers improved completion.
- **Custom Themes for Extensions:** Extensions can now support custom themes,
  allowing for greater personalization.
- **User Identity Display:** User identity information (auth, email, tier) is
  now displayed on startup and in the `stats` command.
- **Plan Mode Enhancements:** Plan mode has been improved with a generic
  `Checklist` component and refactored `Todo`.
- **Background Shell Commands:** Implementation of background shell commands.

## What's Changed

- feat(commands): add /prompt-suggest slash command by NTaylorMullen in
  [#17264](https://github.com/google-gemini/gemini-cli/pull/17264)
- feat(cli): align hooks enable/disable with skills and improve completion by
  sehoon38 in [#16822](https://github.com/google-gemini/gemini-cli/pull/16822)
- docs: add CLI reference documentation by leochiu-a in
  [#17504](https://github.com/google-gemini/gemini-cli/pull/17504)
- chore(release): bump version to 0.28.0-nightly.20260128.adc8e11bb by
  gemini-cli-robot in
  [#17725](https://github.com/google-gemini/gemini-cli/pull/17725)
- feat(skills): final stable promotion cleanup by abhipatel12 in
  [#17726](https://github.com/google-gemini/gemini-cli/pull/17726)
- test(core): mock fetch in OAuth transport fallback tests by jw409 in
  [#17059](https://github.com/google-gemini/gemini-cli/pull/17059)
- feat(cli): include auth method in /bug by erikus in
  [#17569](https://github.com/google-gemini/gemini-cli/pull/17569)
- Add a email privacy note to bug_report template by nemyung in
  [#17474](https://github.com/google-gemini/gemini-cli/pull/17474)
- Rewind documentation by Adib234 in
  [#17446](https://github.com/google-gemini/gemini-cli/pull/17446)
- fix: verify audio/video MIME types with content check by maru0804 in
  [#16907](https://github.com/google-gemini/gemini-cli/pull/16907)
- feat(core): add support for positron ide (#15045) by kapsner in
  [#15047](https://github.com/google-gemini/gemini-cli/pull/15047)
- /oncall dedup - wrap texts to nextlines by sehoon38 in
  [#17782](https://github.com/google-gemini/gemini-cli/pull/17782)
- fix(admin): rename advanced features admin setting by skeshive in
  [#17786](https://github.com/google-gemini/gemini-cli/pull/17786)
- [extension config] Make breaking optional value non-optional by chrstnb in
  [#17785](https://github.com/google-gemini/gemini-cli/pull/17785)
- Fix docs-writer skill issues by g-samroberts in
  [#17734](https://github.com/google-gemini/gemini-cli/pull/17734)
- fix(core): suppress duplicate hook failure warnings during streaming by
  abhipatel12 in
  [#17727](https://github.com/google-gemini/gemini-cli/pull/17727)
- test: add more tests for AskUser by jackwotherspoon in
  [#17720](https://github.com/google-gemini/gemini-cli/pull/17720)
- feat(cli): enable activity logging for non-interactive mode and evals by
  SandyTao520 in
  [#17703](https://github.com/google-gemini/gemini-cli/pull/17703)
- feat(core): add support for custom deny messages in policy rules by
  allenhutchison in
  [#17427](https://github.com/google-gemini/gemini-cli/pull/17427)
- Fix unintended credential exposure to MCP Servers by Adib234 in
  [#17311](https://github.com/google-gemini/gemini-cli/pull/17311)
- feat(extensions): add support for custom themes in extensions by spencer426 in
  [#17327](https://github.com/google-gemini/gemini-cli/pull/17327)
- fix: persist and restore workspace directories on session resume by
  korade-krushna in
  [#17454](https://github.com/google-gemini/gemini-cli/pull/17454)
- Update release notes pages for 0.26.0 and 0.27.0-preview. by g-samroberts in
  [#17744](https://github.com/google-gemini/gemini-cli/pull/17744)
- feat(ux): update cell border color and created test file for table rendering
  by devr0306 in
  [#17798](https://github.com/google-gemini/gemini-cli/pull/17798)
- Change height for the ToolConfirmationQueue. by jacob314 in
  [#17799](https://github.com/google-gemini/gemini-cli/pull/17799)
- feat(cli): add user identity info to stats command by sehoon38 in
  [#17612](https://github.com/google-gemini/gemini-cli/pull/17612)
- fix(ux): fixed off-by-some wrapping caused by fixed-width characters by
  devr0306 in [#17816](https://github.com/google-gemini/gemini-cli/pull/17816)
- feat(cli): update undo/redo keybindings to Cmd+Z/Alt+Z and
  Shift+Cmd+Z/Shift+Alt+Z by scidomino in
  [#17800](https://github.com/google-gemini/gemini-cli/pull/17800)
- fix(evals): use absolute path for activity log directory by SandyTao520 in
  [#17830](https://github.com/google-gemini/gemini-cli/pull/17830)
- test: add integration test to verify stdout/stderr routing by ved015 in
  [#17280](https://github.com/google-gemini/gemini-cli/pull/17280)
- fix(cli): list installed extensions when update target missing by tt-a1i in
  [#17082](https://github.com/google-gemini/gemini-cli/pull/17082)
- fix(cli): handle PAT tokens and credentials in git remote URL parsing by
  afarber in [#14650](https://github.com/google-gemini/gemini-cli/pull/14650)
- fix(core): use returnDisplay for error result display by Nubebuster in
  [#14994](https://github.com/google-gemini/gemini-cli/pull/14994)
- Fix detection of bun as package manager by Randomblock1 in
  [#17462](https://github.com/google-gemini/gemini-cli/pull/17462)
- feat(cli): show hooksConfig.enabled in settings dialog by abhipatel12 in
  [#17810](https://github.com/google-gemini/gemini-cli/pull/17810)
- feat(cli): Display user identity (auth, email, tier) on startup by yunaseoul
  in [#17591](https://github.com/google-gemini/gemini-cli/pull/17591)
- fix: prevent ghost border for AskUserDialog by jackwotherspoon in
  [#17788](https://github.com/google-gemini/gemini-cli/pull/17788)
- docs: mark A2A subagents as experimental in subagents.md by adamfweidman in
  [#17863](https://github.com/google-gemini/gemini-cli/pull/17863)
- Resolve error thrown for sensitive values by chrstnb in
  [#17826](https://github.com/google-gemini/gemini-cli/pull/17826)
- fix(admin): Rename secureModeEnabled to strictModeDisabled by skeshive in
  [#17789](https://github.com/google-gemini/gemini-cli/pull/17789)
- feat(ux): update truncate dots to be shorter in tables by devr0306 in
  [#17825](https://github.com/google-gemini/gemini-cli/pull/17825)
- fix(core): resolve DEP0040 punycode deprecation via patch-package by
  ATHARVA262005 in
  [#17692](https://github.com/google-gemini/gemini-cli/pull/17692)
- feat(plan): create generic Checklist component and refactor Todo by Adib234 in
  [#17741](https://github.com/google-gemini/gemini-cli/pull/17741)
- Cleanup post delegate_to_agent removal by gundermanc in
  [#17875](https://github.com/google-gemini/gemini-cli/pull/17875)
- fix(core): use GIT_CONFIG_GLOBAL to isolate shadow git repo configuration -
  Fixes #17877 by cocosheng-g in
  [#17803](https://github.com/google-gemini/gemini-cli/pull/17803)
- Disable mouse tracking e2e by alisa-alisa in
  [#17880](https://github.com/google-gemini/gemini-cli/pull/17880)
- fix(cli): use correct setting key for Cloud Shell auth by sehoon38 in
  [#17884](https://github.com/google-gemini/gemini-cli/pull/17884)
- chore: revert IDE specific ASCII logo by jackwotherspoon in
  [#17887](https://github.com/google-gemini/gemini-cli/pull/17887)
- Revert "fix(core): resolve DEP0040 punycode deprecation via patch-package" by
  sehoon38 in [#17898](https://github.com/google-gemini/gemini-cli/pull/17898)
- Refactoring of disabling of mouse tracking in e2e tests by alisa-alisa in
  [#17902](https://github.com/google-gemini/gemini-cli/pull/17902)
- feat(core): Add GOOGLE_GENAI_API_VERSION environment variable support by deyim
  in [#16177](https://github.com/google-gemini/gemini-cli/pull/16177)
- feat(core): Isolate and cleanup truncated tool outputs by SandyTao520 in
  [#17594](https://github.com/google-gemini/gemini-cli/pull/17594)
- Create skills page, update commands, refine docs by g-samroberts in
  [#17842](https://github.com/google-gemini/gemini-cli/pull/17842)
- feat: preserve EOL in files by Thomas-Shephard in
  [#16087](https://github.com/google-gemini/gemini-cli/pull/16087)
- Fix HalfLinePaddedBox in screenreader mode. by jacob314 in
  [#17914](https://github.com/google-gemini/gemini-cli/pull/17914)
- bug(ux) vim mode fixes. Start in insert mode. Fix bug blocking F12 and ctrl-X
  in vim mode. by jacob314 in
  [#17938](https://github.com/google-gemini/gemini-cli/pull/17938)
- feat(core): implement interactive and non-interactive consent for OAuth by
  ehedlund in [#17699](https://github.com/google-gemini/gemini-cli/pull/17699)
- perf(core): optimize token calculation and add support for multimodal tool
  responses by abhipatel12 in
  [#17835](https://github.com/google-gemini/gemini-cli/pull/17835)
- refactor(hooks): remove legacy tools.enableHooks setting by abhipatel12 in
  [#17867](https://github.com/google-gemini/gemini-cli/pull/17867)
- feat(ci): add npx smoke test to verify installability by bdmorgan in
  [#17927](https://github.com/google-gemini/gemini-cli/pull/17927)
- feat(core): implement dynamic policy registration for subagents by abhipatel12
  in [#17838](https://github.com/google-gemini/gemini-cli/pull/17838)
- feat: Implement background shell commands by galz10 in
  [#14849](https://github.com/google-gemini/gemini-cli/pull/14849)
- feat(admin): provide actionable error messages for disabled features by
  skeshive in [#17815](https://github.com/google-gemini/gemini-cli/pull/17815)
- Fix bugs where Rewind and Resume showed Ugly and 100X too verbose content. by
  jacob314 in [#17940](https://github.com/google-gemini/gemini-cli/pull/17940)
- Fix broken link in docs by chrstnb in
  [#17959](https://github.com/google-gemini/gemini-cli/pull/17959)
- feat(plan): reuse standard tool confirmation for AskUser tool by jerop in
  [#17864](https://github.com/google-gemini/gemini-cli/pull/17864)
- feat(core): enable overriding CODE_ASSIST_API_VERSION with env var by
  lottielin in [#17942](https://github.com/google-gemini/gemini-cli/pull/17942)
- run npx pointing to the specific commit SHA by sehoon38 in
  [#17970](https://github.com/google-gemini/gemini-cli/pull/17970)
- Add allowedExtensions setting by kevinjwang1 in
  [#17695](https://github.com/google-gemini/gemini-cli/pull/17695)
- feat(plan): refactor ToolConfirmationPayload to union type by jerop in
  [#17980](https://github.com/google-gemini/gemini-cli/pull/17980)
- lower the default max retries to reduce contention by sehoon38 in
  [#17975](https://github.com/google-gemini/gemini-cli/pull/17975)
- fix(core): ensure YOLO mode auto-approves complex shell commands when parsing
  fails by abhipatel12 in
  [#17920](https://github.com/google-gemini/gemini-cli/pull/17920)
- Fix broken link. by g-samroberts in
  [#17972](https://github.com/google-gemini/gemini-cli/pull/17972)
- Support ctrl-C and Ctrl-D correctly Refactor so InputPrompt has priority over
  AppContainer for input handling. by jacob314 in
  [#17993](https://github.com/google-gemini/gemini-cli/pull/17993)
- Fix truncation for AskQuestion by jacob314 in
  [#18001](https://github.com/google-gemini/gemini-cli/pull/18001)
- fix(workflow): update maintainer check logic to be inclusive and
  case-insensitive by bdmorgan in
  [#18009](https://github.com/google-gemini/gemini-cli/pull/18009)
- Fix Esc cancel during streaming by LyalinDotCom in
  [#18039](https://github.com/google-gemini/gemini-cli/pull/18039)
- feat(acp): add session resume support by bdmorgan in
  [#18043](https://github.com/google-gemini/gemini-cli/pull/18043)
- fix(ci): prevent stale PR closer from incorrectly closing new PRs by bdmorgan
  in [#18069](https://github.com/google-gemini/gemini-cli/pull/18069)
- chore: delete autoAccept setting unused in production by victorvianna in
  [#17862](https://github.com/google-gemini/gemini-cli/pull/17862)
- feat(plan): use placeholder for choice question "Other" option by jerop in
  [#18101](https://github.com/google-gemini/gemini-cli/pull/18101)
- docs: update clearContext to hookSpecificOutput by jackwotherspoon in
  [#18024](https://github.com/google-gemini/gemini-cli/pull/18024)
- docs-writer skill: Update docs writer skill by jkcinouye in
  [#17928](https://github.com/google-gemini/gemini-cli/pull/17928)
- Sehoon/oncall filter by sehoon38 in
  [#18105](https://github.com/google-gemini/gemini-cli/pull/18105)
- feat(core): add setting to disable loop detection by SandyTao520 in
  [#18008](https://github.com/google-gemini/gemini-cli/pull/18008)
- Docs: Revise docs/index.md by jkcinouye in
  [#17879](https://github.com/google-gemini/gemini-cli/pull/17879)
- Fix up/down arrow regression and add test. by jacob314 in
  [#18108](https://github.com/google-gemini/gemini-cli/pull/18108)
- fix(ui): prevent content leak in MaxSizedBox bottom overflow by jerop in
  [#17991](https://github.com/google-gemini/gemini-cli/pull/17991)
- refactor: migrate checks.ts utility to core and deduplicate by jerop in
  [#18139](https://github.com/google-gemini/gemini-cli/pull/18139)
- feat(core): implement tool name aliasing for backward compatibility by
  SandyTao520 in
  [#17974](https://github.com/google-gemini/gemini-cli/pull/17974)
- docs: fix help-wanted label spelling by pavan-sh in
  [#18114](https://github.com/google-gemini/gemini-cli/pull/18114)
- feat(cli): implement automatic theme switching based on terminal background by
  Abhijit-2592 in
  [#17976](https://github.com/google-gemini/gemini-cli/pull/17976)
- fix(ide): no-op refactoring that moves the connection logic to helper
  functions by skeshive in
  [#18118](https://github.com/google-gemini/gemini-cli/pull/18118)
- feat: update review-frontend-and-fix slash command to review-and-fix by galz10
  in [#18146](https://github.com/google-gemini/gemini-cli/pull/18146)
- fix: improve Ctrl+R reverse search by jackwotherspoon in
  [#18075](https://github.com/google-gemini/gemini-cli/pull/18075)
- feat(plan): handle inconsistency in schedulers by Adib234 in
  [#17813](https://github.com/google-gemini/gemini-cli/pull/17813)
- feat(plan): add core logic and exit_plan_mode tool definition by jerop in
  [#18110](https://github.com/google-gemini/gemini-cli/pull/18110)
- feat(core): rename search_file_content tool to grep_search and add legacy
  alias by SandyTao520 in
  [#18003](https://github.com/google-gemini/gemini-cli/pull/18003)
- fix(core): prioritize detailed error messages for code assist setup by
  gsquared94 in [#17852](https://github.com/google-gemini/gemini-cli/pull/17852)
- fix(cli): resolve environment loading and auth validation issues in ACP mode
  by bdmorgan in
  [#18025](https://github.com/google-gemini/gemini-cli/pull/18025)
- feat(core): add .agents/skills directory alias for skill discovery by
  NTaylorMullen in
  [#18151](https://github.com/google-gemini/gemini-cli/pull/18151)
- chore(core): reassign telemetry keys to avoid server conflict by mattKorwel in
  [#18161](https://github.com/google-gemini/gemini-cli/pull/18161)
- Add link to rewind doc in commands.md by Adib234 in
  [#17961](https://github.com/google-gemini/gemini-cli/pull/17961)
- feat(core): add draft-2020-12 JSON Schema support with lenient fallback by
  afarber in [#15060](https://github.com/google-gemini/gemini-cli/pull/15060)
- refactor(core): robust trimPreservingTrailingNewline and regression test by
  adamfweidman in
  [#18196](https://github.com/google-gemini/gemini-cli/pull/18196)
- Remove MCP servers on extension uninstall by chrstnb in
  [#18121](https://github.com/google-gemini/gemini-cli/pull/18121)
- refactor: localize ACP error parsing logic to cli package by bdmorgan in
  [#18193](https://github.com/google-gemini/gemini-cli/pull/18193)
- feat(core): Add A2A auth config types by adamfweidman in
  [#18205](https://github.com/google-gemini/gemini-cli/pull/18205)
- Set default max attempts to 3 and use the common variable by sehoon38 in
  [#18209](https://github.com/google-gemini/gemini-cli/pull/18209)
- feat(plan): add exit_plan_mode ui and prompt by jerop in
  [#18162](https://github.com/google-gemini/gemini-cli/pull/18162)
- fix(test): improve test isolation and enable subagent evaluations by
  cocosheng-g in
  [#18138](https://github.com/google-gemini/gemini-cli/pull/18138)
- feat(plan): use custom deny messages in plan mode policies by Adib234 in
  [#18195](https://github.com/google-gemini/gemini-cli/pull/18195)
- Match on extension ID when stopping extensions by chrstnb in
  [#18218](https://github.com/google-gemini/gemini-cli/pull/18218)
- fix(core): Respect user's .gitignore preference by xyrolle in
  [#15482](https://github.com/google-gemini/gemini-cli/pull/15482)
- docs: document GEMINI_CLI_HOME environment variable by adamfweidman in
  [#18219](https://github.com/google-gemini/gemini-cli/pull/18219)
- chore(core): explicitly state plan storage path in prompt by jerop in
  [#18222](https://github.com/google-gemini/gemini-cli/pull/18222)
- A2a admin setting by DavidAPierce in
  [#17868](https://github.com/google-gemini/gemini-cli/pull/17868)
- feat(a2a): Add pluggable auth provider infrastructure by adamfweidman in
  [#17934](https://github.com/google-gemini/gemini-cli/pull/17934)
- Fix handling of empty settings by chrstnb in
  [#18131](https://github.com/google-gemini/gemini-cli/pull/18131)
- Reload skills when extensions change by chrstnb in
  [#18225](https://github.com/google-gemini/gemini-cli/pull/18225)
- feat: Add markdown rendering to ask_user tool by jackwotherspoon in
  [#18211](https://github.com/google-gemini/gemini-cli/pull/18211)
- Add telemetry to rewind by Adib234 in
  [#18122](https://github.com/google-gemini/gemini-cli/pull/18122)
- feat(admin): add support for MCP configuration via admin controls (pt1) by
  skeshive in [#18223](https://github.com/google-gemini/gemini-cli/pull/18223)
- feat(core): require user consent before MCP server OAuth by ehedlund in
  [#18132](https://github.com/google-gemini/gemini-cli/pull/18132)
- fix(sandbox): propagate GOOGLE_GEMINI_BASE_URL&GOOGLE_VERTEX_BASE_URL env vars
  by skeshive in
  [#18231](https://github.com/google-gemini/gemini-cli/pull/18231)
- feat(ui): move user identity display to header by sehoon38 in
  [#18216](https://github.com/google-gemini/gemini-cli/pull/18216)
- fix: enforce folder trust for workspace settings, skills, and context by
  galz10 in [#17596](https://github.com/google-gemini/gemini-cli/pull/17596)

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.27.0-preview.8...v0.28.0-preview.0
