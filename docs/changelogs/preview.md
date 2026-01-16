# Preview release: Release v0.24.0-preview.0

Released: January 6, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## What's changed

- chore(core): refactor model resolution and cleanup fallback logic by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/15228
- Add Folder Trust Support To Hooks by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15325
- Record timestamp with code assist metrics. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15439
- feat(policy): implement dynamic mode-aware policy evaluation by @abhipatel12
  in https://github.com/google-gemini/gemini-cli/pull/15307
- fix(core): use debugLogger.debug for startup profiler logs by @NTaylorMullen
  in https://github.com/google-gemini/gemini-cli/pull/15443
- feat(ui): Add security warning and improve layout for Hooks list by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15440
- fix #15369, prevent crash on unhandled EIO error in readStdin cleanup by
  @ElecTwix in https://github.com/google-gemini/gemini-cli/pull/15410
- chore: improve error messages for --resume by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15360
- chore: remove clipboard file by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15447
- Implemented unified secrets sanitization and env. redaction options by
  @gundermanc in https://github.com/google-gemini/gemini-cli/pull/15348
- feat: automatic `/model` persistence across Gemini CLI sessions by @niyasrad
  in https://github.com/google-gemini/gemini-cli/pull/13199
- refactor(core): remove deprecated permission aliases from BeforeToolHookOutput
  by @StoyanD in https://github.com/google-gemini/gemini-cli/pull/14855
- fix: add missing `type` field to MCPServerConfig by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15465
- Make schema validation errors non-fatal by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15487
- chore: limit MCP resources display to 10 by default by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15489
- Add experimental in-CLI extension install and uninstall subcommands by
  @chrstnb in https://github.com/google-gemini/gemini-cli/pull/15178
- feat: Add A2A Client Manager and tests by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/15485
- feat: terse transformations of image paths in text buffer by @psinha40898 in
  https://github.com/google-gemini/gemini-cli/pull/4924
- Security: Project-level hook warnings by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15470
- Added modifyOtherKeys protocol support for tmux by @ved015 in
  https://github.com/google-gemini/gemini-cli/pull/15524
- chore(core): fix comment typo by @Mapleeeeeeeeeee in
  https://github.com/google-gemini/gemini-cli/pull/15558
- feat: Show snowfall animation for holiday theme by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15494
- do not persist the fallback model by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15483
- Resolve unhandled promise rejection in ide-client.ts by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/15587
- fix(core): handle checkIsRepo failure in GitService.initialize by
  @Mapleeeeeeeeeee in https://github.com/google-gemini/gemini-cli/pull/15574
- fix(cli): add enableShellOutputEfficiency to settings schema by
  @Mapleeeeeeeeeee in https://github.com/google-gemini/gemini-cli/pull/15560
- Manual nightly version bump to 0.24.0-nightly.20251226.546baf993 by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15594
- refactor(core): extract static concerns from CoreToolScheduler by @abhipatel12
  in https://github.com/google-gemini/gemini-cli/pull/15589
- fix(core): enable granular shell command allowlisting in policy engine by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15601
- chore/release: bump version to 0.24.0-nightly.20251227.37be16243 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15612
- refactor: deprecate legacy confirmation settings and enforce Policy Engine by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15626
- Migrate console to coreEvents.emitFeedback or debugLogger by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/15219
- Exponential back-off retries for retryable error without a specified … by
  @sehoon38 in https://github.com/google-gemini/gemini-cli/pull/15684
- feat(agents): add support for remote agents and multi-agent TOML files by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/15437
- Update wittyPhrases.ts by @segyges in
  https://github.com/google-gemini/gemini-cli/pull/15697
- refactor(auth): Refactor non-interactive mode auth validation & refresh by
  @skeshive in https://github.com/google-gemini/gemini-cli/pull/15679
- Revert "Update wittyPhrases.ts (#15697)" by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15719
- fix(hooks): deduplicate agent hooks and add cross-platform integration tests
  by @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15701
- Implement support for tool input modification by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15492
- Add instructions to the extensions update info notification by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14907
- Add extension settings info to /extensions list by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14905
- Agent Skills: Implement Core Skill Infrastructure & Tiered Discovery by
  @NTaylorMullen in https://github.com/google-gemini/gemini-cli/pull/15698
- chore: remove cot style comments by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15735
- feat(agents): Add remote agents to agent registry by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15711
- feat(hooks): implement STOP_EXECUTION and enhance hook decision handling by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15685
- Fix build issues caused by year-specific linter rule by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15780
- fix(core): handle unhandled promise rejection in mcp-client-manager by
  @kamja44 in https://github.com/google-gemini/gemini-cli/pull/14701
- log fallback mode by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15817
- Agent Skills: Implement Autonomous Activation Tool & Context Injection by
  @NTaylorMullen in https://github.com/google-gemini/gemini-cli/pull/15725
- fix(core): improve shell command with redirection detection by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15683
- Add security docs by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15739
- feat: add folder suggestions to `/dir add` command by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15724
- Agent Skills: Implement Agent Integration and System Prompt Awareness by
  @NTaylorMullen in https://github.com/google-gemini/gemini-cli/pull/15728
- chore: cleanup old smart edit settings by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15832
- Agent Skills: Status Bar Integration for Skill Counts by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15741
- fix(core): mock powershell output in shell-utils test by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15831
- Agent Skills: Unify Representation & Centralize Loading by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15833
- Unify shell security policy and remove legacy logic by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15770
- feat(core): restore MessageBus optionality for soft migration (Phase 1) by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15774
- feat(core): Standardize Tool and Agent Invocation constructors (Phase 2) by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15775
- feat(core,cli): enforce mandatory MessageBus injection (Phase 3 Hard
  Migration) by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15776
- Agent Skills: Extension Support & Security Disclosure by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15834
- feat(hooks): implement granular stop and block behavior for agent hooks by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15824
- Agent Skills: Add gemini skills CLI management command by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15837
- refactor: consolidate EditTool and SmartEditTool by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15857
- fix(cli): mock fs.readdir in consent tests for Windows compatibility by
  @NTaylorMullen in https://github.com/google-gemini/gemini-cli/pull/15904
- refactor(core): Extract and integrate ToolExecutor by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15900
- Fix terminal hang when user exits browser without logging in by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15748
- fix: avoid SDK warning by not accessing .text getter in logging by @ved015 in
  https://github.com/google-gemini/gemini-cli/pull/15706
- Make default settings apply by @devr0306 in
  https://github.com/google-gemini/gemini-cli/pull/15354
- chore: rename smart-edit to edit by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15923
- Opt-in to persist model from /model by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15820
- fix: prevent /copy crash on Windows by skipping /dev/tty by @ManojINaik in
  https://github.com/google-gemini/gemini-cli/pull/15657
- Support context injection via SessionStart hook. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15746
- Fix order of preflight by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15941
- Fix failing unit tests by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15940
- fix(cli): resolve paste issue on Windows terminals. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15932
- Agent Skills: Implement /skills reload by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15865
- Add setting to support OSC 52 paste by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15336
- remove manual string when displaying manual model in the footer by @sehoon38
  in https://github.com/google-gemini/gemini-cli/pull/15967
- fix(core): use correct interactive check for system prompt by @ppergame in
  https://github.com/google-gemini/gemini-cli/pull/15020
- Inform user of missing settings on extensions update by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/15944
- feat(policy): allow 'modes' in user and admin policies by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15977
- fix: default folder trust to untrusted for enhanced security by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15943
- Add description for each settings item in /settings by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15936
- Use GetOperation to poll for OnboardUser completion by @ishaanxgupta in
  https://github.com/google-gemini/gemini-cli/pull/15827
- Agent Skills: Add skill directory to WorkspaceContext upon activation by
  @NTaylorMullen in https://github.com/google-gemini/gemini-cli/pull/15870
- Fix settings command fallback by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/15926
- fix: writeTodo construction by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/16014
- properly disable keyboard modes on exit by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/16006
- Add workflow to label child issues for rollup by @bdmorgan in
  https://github.com/google-gemini/gemini-cli/pull/16002
- feat(ui): add visual indicators for hook execution by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15408
- fix: image token estimation by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/16004
- feat(hooks): Add a hooks.enabled setting. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/15933
- feat(admin): Introduce remote admin settings & implement
  secureModeEnabled/mcpEnabled by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/15935
- Remove trailing whitespace in yaml. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/16036
- feat(agents): add support for remote agents by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/16013
- fix: limit scheduled issue triage queries to prevent argument list too long
  error by @jerop in https://github.com/google-gemini/gemini-cli/pull/16021
- ci(github-actions): triage all new issues automatically by @jerop in
  https://github.com/google-gemini/gemini-cli/pull/16018
- Fix test. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/16011
- fix: hide broken skills object from settings dialog by @korade-krushna in
  https://github.com/google-gemini/gemini-cli/pull/15766
- Agent Skills: Initial Documentation & Tutorial by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15869

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.23.0-preview.6...v0.24.0-preview.0
