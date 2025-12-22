# Latest stable release: v0.21.0 - v0.21.1

Released: December 16, 2025

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **⚡️⚡️⚡️ Gemini 3 Flash + Gemini CLI:** If you are a paid user, you can now
  enable Gemini 3 Pro and Gemini 3 Flash. Go to `/settings` and set **Preview
  Features** to `true` to enable Gemini 3. For more information:
  [Gemini 3 Flash is now available in Gemini CLI](https://developers.googleblog.com/gemini-3-flash-is-now-available-in-gemini-cli/).

## What's Changed

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
