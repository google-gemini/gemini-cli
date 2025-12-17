# Gemini CLI changelog

Gemini CLI has three major release channels: nightly, preview, and stable. For
most users, we recommend the stable release.

On this page, you can find information regarding the current releases and
highlights from each release.

For the full changelog, including nightly releases, refer to
[Releases - google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli/releases)
on GitHub.

## Current Releases

| Release channel                             | Notes                                           |
| :------------------------------------------ | :---------------------------------------------- |
| Nightly                                     | Nightly release with the most recent changes.   |
| [Preview](#release-v0220-preview-0-preview) | Experimental features ready for early feedback. |
| [Latest](#release-v0210---v0211-latest)     | Stable, recommended for general use.            |

## Release v0.21.0 - v0.21.1 (Latest)

### Highlights

- **⚡️⚡️⚡️ Gemini 3 Flash + Gemini CLI:** If you are a paid user, you can now
  enable Gemini 3 Pro and Gemini 3 Flash. Go to `/settings` and set **Preview
  Features** to `true` to enable Gemini 3. For more information:
  [Gemini 3 Flash is now available in Gemini CLI](https://developers.googleblog.com/gemini-3-flash-is-now-available-in-gemini-cli/).

### What's Changed

- refactor(stdio): always patch stdout and use createWorkingStdio for clean
  output by @allenhutchison in
  https://github.com/google-gemini/gemini-cli/pull/14159
- chore(release): bump version to 0.21.0-nightly.20251202.2d935b379 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14409
- implement fuzzy search inside settings by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/13864
- feat: enable message bus integration by default by @allenhutchison in
  https://github.com/google-gemini/gemini-cli/pull/14329
- docs: Recommend using --debug intead of --verbose for CLI debugging by @bbiggs
  in https://github.com/google-gemini/gemini-cli/pull/14334
- feat: consolidate remote MCP servers to use `url` in config by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/13762
- Restrict integration tests tools by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14403
- track github repository names in telemetry events by @IamRiddhi in
  https://github.com/google-gemini/gemini-cli/pull/13670
- Allow telemetry exporters to GCP to utilize user's login credentials, if
  requested by @mboshernitsan in
  https://github.com/google-gemini/gemini-cli/pull/13778
- refactor(editor): use const assertion for editor types with single source of
  truth by @amsminn in https://github.com/google-gemini/gemini-cli/pull/8604
- fix(security): Fix npm audit vulnerabilities in glob and body-parser by
  @afarber in https://github.com/google-gemini/gemini-cli/pull/14090
- Add new enterprise instructions by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/8641
- feat(hooks): Hook Session Lifecycle & Compression Integration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/14151
- Avoid triggering refreshStatic unless there really is a banner to display. by
  @jacob314 in https://github.com/google-gemini/gemini-cli/pull/14328
- feat(hooks): Hooks Commands Panel, Enable/Disable, and Migrate by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/14225
- fix: Bundle default policies for npx distribution by @allenhutchison in
  https://github.com/google-gemini/gemini-cli/pull/14457
- feat(hooks): Hook System Documentation by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/14307
- Fix tests by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14458
- feat: add scheduled workflow to close stale issues by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/14404
- feat: Support Extension Hooks with Security Warning by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/14460
- feat: Add enableAgents experimental flag by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/14371
- docs: fix typo 'socus' to 'focus' in todos.md by @Viktor286 in
  https://github.com/google-gemini/gemini-cli/pull/14374
- Markdown export: move the emoji to the end of the line by @mhansen in
  https://github.com/google-gemini/gemini-cli/pull/12278
- fix(acp): prevent unnecessary credential cache clearing on re-authent… by
  @h-michael in https://github.com/google-gemini/gemini-cli/pull/9410
- fix(cli): Fix word navigation for CJK characters by @SandyTao520 in
  https://github.com/google-gemini/gemini-cli/pull/14475
- Remove example extension by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14376
- Add commands for listing and updating per-extension settings by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/12664
- chore(tests): remove obsolete test for hierarchical memory by @pareshjoshij in
  https://github.com/google-gemini/gemini-cli/pull/13122
- feat(cli): support /copy in remote sessions using OSC52 by @ismellpillows in
  https://github.com/google-gemini/gemini-cli/pull/13471
- Update setting search UX by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/14451
- Fix(cli): Improve Homebrew update instruction to specify gemini-cli by
  @DaanVersavel in https://github.com/google-gemini/gemini-cli/pull/14502
- do not toggle the setting item when entering space by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/14489
- fix: improve retry logic for fetch errors and network codes by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/14439
- remove unused isSearching field by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/14509
- feat(mcp): add `--type` alias for `--transport` flag in gemini mcp add by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/14503
- feat(cli): Move key restore logic to core by @cocosheng-g in
  https://github.com/google-gemini/gemini-cli/pull/13013
- feat: add auto-execute on Enter behavior to argumentless MCP prompts by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/14510
- fix(shell): cursor visibility when using interactive mode by @aswinashok44 in
  https://github.com/google-gemini/gemini-cli/pull/14095
- Adding session id as part of json o/p by @MJjainam in
  https://github.com/google-gemini/gemini-cli/pull/14504
- fix(extensions): resolve GitHub API 415 error for source tarballs by
  @jpoehnelt in https://github.com/google-gemini/gemini-cli/pull/13319
- fix(client): Correctly latch hasFailedCompressionAttempt flag by @pareshjoshij
  in https://github.com/google-gemini/gemini-cli/pull/13002
- Disable flaky extension reloading test on linux by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14528
- Add support for MCP dynamic tool update by `notifications/tools/list_changed`
  by @Adib234 in https://github.com/google-gemini/gemini-cli/pull/14375
- Fix privacy screen for legacy tier users by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14522
- feat: Exclude maintainer labeled issues from stale issue closer by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/14532
- Grant chained workflows proper permission. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14534
- Make trigger_e2e manually fireable. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14547
- Write e2e status to local repo not forked repo by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14549
- Fixes [API Error: Cannot read properties of undefined (reading 'error')] by
  @silviojr in https://github.com/google-gemini/gemini-cli/pull/14553
- Trigger chained e2e tests on all pull requests by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14551
- Fix bug in the shellExecutionService resulting in both truncation and 3X bloat
  by @jacob314 in https://github.com/google-gemini/gemini-cli/pull/14545
- Fix issue where we were passing the model content reflecting terminal line
  wrapping. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/14566
- chore/release: bump version to 0.21.0-nightly.20251204.3da4fd5f7 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14476
- feat(sessions): use 1-line generated session summary to describe sessions by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/14467
- Use Robot PAT for chained e2e merge queue skipper by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14585
- fix(core): improve API response error handling and retry logic by @mattKorwel
  in https://github.com/google-gemini/gemini-cli/pull/14563
- Docs: Model routing clarification by @jkcinouye in
  https://github.com/google-gemini/gemini-cli/pull/14373
- expose previewFeatures flag in a2a by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/14550
- Fix emoji width in debug console. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/14593
- Fully detach autoupgrade process by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14595
- Docs: Update Gemini 3 on Gemini CLI documentation by @jkcinouye in
  https://github.com/google-gemini/gemini-cli/pull/14601
- Disallow floating promises. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/14605
- chore/release: bump version to 0.21.0-nightly.20251207.025e450ac by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14662
- feat(modelAvailabilityService): integrate model availability service into
  backend logic by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/14470
- Add prompt_id propagation in a2a-server task by @koxkox111 in
  https://github.com/google-gemini/gemini-cli/pull/14581
- Fix: Prevent freezing in non-interactive Gemini CLI when debug mode is enabled
  by @parthasaradhie in https://github.com/google-gemini/gemini-cli/pull/14580
- fix(audio): improve reading of audio files by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/14658
- Update automated triage workflow to stop assigning priority labels by
  @skeshive in https://github.com/google-gemini/gemini-cli/pull/14717
- set failed status when chained e2e fails by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14725
- feat(github action) Triage and Label Pull Requests by Size and Comple… by
  @DaanVersavel in https://github.com/google-gemini/gemini-cli/pull/5571
- refactor(telemetry): Improve previous PR that allows telemetry to use the CLI
  auth and add testing by @mboshernitsan in
  https://github.com/google-gemini/gemini-cli/pull/14589
- Always set status in chained_e2e workflow by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14730
- feat: Add OTEL log event `gemini_cli.startup_stats` for startup stats. by
  @kevin-ramdass in https://github.com/google-gemini/gemini-cli/pull/14734
- feat: auto-execute on slash command completion functions by @jackwotherspoon
  in https://github.com/google-gemini/gemini-cli/pull/14584
- Docs: Proper release notes by @jkcinouye in
  https://github.com/google-gemini/gemini-cli/pull/14405
- Add support for user-scoped extension settings by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/13748
- refactor(core): Improve environment variable handling in shell execution by
  @galz10 in https://github.com/google-gemini/gemini-cli/pull/14742
- Remove old E2E Workflows by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14749
- fix: handle missing local extension config and skip hooks when disabled by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/14744
- chore/release: bump version to 0.21.0-nightly.20251209.ec9a8c7a7 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14751
- feat: Add support for MCP Resources by @MrLesk in
  https://github.com/google-gemini/gemini-cli/pull/13178
- Always set pending status in E2E tests by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14756
- fix(lint): upgrade pip and use public pypi for yamllint by @allenhutchison in
  https://github.com/google-gemini/gemini-cli/pull/14746
- fix: use Gemini API supported image formats for clipboard by @jackwotherspoon
  in https://github.com/google-gemini/gemini-cli/pull/14762
- feat(a2a): Introduce restore command for a2a server by @cocosheng-g in
  https://github.com/google-gemini/gemini-cli/pull/13015
- allow final:true to be returned on a2a server edit calls. by @DavidAPierce in
  https://github.com/google-gemini/gemini-cli/pull/14747
- (fix) Automated pr labeller by @DaanVersavel in
  https://github.com/google-gemini/gemini-cli/pull/14788
- Update CODEOWNERS by @kklashtorny1 in
  https://github.com/google-gemini/gemini-cli/pull/14830
- Docs: Fix errors preventing site rebuild. by @jkcinouye in
  https://github.com/google-gemini/gemini-cli/pull/14842
- chore(deps): bump express from 5.1.0 to 5.2.0 by @dependabot[bot] in
  https://github.com/google-gemini/gemini-cli/pull/14325
- fix(patch): cherry-pick 3f5f030 to release/v0.21.0-preview.0-pr-14843 to patch
  version v0.21.0-preview.0 and create version 0.21.0-preview.1 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14851
- fix(patch): cherry-pick ee6556c to release/v0.21.0-preview.1-pr-14691 to patch
  version v0.21.0-preview.1 and create version 0.21.0-preview.2 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14908
- fix(patch): cherry-pick 54de675 to release/v0.21.0-preview.2-pr-14961 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14968
- fix(patch): cherry-pick 12cbe32 to release/v0.21.0-preview.3-pr-15000 to patch
  version v0.21.0-preview.3 and create version 0.21.0-preview.4 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15003
- fix(patch): cherry-pick edbe548 to release/v0.21.0-preview.4-pr-15007 to patch
  version v0.21.0-preview.4 and create version 0.21.0-preview.5 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15015
- fix(patch): cherry-pick 2995af6 to release/v0.21.0-preview.5-pr-15131 to patch
  version v0.21.0-preview.5 and create version 0.21.0-preview.6 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15153

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.20.2...v0.21.0

## Release v0.22.0-preview-0 (Preview)

### What's Changed

- feat(ide): fallback to GEMINI_CLI_IDE_AUTH_TOKEN env var by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/14843
- feat: display quota stats for unused models in /stats by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/14764
- feat: ensure codebase investigator uses preview model when main agent does by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/14412
- chore: add closing reason to stale bug workflow by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/14861
- Send the model and CLI version with the user agent by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/14865
- refactor(sessions): move session summary generation to startup by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/14691
- Limit search depth in path corrector by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14869
- Fix: Correct typo in code comment by @kuishou68 in
  https://github.com/google-gemini/gemini-cli/pull/14671
- feat(core): Plumbing for late resolution of model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/14597
- feat: attempt more error parsing by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/14899
- Add missing await. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/14910
- feat(core): Add support for transcript_path in hooks for git-ai/Gemini
  extension by @svarlamov in
  https://github.com/google-gemini/gemini-cli/pull/14663
- refactor: implement DelegateToAgentTool with discriminated union by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/14769
- feat: reset availabilityService on /auth by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/14911
- chore/release: bump version to 0.21.0-nightly.20251211.8c83e1ea9 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14924
- Fix: Correctly detect MCP tool errors by @kevin-ramdass in
  https://github.com/google-gemini/gemini-cli/pull/14937
- increase labeler timeout by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14922
- tool(cli): tweak the frontend tool to be aware of more core files from the cli
  by @jacob314 in https://github.com/google-gemini/gemini-cli/pull/14962
- feat(cli): polish cached token stats and simplify stats display when quota is
  present. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/14961
- feat(settings-validation): add validation for settings schema by @lifefloating
  in https://github.com/google-gemini/gemini-cli/pull/12929
- fix(ide): Update IDE extension to write auth token in env var by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/14999
- Revert "chore(deps): bump express from 5.1.0 to 5.2.0" by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/14998
- feat(a2a): Introduce /init command for a2a server by @cocosheng-g in
  https://github.com/google-gemini/gemini-cli/pull/13419
- feat: support multi-file drag and drop of images by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/14832
- fix(policy): allow codebase_investigator by default in read-only policy by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15000
- refactor(ide ext): Update port file name + switch to 1-based index for
  characters + remove truncation text by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/10501
- fix(vscode-ide-companion): correct license generation for workspace
  dependencies by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/15004
- fix: temp fix for subagent invocation until subagent delegation is merged to
  stable by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15007
- test: update ide detection tests to make them more robust when run in an ide
  by @kevin-ramdass in https://github.com/google-gemini/gemini-cli/pull/15008
- Remove flex from stats display. See snapshots for diffs. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/14983
- Add license field into package.json by @jb-perez in
  https://github.com/google-gemini/gemini-cli/pull/14473
- feat: Persistent "Always Allow" policies with granular shell & MCP support by
  @allenhutchison in https://github.com/google-gemini/gemini-cli/pull/14737
- chore/release: bump version to 0.21.0-nightly.20251212.54de67536 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14969
- fix(core): commandPrefix word boundary and compound command safety by
  @allenhutchison in https://github.com/google-gemini/gemini-cli/pull/15006
- chore(docs): add 'Maintainers only' label info to CONTRIBUTING.md by @jacob314
  in https://github.com/google-gemini/gemini-cli/pull/14914
- Refresh hooks when refreshing extensions. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14918
- Add clarity to error messages by @gsehgal in
  https://github.com/google-gemini/gemini-cli/pull/14879
- chore : remove a redundant tip by @JayadityaGit in
  https://github.com/google-gemini/gemini-cli/pull/14947
- chore/release: bump version to 0.21.0-nightly.20251213.977248e09 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15029
- Disallow redundant typecasts. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15030
- fix(auth): prioritize GEMINI_API_KEY env var and skip unnecessary key… by
  @galz10 in https://github.com/google-gemini/gemini-cli/pull/14745
- fix: use zod for safety check result validation by @allenhutchison in
  https://github.com/google-gemini/gemini-cli/pull/15026
- update(telemetry): add hashed_extension_name to field to extension events by
  @kiranani in https://github.com/google-gemini/gemini-cli/pull/15025
- fix: similar to policy-engine, throw error in case of requiring tool execution
  confirmation for non-interactive mode by @MayV in
  https://github.com/google-gemini/gemini-cli/pull/14702
- Clean up processes in integration tests by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15102
- docs: update policy engine getting started and defaults by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15105
- Fix tool output fragmentation by encapsulating content in functionResponse by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/13082
- Simplify method signature. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15114
- Show raw input token counts in json output. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15021
- fix: Mark A2A requests as interactive by @MayV in
  https://github.com/google-gemini/gemini-cli/pull/15108
- use previewFeatures to determine which pro model to use for A2A by @sehoon38
  in https://github.com/google-gemini/gemini-cli/pull/15131
- refactor(cli): fix settings merging so that settings using the new json format
  take priority over ones using the old format by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15116

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.21.0-preview.6...v0.22.0-preview.0

## Release v0.20.0 - v0.20.2

### What's Changed

- Update error codes when process exiting the gemini cli by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13728
- chore(release): bump version to 0.20.0-nightly.20251126.d2a6cff4d by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13835
- feat(core): Improve request token calculation accuracy by @SandyTao520 in
  https://github.com/google-gemini/gemini-cli/pull/13824
- Changes in system instruction to adapt to gemini 3.0 to ensure that the CLI
  explains its actions before calling tools by @silviojr in
  https://github.com/google-gemini/gemini-cli/pull/13810
- feat(hooks): Hook Tool Execution Integration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9108
- Add support for MCP server instructions behind config option by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/13432
- Update System Instructions for interactive vs non-interactive mode. by
  @aishaneeshah in https://github.com/google-gemini/gemini-cli/pull/12315
- Add consent flag to Link command by @kevinjwang1 in
  https://github.com/google-gemini/gemini-cli/pull/13832
- feat(mcp): Inject GoogleCredentialProvider headers in McpClient by
  @sai-sunder-s in https://github.com/google-gemini/gemini-cli/pull/13783
- feat(core): implement towards policy-driven model fallback mechanism by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/13781
- feat(core): Add configurable inactivity timeout for shell commands by @galz10
  in https://github.com/google-gemini/gemini-cli/pull/13531
- fix(auth): improve API key authentication flow by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/13829
- feat(hooks): Hook LLM Request/Response Integration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9110
- feat(ui): Show waiting MCP servers in ConfigInitDisplay by @werdnum in
  https://github.com/google-gemini/gemini-cli/pull/13721
- Add usage limit remaining in /stats by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/13843
- feat(shell): Standardize pager to 'cat' for shell execution by model by
  @galz10 in https://github.com/google-gemini/gemini-cli/pull/13878
- chore/release: bump version to 0.20.0-nightly.20251127.5bed97064 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13877
- Revert to default LICENSE (Revert #13449) by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13876
- update(telemetry): OTel API response event with finish reasons by @kiranani in
  https://github.com/google-gemini/gemini-cli/pull/13849
- feat(hooks): Hooks Comprehensive Integration Testing by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9112
- chore: fix session browser test and skip hook system tests by @jackwotherspoon
  in https://github.com/google-gemini/gemini-cli/pull/14099
- feat(telemetry): Add Semantic logging for to ApiRequestEvents by @kiranani in
  https://github.com/google-gemini/gemini-cli/pull/13912
- test: Add verification for $schema property in settings schema by
  @maryamariyan in https://github.com/google-gemini/gemini-cli/pull/13497
- Fixes `/clear` command to preserve input history for up-arrow navigation while
  still clearing the context window and screen by @korade-krushna in
  https://github.com/google-gemini/gemini-cli/pull/14182
- fix(core): handle EPIPE error in hook runner when writing to stdin by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/14231
- fix: Exclude web-fetch tool from executing in default non-interactive mode to
  avoid CLI hang. by @MayV in
  https://github.com/google-gemini/gemini-cli/pull/14244
- Always use MCP server instructions by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14297
- feat: auto-execute simple slash commands on Enter by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/13985
- chore/release: bump version to 0.20.0-nightly.20251201.2fe609cb6 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14304
- feat: Add startup profiler to measure and record application initialization
  phases. by @kevin-ramdass in
  https://github.com/google-gemini/gemini-cli/pull/13638
- bug(core): Avoid stateful tool use in `executor`. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/14305
- feat(themes): add built-in holiday theme 🎁 by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/14301
- Updated ToC on docs intro; updated title casing to match Google style by
  @pcoet in https://github.com/google-gemini/gemini-cli/pull/13717
- feat(a2a): Urgent fix - Process modelInfo agent message by @cocosheng-g in
  https://github.com/google-gemini/gemini-cli/pull/14315
- feat(core): enhance availability routing with wrapped fallback and
  single-model policies by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13874
- chore(logging): log the problematic event for #12122 by @briandealwis in
  https://github.com/google-gemini/gemini-cli/pull/14092
- fix: remove invalid type key in bug_report.yml by @fancive in
  https://github.com/google-gemini/gemini-cli/pull/13576
- update screenshot by @Transient-Onlooker in
  https://github.com/google-gemini/gemini-cli/pull/13976
- docs: Fix grammar error in Release Cadence (Nightly section) by @JuanCS-Dev in
  https://github.com/google-gemini/gemini-cli/pull/13866
- fix(async): prevent missed async errors from bypassing catch handlers by
  @amsminn in https://github.com/google-gemini/gemini-cli/pull/13714
- fix(zed-integration): remove extra field from acp auth request by
  @marcocondrache in https://github.com/google-gemini/gemini-cli/pull/13646
- feat(cli): Documentation for model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/12967
- fix(ui): misaligned markdown table rendering by @dumbbellcode in
  https://github.com/google-gemini/gemini-cli/pull/8336
- docs: Update 4 files by @g-samroberts in
  https://github.com/google-gemini/gemini-cli/pull/13628
- fix: Conditionally add set -eEuo pipefail in setup-github command by @Smetalo
  in https://github.com/google-gemini/gemini-cli/pull/8550
- fix(cli): fix issue updating a component while rendering a different component
  by @jacob314 in https://github.com/google-gemini/gemini-cli/pull/14319
- Increase flakey test timeout by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14377
- Remove references to deleted kind/bug label by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14383
- Don't fail test if we can't cleanup by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14389
- feat(core): Implement JIT context manager and setting by @SandyTao520 in
  https://github.com/google-gemini/gemini-cli/pull/14324
- Use polling for extensions-reload integration test by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14391
- Add docs directive to GEMINI.md by @g-samroberts in
  https://github.com/google-gemini/gemini-cli/pull/14327
- Hide sessions that don't have user messages by @bl-ue in
  https://github.com/google-gemini/gemini-cli/pull/13994
- chore(ci): mark GitHub release as pre-release if not on "latest" npm channel
  by @ljxfstorm in https://github.com/google-gemini/gemini-cli/pull/7386
- fix(patch): cherry-pick d284fa6 to release/v0.20.0-preview.0-pr-14545
  [CONFLICTS] by @gemini-cli-robot in
  https://github.com/google-gemini/gemini-cli/pull/14559
- fix(patch): cherry-pick 828afe1 to release/v0.20.0-preview.1-pr-14159 to patch
  version v0.20.0-preview.1 and create version 0.20.0-preview.2 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14733
- fix(patch): cherry-pick 171103a to release/v0.20.0-preview.2-pr-14742 to patch
  version v0.20.0-preview.2 and create version 0.20.0-preview.5 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14752

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.19.4...v0.20.0

## Release v0.19.0 - v0.19.4

## Highlights

- **Zed integration:** Users can now leverage Gemini 3 within the Zed
  integration after enabling "Preview Features" in their CLI’s `/settings`.
- **Interactive shell:**
  - **Click-to-Focus:** Go to `/settings` and enable **Use Alternate Buffer**
    When "Use Alternate Buffer" setting is enabled users can click within the
    embedded shell output to focus it for input.
  - **Loading phrase:** Clearly indicates when the interactive shell is awaiting
    user input. ([vid](https://imgur.com/a/kjK8bUK)
    [pr](https://github.com/google-gemini/gemini-cli/pull/12535) by
    [@jackwotherspoon](https://github.com/jackwotherspoon))

### What's Changed

- Use lenient MCP output schema validator by @cornmander in
  https://github.com/google-gemini/gemini-cli/pull/13521
- Update persistence state to track counts of messages instead of times banner
  has been displayed by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13428
- update docs for http proxy by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13538
- move stdio by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13528
- chore(release): bump version to 0.19.0-nightly.20251120.8e531dc02 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13540
- Skip pre-commit hooks for shadow repo (#13331) by @vishvananda in
  https://github.com/google-gemini/gemini-cli/pull/13488
- fix(ui): Correct mouse click cursor positioning for wide characters by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/13537
- fix(core): correct bash @P prompt transformation detection by @pyrytakala in
  https://github.com/google-gemini/gemini-cli/pull/13544
- Optimize and improve test coverage for cli/src/config by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13485
- Improve code coverage for cli/src/ui/privacy package by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13493
- docs: fix typos in source code and documentation by @fancive in
  https://github.com/google-gemini/gemini-cli/pull/13577
- Improved code coverage for cli/src/zed-integration by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13570
- feat(ui): build interactive session browser component by @bl-ue in
  https://github.com/google-gemini/gemini-cli/pull/13351
- Fix multiple bugs with auth flow including using the implemented but unused
  restart support. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13565
- feat(core): add modelAvailabilityService for managing and tracking model
  health by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13426
- docs: fix grammar typo "a MCP" to "an MCP" by @noahacgn in
  https://github.com/google-gemini/gemini-cli/pull/13595
- feat: custom loading phrase when interactive shell requires input by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/12535
- docs: Update uninstall command to reflect multiple extension support by
  @JayadityaGit in https://github.com/google-gemini/gemini-cli/pull/13582
- bug(core): Ensure we use thinking budget on fallback to 2.5 by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13596
- Remove useModelRouter experimental flag by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13593
- feat(docs): Ensure multiline JS objects are rendered properly. by @joshualitt
  in https://github.com/google-gemini/gemini-cli/pull/13535
- Fix exp id logging by @owenofbrien in
  https://github.com/google-gemini/gemini-cli/pull/13430
- Moved client id logging into createBasicLogEvent by @owenofbrien in
  https://github.com/google-gemini/gemini-cli/pull/13607
- Restore bracketed paste mode after external editor exit by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13606
- feat(core): Add support for custom aliases for model configs. by @joshualitt
  in https://github.com/google-gemini/gemini-cli/pull/13546
- feat(core): Add `BaseLlmClient.generateContent`. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13591
- Turn off alternate buffer mode by default. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13623
- fix(cli): Prevent stdout/stderr patching for extension commands by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/13600
- Improve test coverage for cli/src/ui/components by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13598
- Update ink version to 6.4.6 by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13631
- chore/release: bump version to 0.19.0-nightly.20251122.42c2e1b21 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13637
- chore/release: bump version to 0.19.0-nightly.20251123.dadd606c0 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13675
- chore/release: bump version to 0.19.0-nightly.20251124.e177314a4 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13713
- fix(core): Fix context window overflow warning for PDF files by @kkitase in
  https://github.com/google-gemini/gemini-cli/pull/13548
- feat :rephrasing the extension logging messages to run the explore command
  when there are no extensions installed by @JayadityaGit in
  https://github.com/google-gemini/gemini-cli/pull/13740
- Improve code coverage for cli package by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13724
- Add session subtask in /stats command by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13750
- feat(core): Migrate chatCompressionService to model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/12863
- feat(hooks): Hook Telemetry Infrastructure by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9082
- fix: (some minor improvements to configs and getPackageJson return behaviour)
  by @grMLEqomlkkU5Eeinz4brIrOVCUCkJuN in
  https://github.com/google-gemini/gemini-cli/pull/12510
- feat(hooks): Hook Event Handling by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9097
- feat(hooks): Hook Agent Lifecycle Integration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9105
- feat(core): Land bool for alternate system prompt. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13764
- bug(core): Add default chat compression config. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13766
- feat(model-availability): introduce ModelPolicy and PolicyCatalog by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/13751
- feat(hooks): Hook System Orchestration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9102
- feat(config): add isModelAvailabilityServiceEnabled setting by @adamfweidman
  in https://github.com/google-gemini/gemini-cli/pull/13777
- chore/release: bump version to 0.19.0-nightly.20251125.f6d97d448 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13782
- chore: remove console.error by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13779
- fix: Add $schema property to settings.schema.json by @sacrosanctic in
  https://github.com/google-gemini/gemini-cli/pull/12763
- fix(cli): allow non-GitHub SCP-styled URLs for extension installation by @m0ps
  in https://github.com/google-gemini/gemini-cli/pull/13800
- fix(resume): allow passing a prompt via stdin while resuming using --resume by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13520
- feat(sessions): add /resume slash command to open the session browser by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13621
- docs(sessions): add documentation for chat recording and session management by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13667
- Fix TypeError: "URL.parse is not a function" for Node.js < v22 by @macarronesc
  in https://github.com/google-gemini/gemini-cli/pull/13698
- fallback to flash for TerminalQuota errors by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/13791
- Update Code Wiki README badge by @PatoBeltran in
  https://github.com/google-gemini/gemini-cli/pull/13768
- Add Databricks auth support and custom header option to gemini cli by
  @AarushiShah in https://github.com/google-gemini/gemini-cli/pull/11893
- Update dependency for modelcontextprotocol/sdk to 1.23.0 by @bbiggs in
  https://github.com/google-gemini/gemini-cli/pull/13827
- fix(patch): cherry-pick 576fda1 to release/v0.19.0-preview.0-pr-14099
  [CONFLICTS] by @gemini-cli-robot in
  https://github.com/google-gemini/gemini-cli/pull/14402

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.18.4...v0.19.0

## Release v0.19.0-preview.0

### What's Changed

- Use lenient MCP output schema validator by @cornmander in
  https://github.com/google-gemini/gemini-cli/pull/13521
- Update persistence state to track counts of messages instead of times banner
  has been displayed by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13428
- update docs for http proxy by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13538
- move stdio by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13528
- chore(release): bump version to 0.19.0-nightly.20251120.8e531dc02 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13540
- Skip pre-commit hooks for shadow repo (#13331) by @vishvananda in
  https://github.com/google-gemini/gemini-cli/pull/13488
- fix(ui): Correct mouse click cursor positioning for wide characters by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/13537
- fix(core): correct bash @P prompt transformation detection by @pyrytakala in
  https://github.com/google-gemini/gemini-cli/pull/13544
- Optimize and improve test coverage for cli/src/config by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13485
- Improve code coverage for cli/src/ui/privacy package by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13493
- docs: fix typos in source code and documentation by @fancive in
  https://github.com/google-gemini/gemini-cli/pull/13577
- Improved code coverage for cli/src/zed-integration by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13570
- feat(ui): build interactive session browser component by @bl-ue in
  https://github.com/google-gemini/gemini-cli/pull/13351
- Fix multiple bugs with auth flow including using the implemented but unused
  restart support. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13565
- feat(core): add modelAvailabilityService for managing and tracking model
  health by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13426
- docs: fix grammar typo "a MCP" to "an MCP" by @noahacgn in
  https://github.com/google-gemini/gemini-cli/pull/13595
- feat: custom loading phrase when interactive shell requires input by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/12535
- docs: Update uninstall command to reflect multiple extension support by
  @JayadityaGit in https://github.com/google-gemini/gemini-cli/pull/13582
- bug(core): Ensure we use thinking budget on fallback to 2.5 by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13596
- Remove useModelRouter experimental flag by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13593
- feat(docs): Ensure multiline JS objects are rendered properly. by @joshualitt
  in https://github.com/google-gemini/gemini-cli/pull/13535
- Fix exp id logging by @owenofbrien in
  https://github.com/google-gemini/gemini-cli/pull/13430
- Moved client id logging into createBasicLogEvent by @owenofbrien in
  https://github.com/google-gemini/gemini-cli/pull/13607
- Restore bracketed paste mode after external editor exit by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13606
- feat(core): Add support for custom aliases for model configs. by @joshualitt
  in https://github.com/google-gemini/gemini-cli/pull/13546
- feat(core): Add `BaseLlmClient.generateContent`. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13591
- Turn off alternate buffer mode by default. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13623
- fix(cli): Prevent stdout/stderr patching for extension commands by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/13600
- Improve test coverage for cli/src/ui/components by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13598
- Update ink version to 6.4.6 by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13631
- chore/release: bump version to 0.19.0-nightly.20251122.42c2e1b21 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13637
- chore/release: bump version to 0.19.0-nightly.20251123.dadd606c0 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13675
- chore/release: bump version to 0.19.0-nightly.20251124.e177314a4 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13713
- fix(core): Fix context window overflow warning for PDF files by @kkitase in
  https://github.com/google-gemini/gemini-cli/pull/13548
- feat :rephrasing the extension logging messages to run the explore command
  when there are no extensions installed by @JayadityaGit in
  https://github.com/google-gemini/gemini-cli/pull/13740
- Improve code coverage for cli package by @megha1188 in
  https://github.com/google-gemini/gemini-cli/pull/13724
- Add session subtask in /stats command by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13750
- feat(core): Migrate chatCompressionService to model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/12863
- feat(hooks): Hook Telemetry Infrastructure by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9082
- fix: (some minor improvements to configs and getPackageJson return behaviour)
  by @grMLEqomlkkU5Eeinz4brIrOVCUCkJuN in
  https://github.com/google-gemini/gemini-cli/pull/12510
- feat(hooks): Hook Event Handling by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9097
- feat(hooks): Hook Agent Lifecycle Integration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9105
- feat(core): Land bool for alternate system prompt. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13764
- bug(core): Add default chat compression config. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13766
- feat(model-availability): introduce ModelPolicy and PolicyCatalog by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/13751
- feat(hooks): Hook System Orchestration by @Edilmo in
  https://github.com/google-gemini/gemini-cli/pull/9102
- feat(config): add isModelAvailabilityServiceEnabled setting by @adamfweidman
  in https://github.com/google-gemini/gemini-cli/pull/13777
- chore/release: bump version to 0.19.0-nightly.20251125.f6d97d448 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13782
- chore: remove console.error by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13779
- fix: Add $schema property to settings.schema.json by @sacrosanctic in
  https://github.com/google-gemini/gemini-cli/pull/12763
- fix(cli): allow non-GitHub SCP-styled URLs for extension installation by @m0ps
  in https://github.com/google-gemini/gemini-cli/pull/13800
- fix(resume): allow passing a prompt via stdin while resuming using --resume by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13520
- feat(sessions): add /resume slash command to open the session browser by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13621
- docs(sessions): add documentation for chat recording and session management by
  @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13667
- Fix TypeError: "URL.parse is not a function" for Node.js < v22 by @macarronesc
  in https://github.com/google-gemini/gemini-cli/pull/13698
- fallback to flash for TerminalQuota errors by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/13791
- Update Code Wiki README badge by @PatoBeltran in
  https://github.com/google-gemini/gemini-cli/pull/13768
- Add Databricks auth support and custom header option to gemini cli by
  @AarushiShah in https://github.com/google-gemini/gemini-cli/pull/11893
- Update dependency for modelcontextprotocol/sdk to 1.23.0 by @bbiggs in
  https://github.com/google-gemini/gemini-cli/pull/13827

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.18.0-preview.4...v0.19.0-preview.0

## Release v0.18.0 - v0.18.4

### Highlights

- **Experimental permission improvements**: We're experimenting with a new
  policy engine in Gemini CLI, letting users and administrators create
  fine-grained policies for tool calls. This setting is currently behind a flag.
  See our [policy engine documentation](../core/policy-engine.md) to learn how
  to use this feature.
- **Gemini 3 support rolled out for some users**: Some users can now enable
  Gemini 3 by using the `/settings` flag and toggling **Preview Features**. See
  our [Gemini 3 on Gemini CLI documentation](../get-started/gemini-3.md) to find
  out more about using Gemini 3.
- **Updated UI rollback:** We've temporarily rolled back a previous UI update,
  which enabled embedded scrolling and mouse support. This can be re-enabled by
  using the `/settings` command and setting **Use Alternate Screen Buffer** to
  `true`.
- **Display your model in your chat history**: You can now go use `/settings`
  and turn on **Show Model in Chat** to display the model in your chat history.
- **Uninstall multiple extensions**: You can uninstall multiple extensions with
  a single command: `gemini extensions uninstall`.

![Uninstalling Gemini extensions with a single command](https://i.imgur.com/pi7nEBI.png)

### What's changed

- Remove obsolete reference to "help wanted" label in CONTRIBUTING.md by
  @aswinashok44 in https://github.com/google-gemini/gemini-cli/pull/13291
- chore(release): v0.18.0-nightly.20251118.86828bb56 by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/13309
- Docs: Access clarification. by @jkcinouye in
  https://github.com/google-gemini/gemini-cli/pull/13304
- Fix links in Gemini 3 Pro documentation by @gmackall in
  https://github.com/google-gemini/gemini-cli/pull/13312
- Improve keyboard code parsing by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13307
- fix(core): Ensure `read_many_files` tool is available to zed. by @joshualitt
  in https://github.com/google-gemini/gemini-cli/pull/13338
- Support 3-parameter modifyOtherKeys sequences by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13342
- Improve pty resize error handling for Windows by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/13353
- fix(ui): Clear input prompt on Escape key press by @SandyTao520 in
  https://github.com/google-gemini/gemini-cli/pull/13335
- bug(ui) showLineNumbers had the wrong default value. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13356
- fix(cli): fix crash on startup in NO_COLOR mode (#13343) due to ungua… by
  @avilladsen in https://github.com/google-gemini/gemini-cli/pull/13352
- fix: allow MCP prompts with spaces in name by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/12910
- Refactor createTransport to duplicate less code by @davidmcwherter in
  https://github.com/google-gemini/gemini-cli/pull/13010
- Followup from #10719 by @bl-ue in
  https://github.com/google-gemini/gemini-cli/pull/13243
- Capturing github action workflow name if present and send it to clearcut by
  @MJjainam in https://github.com/google-gemini/gemini-cli/pull/13132
- feat(sessions): record interactive-only errors and warnings to chat recording
  JSON files by @bl-ue in https://github.com/google-gemini/gemini-cli/pull/13300
- fix(zed-integration): Correctly handle cancellation errors by @benbrandt in
  https://github.com/google-gemini/gemini-cli/pull/13399
- docs: Add Code Wiki link to README by @holtskinner in
  https://github.com/google-gemini/gemini-cli/pull/13289
- Restore keyboard mode when exiting the editor by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13350
- feat(core, cli): Bump genai version to 1.30.0 by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13435
- [cli-ui] Keep header ASCII art colored on non-gradient terminals (#13373) by
  @bniladridas in https://github.com/google-gemini/gemini-cli/pull/13374
- Fix Copyright line in LICENSE by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13449
- Fix typo in write_todos methodology instructions by @Smetalo in
  https://github.com/google-gemini/gemini-cli/pull/13411
- feat: update thinking mode support to exclude gemini-2.0 models and simplify
  logic. by @kevin-ramdass in
  https://github.com/google-gemini/gemini-cli/pull/13454
- remove unneeded log by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13456
- feat: add click-to-focus support for interactive shell by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/13341
- Add User email detail to about box by @ptone in
  https://github.com/google-gemini/gemini-cli/pull/13459
- feat(core): Wire up chat code path for model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/12850
- chore/release: bump version to 0.18.0-nightly.20251120.2231497b1 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13476
- feat(core): Fix bug with incorrect model overriding. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13477
- Use synchronous writes when detecting keyboard modes by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13478
- fix(cli): prevent race condition when restoring prompt after context overflow
  by @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/13473
- Revert "feat(core): Fix bug with incorrect model overriding." by @adamfweidman
  in https://github.com/google-gemini/gemini-cli/pull/13483
- Fix: Update system instruction when GEMINI.md memory is loaded or refreshed by
  @lifefloating in https://github.com/google-gemini/gemini-cli/pull/12136
- fix(zed-integration): Ensure that the zed integration is classified as
  interactive by @benbrandt in
  https://github.com/google-gemini/gemini-cli/pull/13394
- Copy commands as part of setup-github by @gsehgal in
  https://github.com/google-gemini/gemini-cli/pull/13464
- Update banner design by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13420
- Protect stdout and stderr so JavaScript code can't accidentally write to
  stdout corrupting ink rendering by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/13247
- Enable switching preview features on/off without restart by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/13515
- feat(core): Use thinking level for Gemini 3 by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/13445
- Change default compress threshold to 0.5 for api key users by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13517
- remove duplicated mouse code by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/13525
- feat(zed-integration): Use default model routing for Zed integration by
  @benbrandt in https://github.com/google-gemini/gemini-cli/pull/13398
- feat(core): Incorporate Gemini 3 into model config hierarchy. by @joshualitt
  in https://github.com/google-gemini/gemini-cli/pull/13447
- fix(patch): cherry-pick 5e218a5 to release/v0.18.0-preview.0-pr-13623 to patch
  version v0.18.0-preview.0 and create version 0.18.0-preview.1 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13626
- fix(patch): cherry-pick d351f07 to release/v0.18.0-preview.1-pr-12535 to patch
  version v0.18.0-preview.1 and create version 0.18.0-preview.2 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13813
- fix(patch): cherry-pick 3e50be1 to release/v0.18.0-preview.2-pr-13428 to patch
  version v0.18.0-preview.2 and create version 0.18.0-preview.3 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13821
- fix(patch): cherry-pick d8a3d08 to release/v0.18.0-preview.3-pr-13791 to patch
  version v0.18.0-preview.3 and create version 0.18.0-preview.4 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13826

  **Full Changelog**:
  https://github.com/google-gemini/gemini-cli/compare/v0.17.1...v0.18.0
