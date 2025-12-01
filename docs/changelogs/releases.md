# Release history

Gemini CLI has three major release channels: nightly, preview, and stable. For
most users, we recommend the stable release.

On this page, you can find information regarding the current releases and
highlights from each release.

For the full changelog, refer to
[Releases - google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli/releases)
on GitHub.

## Current Releases

| Release channel | Release                                                                               | Notes                                           |
| :-------------- | :------------------------------------------------------------------------------------ | :---------------------------------------------- |
| Nightly         | [v0.19.0-nightly.20251126.03845198c](#release-v0200-nightly202511275bed97064-nightly) | Nightly release with the most recent changes.   |
| Preview         | [v0.19.0-preview.0](#release-v0190-preview0-preview)                                  | Experimental features ready for early feedback. |
| Latest          | [v0.18.0](#release-v0184-latest)                                                      | Stable, recommended for general use.            |

## Release v0.20.0-nightly.20251127.5bed97064 (Nightly)

### What's Changed

- Add Databricks auth support and custom header option to gemini cli by
  @AarushiShah in https://github.com/google-gemini/gemini-cli/pull/11893
- Update dependency for modelcontextprotocol/sdk to 1.23.0 by @bbiggs in
  https://github.com/google-gemini/gemini-cli/pull/13827
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

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.19.0-nightly.20251126.03845198c...v0.20.0-nightly.20251127.5bed97064

## Release v0.19.0-preview.0 (Preview)

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

## Release v0.19.0-nightly.20251126.03845198c

### What's Changed

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

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.19.0-nightly.20251125.f6d97d448...v0.19.0-nightly.20251126.03845198c

## Release v0.18.4 (Latest)

## What's Changed

- fix(patch): cherry-pick 030a5ac to release/v0.18.3-pr-13565 [CONFLICTS] by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/13869

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.18.3...v0.18.4
