# Gemini CLI changelog

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
| Nightly         | [v0.20.0-nightly.20251202.29920b16d](#release-v0200-nightly2025120229920b16d-nightly) | Nightly release with the most recent changes.   |
| Preview         | [v0.19.0-preview.0](#release-v0190-preview0-preview)                                  | Experimental features ready for early feedback. |
| Latest          | [v0.18.4](#release-v0180---v0184-latest)                                              | Stable, recommended for general use.            |

## Release v0.20.0-nightly.20251202.29920b16d (Nightly)

### What's Changed

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

### New Contributors

- @pcoet made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13717
- @Transient-Onlooker made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13976
- @JuanCS-Dev made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13866
- @amsminn made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13714
- @marcocondrache made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13646
- @g-samroberts made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13628

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.20.0-nightly.20251201.2fe609cb6...v0.20.0-nightly.20251202.29920b16d

## Release v0.20.0-nightly.20251201.2fe609cb6

### What's Changed

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

### New Contributors

- @maryamariyan made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13497
- @korade-krushna made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/14182

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.20.0-nightly.20251127.5bed97064...v0.20.0-nightly.20251201.2fe609cb6

## Release v0.20.0-nightly.20251127.5bed97064

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

## Release v0.18.0 - v0.18.4 (Latest)

## Highlights

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

And a huge shout out to our new contributors:

- @aswinashok44 made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13291
- @gmackall made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13312
- @avilladsen made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13352
- @holtskinner made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13289
- @kevin-ramdass made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13454

## What's changed

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
