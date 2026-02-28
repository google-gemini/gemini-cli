# Preview release: v0.32.0-preview.0

Released: February 27, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Plan Mode Enhancements**: Significant updates to Plan Mode, including
  support for modifying plans in external editors, adaptive workflows based on
  task complexity, and new integration tests.
- **Agent and Core Engine Updates**: Enabled the generalist agent, introduced
  `Kind.Agent` for sub-agent classification, implemented task tracking
  foundation, and improved Agent-to-Agent (A2A) streaming and content
  extraction.
- **CLI & User Experience**: Introduced interactive shell autocompletion, added
  a new verbosity mode for cleaner error reporting, enabled parallel loading of
  extensions, and improved UI hints and shortcut handling.
- **Billing and Security**: Implemented G1 AI credits overage flow with enhanced
  billing telemetry, updated the authentication handshake to specification, and
  added support for a policy engine in extensions.
- **Stability and Bug Fixes**: Addressed numerous issues including 100% CPU
  consumption by orphaned processes, enhanced retry logic for Code Assist,
  reduced intrusive MCP errors, and merged duplicate imports across packages.

## What's Changed

- feat(plan): add integration tests for plan mode by @Adib234 in
  [#20214](https://github.com/google-gemini/gemini-cli/pull/20214)
- fix(acp): update auth handshake to spec by @skeshive in
  [#19725](https://github.com/google-gemini/gemini-cli/pull/19725)
- feat(core): implement robust A2A streaming reassembly and fix task continuity
  by @adamfweidman in
  [#20091](https://github.com/google-gemini/gemini-cli/pull/20091)
- feat(cli): load extensions in parallel by @scidomino in
  [#20229](https://github.com/google-gemini/gemini-cli/pull/20229)
- Plumb the maxAttempts setting through Config args by @kevinjwang1 in
  [#20239](https://github.com/google-gemini/gemini-cli/pull/20239)
- fix(cli): skip 404 errors in setup-github file downloads by @h30s in
  [#20287](https://github.com/google-gemini/gemini-cli/pull/20287)
- fix(cli): expose model.name setting in settings dialog for persistence by
  @achaljhawar in
  [#19605](https://github.com/google-gemini/gemini-cli/pull/19605)
- docs: remove legacy cmd examples in favor of powershell by @scidomino in
  [#20323](https://github.com/google-gemini/gemini-cli/pull/20323)
- feat(core): Enable model steering in workspace. by @joshualitt in
  [#20343](https://github.com/google-gemini/gemini-cli/pull/20343)
- fix: remove trailing comma in issue triage workflow settings json by @Nixxx19
  in [#20265](https://github.com/google-gemini/gemini-cli/pull/20265)
- feat(core): implement task tracker foundation and service by @anj-s in
  [#19464](https://github.com/google-gemini/gemini-cli/pull/19464)
- test: support tests that include color information by @jacob314 in
  [#20220](https://github.com/google-gemini/gemini-cli/pull/20220)
- feat(core): introduce Kind.Agent for sub-agent classification by @abhipatel12
  in [#20369](https://github.com/google-gemini/gemini-cli/pull/20369)
- Changelog for v0.30.0 by @gemini-cli-robot in
  [#20252](https://github.com/google-gemini/gemini-cli/pull/20252)
- Update changelog workflow to reject nightly builds by @g-samroberts in
  [#20248](https://github.com/google-gemini/gemini-cli/pull/20248)
- Changelog for v0.31.0-preview.0 by @gemini-cli-robot in
  [#20249](https://github.com/google-gemini/gemini-cli/pull/20249)
- feat(cli): hide workspace policy update dialog and auto-accept by default by
  @Abhijit-2592 in
  [#20351](https://github.com/google-gemini/gemini-cli/pull/20351)
- feat(core): rename grep_search include parameter to include_pattern by
  @SandyTao520 in
  [#20328](https://github.com/google-gemini/gemini-cli/pull/20328)
- feat(plan): support opening and modifying plan in external editor by @Adib234
  in [#20348](https://github.com/google-gemini/gemini-cli/pull/20348)
- feat(cli): implement interactive shell autocompletion by @mrpmohiburrahman in
  [#20082](https://github.com/google-gemini/gemini-cli/pull/20082)
- fix(core): allow /memory add to work in plan mode by @Jefftree in
  [#20353](https://github.com/google-gemini/gemini-cli/pull/20353)
- feat(core): add HTTP 499 to retryable errors and map to RetryableQuotaError by
  @bdmorgan in [#20432](https://github.com/google-gemini/gemini-cli/pull/20432)
- feat(core): Enable generalist agent by @joshualitt in
  [#19665](https://github.com/google-gemini/gemini-cli/pull/19665)
- Updated tests in TableRenderer.test.tsx to use SVG snapshots by @devr0306 in
  [#20450](https://github.com/google-gemini/gemini-cli/pull/20450)
- Refactor Github Action per b/485167538 by @google-admin in
  [#19443](https://github.com/google-gemini/gemini-cli/pull/19443)
- fix(github): resolve actionlint and yamllint regressions from #19443 by @jerop
  in [#20467](https://github.com/google-gemini/gemini-cli/pull/20467)
- fix: action var usage by @galz10 in
  [#20492](https://github.com/google-gemini/gemini-cli/pull/20492)
- feat(core): improve A2A content extraction by @adamfweidman in
  [#20487](https://github.com/google-gemini/gemini-cli/pull/20487)
- fix(cli): support quota error fallbacks for all authentication types by
  @sehoon38 in [#20475](https://github.com/google-gemini/gemini-cli/pull/20475)
- fix(core): flush transcript for pure tool-call responses to ensure BeforeTool
  hooks see complete state by @krishdef7 in
  [#20419](https://github.com/google-gemini/gemini-cli/pull/20419)
- feat(plan): adapt planning workflow based on complexity of task by @jerop in
  [#20465](https://github.com/google-gemini/gemini-cli/pull/20465)
- fix: prevent orphaned processes from consuming 100% CPU when terminal closes
  by @yuvrajangadsingh in
  [#16965](https://github.com/google-gemini/gemini-cli/pull/16965)
- feat(core): increase fetch timeout and fix [object Object] error
  stringification by @bdmorgan in
  [#20441](https://github.com/google-gemini/gemini-cli/pull/20441)
- [Gemma x Gemini CLI] Add an Experimental Gemma Router that uses a LiteRT-LM
  shim into the Composite Model Classifier Strategy by @sidwan02 in
  [#17231](https://github.com/google-gemini/gemini-cli/pull/17231)
- docs(plan): update documentation regarding supporting editing of plan files
  during plan approval by @Adib234 in
  [#20452](https://github.com/google-gemini/gemini-cli/pull/20452)
- test(cli): fix flaky ToolResultDisplay overflow test by @jwhelangoog in
  [#20518](https://github.com/google-gemini/gemini-cli/pull/20518)
- ui(cli): reduce length of Ctrl+O hint by @jwhelangoog in
  [#20490](https://github.com/google-gemini/gemini-cli/pull/20490)
- fix(ui): correct styled table width calculations by @devr0306 in
  [#20042](https://github.com/google-gemini/gemini-cli/pull/20042)
- Avoid overaggressive unescaping by @scidomino in
  [#20520](https://github.com/google-gemini/gemini-cli/pull/20520)
- feat(telemetry) Instrument traces with more attributes and make them available
  to OTEL users by @heaventourist in
  [#20237](https://github.com/google-gemini/gemini-cli/pull/20237)
- Add support for policy engine in extensions by @chrstnb in
  [#20049](https://github.com/google-gemini/gemini-cli/pull/20049)
- Docs: Update to Terms of Service & FAQ by @jkcinouye in
  [#20488](https://github.com/google-gemini/gemini-cli/pull/20488)
- Fix bottom border rendering for search and add a regression test. by @jacob314
  in [#20517](https://github.com/google-gemini/gemini-cli/pull/20517)
- fix(core): apply retry logic to CodeAssistServer for all users by @bdmorgan in
  [#20507](https://github.com/google-gemini/gemini-cli/pull/20507)
- Fix extension MCP server env var loading by @chrstnb in
  [#20374](https://github.com/google-gemini/gemini-cli/pull/20374)
- feat(ui): add 'ctrl+o' hint to truncated content message by @jerop in
  [#20529](https://github.com/google-gemini/gemini-cli/pull/20529)
- Fix flicker showing message to press ctrl-O again to collapse. by @jacob314 in
  [#20414](https://github.com/google-gemini/gemini-cli/pull/20414)
- fix(cli): hide shortcuts hint while model is thinking or the user has typed a
  prompt + add debounce to avoid flicker by @jacob314 in
  [#19389](https://github.com/google-gemini/gemini-cli/pull/19389)
- feat(plan): update planning workflow to encourage multi-select with
  descriptions of options by @Adib234 in
  [#20491](https://github.com/google-gemini/gemini-cli/pull/20491)
- refactor(core,cli): useAlternateBuffer read from config by @psinha40898 in
  [#20346](https://github.com/google-gemini/gemini-cli/pull/20346)
- fix(cli): ensure dialogs stay scrolled to bottom in alternate buffer mode by
  @jacob314 in [#20527](https://github.com/google-gemini/gemini-cli/pull/20527)
- fix(core): revert auto-save of policies to user space by @Abhijit-2592 in
  [#20531](https://github.com/google-gemini/gemini-cli/pull/20531)
- Demote unreliable test. by @gundermanc in
  [#20571](https://github.com/google-gemini/gemini-cli/pull/20571)
- fix(core): handle optional response fields from code assist API by @sehoon38
  in [#20345](https://github.com/google-gemini/gemini-cli/pull/20345)
- fix(cli): keep thought summary when loading phrases are off by @LyalinDotCom
  in [#20497](https://github.com/google-gemini/gemini-cli/pull/20497)
- feat(cli): add temporary flag to disable workspace policies by @Abhijit-2592
  in [#20523](https://github.com/google-gemini/gemini-cli/pull/20523)
- Disable expensive and scheduled workflows on personal forks by @dewitt in
  [#20449](https://github.com/google-gemini/gemini-cli/pull/20449)
- Moved markdown parsing logic to a separate util file by @devr0306 in
  [#20526](https://github.com/google-gemini/gemini-cli/pull/20526)
- fix(plan): prevent agent from using ask_user for shell command confirmation by
  @Adib234 in [#20504](https://github.com/google-gemini/gemini-cli/pull/20504)
- fix(core): disable retries for code assist streaming requests by @sehoon38 in
  [#20561](https://github.com/google-gemini/gemini-cli/pull/20561)
- feat(billing): implement G1 AI credits overage flow with billing telemetry by
  @gsquared94 in
  [#18590](https://github.com/google-gemini/gemini-cli/pull/18590)
- feat: better error messages by @gsquared94 in
  [#20577](https://github.com/google-gemini/gemini-cli/pull/20577)
- fix(ui): persist expansion in AskUser dialog when navigating options by @jerop
  in [#20559](https://github.com/google-gemini/gemini-cli/pull/20559)
- fix(cli): prevent sub-agent tool calls from leaking into UI by @abhipatel12 in
  [#20580](https://github.com/google-gemini/gemini-cli/pull/20580)
- fix(cli): Shell autocomplete polish by @jacob314 in
  [#20411](https://github.com/google-gemini/gemini-cli/pull/20411)
- Changelog for v0.31.0-preview.1 by @gemini-cli-robot in
  [#20590](https://github.com/google-gemini/gemini-cli/pull/20590)
- Add slash command for promoting behavioral evals to CI blocking by @gundermanc
  in [#20575](https://github.com/google-gemini/gemini-cli/pull/20575)
- Changelog for v0.30.1 by @gemini-cli-robot in
  [#20589](https://github.com/google-gemini/gemini-cli/pull/20589)
- Add low/full CLI error verbosity mode for cleaner UI by @LyalinDotCom in
  [#20399](https://github.com/google-gemini/gemini-cli/pull/20399)
- Disable Gemini PR reviews on draft PRs. by @gundermanc in
  [#20362](https://github.com/google-gemini/gemini-cli/pull/20362)
- Docs: FAQ update by @jkcinouye in
  [#20585](https://github.com/google-gemini/gemini-cli/pull/20585)
- fix(core): reduce intrusive MCP errors and deduplicate diagnostics by
  @spencer426 in
  [#20232](https://github.com/google-gemini/gemini-cli/pull/20232)
- docs: fix spelling typos in installation guide by @campox747 in
  [#20579](https://github.com/google-gemini/gemini-cli/pull/20579)
- Promote stable tests to CI blocking. by @gundermanc in
  [#20581](https://github.com/google-gemini/gemini-cli/pull/20581)
- feat(core): enable contiguous parallel admission for Kind.Agent tools by
  @abhipatel12 in
  [#20583](https://github.com/google-gemini/gemini-cli/pull/20583)
- Enforce import/no-duplicates as error by @Nixxx19 in
  [#19797](https://github.com/google-gemini/gemini-cli/pull/19797)
- fix: merge duplicate imports in sdk and test-utils packages (1/4) by @Nixxx19
  in [#19777](https://github.com/google-gemini/gemini-cli/pull/19777)
- fix: merge duplicate imports in a2a-server package (2/4) by @Nixxx19 in
  [#19781](https://github.com/google-gemini/gemini-cli/pull/19781)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.31.0-preview.3...v0.32.0-preview.0
