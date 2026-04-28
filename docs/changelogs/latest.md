# Latest stable release: v0.39.0

Released: April 23, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Skill Extractor & Memory Inbox:** Introduced the `/memory` command to review
  and patch skills extracted during agent sessions, streamlining the continuous
  learning workflow.
- **Enhanced Plan Mode Security:** Increased transparency in Plan Mode by
  requiring user confirmation for skill activation and allowing users to view
  the full content of generated plans.
- **Advanced Display Protocol:** Implemented a tool-controlled display protocol,
  enabling agents to provide richer, more structured visual feedback during
  execution.
- **Core Architecture Refactor:** Introduced a decoupled `ContextManager` and
  `Sidecar` architecture to improve state management and session resilience.
- **Streamlined Agent Feedback:** Restored the display of model thoughts and raw
  text in responses, ensuring full visibility into the agent's reasoning
  process.

## What's Changed

- refactor(plan): simplify policy priorities and consolidate read-only rules by
  @ruomengz in [#24849](https://github.com/google-gemini/gemini-cli/pull/24849)
- feat(test-utils): add memory usage integration test harness by @sripasg in
  [#24876](https://github.com/google-gemini/gemini-cli/pull/24876)
- feat(memory): add /memory inbox command for reviewing extracted skills by
  @SandyTao520 in
  [#24544](https://github.com/google-gemini/gemini-cli/pull/24544)
- chore(release): bump version to 0.39.0-nightly.20260408.e77b22e63 by
  @gemini-cli-robot in
  [#24939](https://github.com/google-gemini/gemini-cli/pull/24939)
- fix(core): ensure robust sandbox cleanup in all process execution paths by
  @ehedlund in [#24763](https://github.com/google-gemini/gemini-cli/pull/24763)
- chore: update ink version to 6.6.8 by @jacob314 in
  [#24934](https://github.com/google-gemini/gemini-cli/pull/24934)
- Changelog for v0.38.0-preview.0 by @gemini-cli-robot in
  [#24938](https://github.com/google-gemini/gemini-cli/pull/24938)
- chore: ignore conductor directory by @JayadityaGit in
  [#22128](https://github.com/google-gemini/gemini-cli/pull/22128)
- Changelog for v0.37.0 by @gemini-cli-robot in
  [#24940](https://github.com/google-gemini/gemini-cli/pull/24940)
- feat(plan): require user confirmation for activate_skill in Plan Mode by
  @ruomengz in [#24946](https://github.com/google-gemini/gemini-cli/pull/24946)
- feat(test-utils): add CPU performance integration test harness by @sripasg in
  [#24951](https://github.com/google-gemini/gemini-cli/pull/24951)
- fix(cli-ui): enable Ctrl+Backspace for word deletion in Windows Terminal by
  @dogukanozen in
  [#21447](https://github.com/google-gemini/gemini-cli/pull/21447)
- test(sdk): add unit tests for GeminiCliSession by @AdamyaSingh7 in
  [#21897](https://github.com/google-gemini/gemini-cli/pull/21897)
- fix(core): resolve windows symlink bypass and stabilize sandbox integration
  tests by @ehedlund in
  [#24834](https://github.com/google-gemini/gemini-cli/pull/24834)
- fix(cli): restore file path display in edit and write tool confirmations by
  @jwhelangoog in
  [#24974](https://github.com/google-gemini/gemini-cli/pull/24974)
- feat(core): refine shell tool description display logic by @jwhelangoog in
  [#24903](https://github.com/google-gemini/gemini-cli/pull/24903)
- fix(core): dynamic session ID injection to resolve resume bugs by @scidomino
  in [#24972](https://github.com/google-gemini/gemini-cli/pull/24972)
- Update ink version to 6.6.9 by @jacob314 in
  [#24980](https://github.com/google-gemini/gemini-cli/pull/24980)
- Generalize evals infra to support more types of evals, organization and
  queuing of named suites by @gundermanc in
  [#24941](https://github.com/google-gemini/gemini-cli/pull/24941)
- fix(cli): optimize startup with lightweight parent process by @sehoon38 in
  [#24667](https://github.com/google-gemini/gemini-cli/pull/24667)
- refactor(sandbox): use centralized sandbox paths in macOS Seatbelt
  implementation by @ehedlund in
  [#24984](https://github.com/google-gemini/gemini-cli/pull/24984)
- feat(cli): refine tool output formatting for compact mode by @jwhelangoog in
  [#24677](https://github.com/google-gemini/gemini-cli/pull/24677)
- fix(sdk): skip broken sendStream tests to unblock nightly by @SandyTao520 in
  [#25000](https://github.com/google-gemini/gemini-cli/pull/25000)
- refactor(core): use centralized path resolution for Linux sandbox by @ehedlund
  in [#24985](https://github.com/google-gemini/gemini-cli/pull/24985)
- Support ctrl+shift+g by @jacob314 in
  [#25035](https://github.com/google-gemini/gemini-cli/pull/25035)
- feat(core): refactor subagent tool to unified invoke_subagent tool by
  @abhipatel12 in
  [#24489](https://github.com/google-gemini/gemini-cli/pull/24489)
- fix(core): add explicit git identity env vars to prevent sandbox checkpointing
  error by @mrpmohiburrahman in
  [#19775](https://github.com/google-gemini/gemini-cli/pull/19775)
- fix: respect hideContextPercentage when FooterConfigDialog is closed without
  changes by @chernistry in
  [#24773](https://github.com/google-gemini/gemini-cli/pull/24773)
- fix(cli): suppress unhandled AbortError logs during request cancellation by
  @euxaristia in
  [#22621](https://github.com/google-gemini/gemini-cli/pull/22621)
- Automated documentation audit by @g-samroberts in
  [#24567](https://github.com/google-gemini/gemini-cli/pull/24567)
- feat(cli): implement useAgentStream hook by @mbleigh in
  [#24292](https://github.com/google-gemini/gemini-cli/pull/24292)
- refactor(plan) Clean default plan toml by @ruomengz in
  [#25037](https://github.com/google-gemini/gemini-cli/pull/25037)
- refactor(core): remove legacy subagent wrapping tools by @abhipatel12 in
  [#25053](https://github.com/google-gemini/gemini-cli/pull/25053)
- fix(core): honor retryDelay in RetryInfo for 503 errors by @yunaseoul in
  [#25057](https://github.com/google-gemini/gemini-cli/pull/25057)
- fix(core): remediate subagent memory leaks using AbortSignal in MessageBus by
  @abhipatel12 in
  [#25048](https://github.com/google-gemini/gemini-cli/pull/25048)
- feat(cli): wire up useAgentStream in AppContainer by @mbleigh in
  [#24297](https://github.com/google-gemini/gemini-cli/pull/24297)
- feat(core): migrate chat recording to JSONL streaming by @spencer426 in
  [#23749](https://github.com/google-gemini/gemini-cli/pull/23749)
- fix(core): clear 5-minute timeouts in oauth flow to prevent memory leaks by
  @spencer426 in
  [#24968](https://github.com/google-gemini/gemini-cli/pull/24968)
- fix(sandbox): centralize async git worktree resolution and enforce read-only
  security by @ehedlund in
  [#25040](https://github.com/google-gemini/gemini-cli/pull/25040)
- feat(test): add high-volume shell test and refine perf harness by @sripasg in
  [#24983](https://github.com/google-gemini/gemini-cli/pull/24983)
- fix(core): silently handle EPERM when listing dir structure by @scidomino in
  [#25066](https://github.com/google-gemini/gemini-cli/pull/25066)
- Changelog for v0.37.1 by @gemini-cli-robot in
  [#25055](https://github.com/google-gemini/gemini-cli/pull/25055)
- fix: decode Uint8Array and multi-byte UTF-8 in API error messages by
  @kimjune01 in [#23341](https://github.com/google-gemini/gemini-cli/pull/23341)
- Automated documentation audit results by @g-samroberts in
  [#22755](https://github.com/google-gemini/gemini-cli/pull/22755)
- debugging(ui): add optional debugRainbow setting by @jacob314 in
  [#25088](https://github.com/google-gemini/gemini-cli/pull/25088)
- fix: resolve lifecycle memory leaks by cleaning up listeners and root closures
  by @spencer426 in
  [#25049](https://github.com/google-gemini/gemini-cli/pull/25049)
- docs(cli): updates f12 description to be more precise by @JayadityaGit in
  [#15816](https://github.com/google-gemini/gemini-cli/pull/15816)
- fix(cli): mark /settings as unsafe to run concurrently by @jacob314 in
  [#25061](https://github.com/google-gemini/gemini-cli/pull/25061)
- fix(core): remove buffer slice to prevent OOM on large output streams by
  @spencer426 in
  [#25094](https://github.com/google-gemini/gemini-cli/pull/25094)
- feat(core): persist subagent agentId in tool call records by @abhipatel12 in
  [#25092](https://github.com/google-gemini/gemini-cli/pull/25092)
- chore(core): increase codebase investigator turn limits to 50 by @abhipatel12
  in [#25125](https://github.com/google-gemini/gemini-cli/pull/25125)
- refactor(core): consolidate execute() arguments into ExecuteOptions by
  @mbleigh in [#25101](https://github.com/google-gemini/gemini-cli/pull/25101)
- feat(core): add Strategic Re-evaluation guidance to system prompt by
  @aishaneeshah in
  [#25062](https://github.com/google-gemini/gemini-cli/pull/25062)
- fix(core): preserve shell execution config fields on update by
  @jasonmatthewsuhari in
  [#25113](https://github.com/google-gemini/gemini-cli/pull/25113)
- docs: add vi shortcuts and clarify MCP sandbox setup by @chrisjcthomas in
  [#21679](https://github.com/google-gemini/gemini-cli/pull/21679)
- fix(cli): pass session id to interactive shell executions by
  @jasonmatthewsuhari in
  [#25114](https://github.com/google-gemini/gemini-cli/pull/25114)
- fix(cli): resolve text sanitization data loss due to C1 control characters by
  @euxaristia in
  [#22624](https://github.com/google-gemini/gemini-cli/pull/22624)
- feat(core): add large memory regression test by @cynthialong0-0 in
  [#25059](https://github.com/google-gemini/gemini-cli/pull/25059)
- fix(core): resolve PTY exhaustion and orphan MCP subprocess leaks by
  @spencer426 in
  [#25079](https://github.com/google-gemini/gemini-cli/pull/25079)
- chore(deps): update vulnerable dependencies via npm audit fix by @scidomino in
  [#25140](https://github.com/google-gemini/gemini-cli/pull/25140)
- perf(sandbox): optimize Windows sandbox initialization via native ACL
  application by @ehedlund in
  [#25077](https://github.com/google-gemini/gemini-cli/pull/25077)
- chore: switch from keytar to @github/keytar by @cocosheng-g in
  [#25143](https://github.com/google-gemini/gemini-cli/pull/25143)
- fix: improve audio MIME normalization and validation in file reads by
  @junaiddshaukat in
  [#21636](https://github.com/google-gemini/gemini-cli/pull/21636)
- docs: Update docs-audit to include changes in PR body by @g-samroberts in
  [#25153](https://github.com/google-gemini/gemini-cli/pull/25153)
- docs: correct documentation for enforced authentication type by @cocosheng-g
  in [#25142](https://github.com/google-gemini/gemini-cli/pull/25142)
- fix(cli): exclude update_topic from confirmation queue count by @Abhijit-2592
  in [#24945](https://github.com/google-gemini/gemini-cli/pull/24945)
- Memory fix for trace's streamWrapper. by @anthraxmilkshake in
  [#25089](https://github.com/google-gemini/gemini-cli/pull/25089)
- fix(core): fix quota footer for non-auto models and improve display by
  @jackwotherspoon in
  [#25121](https://github.com/google-gemini/gemini-cli/pull/25121)
- docs(contributing): clarify self-assignment policy for issues by @jmr in
  [#23087](https://github.com/google-gemini/gemini-cli/pull/23087)
- feat(core): add skill patching support with /memory inbox integration by
  @SandyTao520 in
  [#25148](https://github.com/google-gemini/gemini-cli/pull/25148)
- Stop suppressing thoughts and text in model response by @gundermanc in
  [#25073](https://github.com/google-gemini/gemini-cli/pull/25073)
- fix(release): prefix git hash in nightly versions to prevent semver
  normalization by @SandyTao520 in
  [#25304](https://github.com/google-gemini/gemini-cli/pull/25304)
- feat(cli): extract QuotaContext and resolve infinite render loop by @Adib234
  in [#24959](https://github.com/google-gemini/gemini-cli/pull/24959)
- refactor(core): extract and centralize sandbox path utilities by @ehedlund in
  [#25305](https://github.com/google-gemini/gemini-cli/pull/25305)
- feat(ui): added enhancements to scroll momentum by @devr0306 in
  [#24447](https://github.com/google-gemini/gemini-cli/pull/24447)
- fix(core): replace custom binary detection with isbinaryfile to correctly
  handle UTF-8 (U+FFFD) by @Anjaligarhwal in
  [#25297](https://github.com/google-gemini/gemini-cli/pull/25297)
- feat(agent): implement tool-controlled display protocol (Steps 2-3) by
  @mbleigh in [#25134](https://github.com/google-gemini/gemini-cli/pull/25134)
- Stop showing scrollbar unless we are in terminalBuffer mode by @jacob314 in
  [#25320](https://github.com/google-gemini/gemini-cli/pull/25320)
- feat: support auth block in MCP servers config in agents by @TanmayVartak in
  [#24770](https://github.com/google-gemini/gemini-cli/pull/24770)
- fix(core): expose GEMINI_PLANS_DIR to hook environment by @Adib234 in
  [#25296](https://github.com/google-gemini/gemini-cli/pull/25296)
- feat(core): implement silent fallback for Plan Mode model routing by @jerop in
  [#25317](https://github.com/google-gemini/gemini-cli/pull/25317)
- fix: correct redirect count increment in fetchJson by @KevinZhao in
  [#24896](https://github.com/google-gemini/gemini-cli/pull/24896)
- fix(core): prevent secondary crash in ModelRouterService finally block by
  @gundermanc in
  [#25333](https://github.com/google-gemini/gemini-cli/pull/25333)
- feat(core): introduce decoupled ContextManager and Sidecar architecture by
  @joshualitt in
  [#24752](https://github.com/google-gemini/gemini-cli/pull/24752)
- docs(core): update generalist agent documentation by @abhipatel12 in
  [#25325](https://github.com/google-gemini/gemini-cli/pull/25325)
- chore(mcp): check MCP error code over brittle string match by @jackwotherspoon
  in [#25381](https://github.com/google-gemini/gemini-cli/pull/25381)
- feat(plan): update plan mode prompt to allow showing plan content by @ruomengz
  in [#25058](https://github.com/google-gemini/gemini-cli/pull/25058)
- test(core): improve sandbox integration test coverage and fix OS-specific
  failures by @ehedlund in
  [#25307](https://github.com/google-gemini/gemini-cli/pull/25307)
- fix(core): use debug level for keychain fallback logging by @ehedlund in
  [#25398](https://github.com/google-gemini/gemini-cli/pull/25398)
- feat(test): add a performance test in asian language by @cynthialong0-0 in
  [#25392](https://github.com/google-gemini/gemini-cli/pull/25392)
- feat(cli): enable mouse clicking for cursor positioning in AskUser multi-line
  answers by @Adib234 in
  [#24630](https://github.com/google-gemini/gemini-cli/pull/24630)
- fix(core): detect kmscon terminal as supporting true color by @claygeo in
  [#25282](https://github.com/google-gemini/gemini-cli/pull/25282)
- ci: add agent session drift check workflow by @adamfweidman in
  [#25389](https://github.com/google-gemini/gemini-cli/pull/25389)
- use macos-latest-large runner where applicable. by @scidomino in
  [#25413](https://github.com/google-gemini/gemini-cli/pull/25413)
- Changelog for v0.37.2 by @gemini-cli-robot in
  [#25336](https://github.com/google-gemini/gemini-cli/pull/25336)
- fix(patch): cherry-pick a4e98c0 to release/v0.39.0-preview.0-pr-25138 to patch
  version v0.39.0-preview.0 and create version 0.39.0-preview.1 by
  @gemini-cli-robot in
  [#25766](https://github.com/google-gemini/gemini-cli/pull/25766)
- fix(patch): cherry-pick d6f88f8 to release/v0.39.0-preview.1-pr-25670 to patch
  version v0.39.0-preview.1 and create version 0.39.0-preview.2 by
  @gemini-cli-robot in
  [#25776](https://github.com/google-gemini/gemini-cli/pull/25776)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.38.2...v0.39.0
