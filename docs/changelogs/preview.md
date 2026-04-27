# Preview release: v0.40.0-preview.2

Released: April 23, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Ripgrep Binary Bundling:** Ripgrep binaries are now bundled into the Single
  Executable Application (SEA), enabling grep functionality in offline
  environments.
- **MCP Resource Tools:** New core tools added to list and read MCP (Model
  Context Protocol) resources, expanding the agent's ability to interact with
  MCP servers.
- **Local Model Setup:** Introduced a streamlined `gemini gemma` command for
  easier local model setup and integration.
- **Prompt-Driven Memory Management:** Refactored memory management into a
  prompt-driven, four-tier system and integrated `skill-creator` for robust
  skill extraction.
- **Enhanced UI and Accessibility:** Added support for OSC 777 terminal
  notifications and GitHub colorblind themes for better user feedback and
  accessibility.

## What's Changed

- chore(release): bump version to 0.40.0-nightly.20260414.g5b1f7375a by
  @gemini-cli-robot in
  [#25420](https://github.com/google-gemini/gemini-cli/pull/25420)
- Fix(core): retry additional OpenSSL 3.x SSL errors during streaming (#16075)
  by @rcleveng in
  [#25187](https://github.com/google-gemini/gemini-cli/pull/25187)
- fix(core): prevent YOLO mode from being downgraded by @galz10 in
  [#25341](https://github.com/google-gemini/gemini-cli/pull/25341)
- feat: bundle ripgrep binaries into SEA for offline support by @scidomino in
  [#25342](https://github.com/google-gemini/gemini-cli/pull/25342)
- Changelog for v0.39.0-preview.0 by @gemini-cli-robot in
  [#25417](https://github.com/google-gemini/gemini-cli/pull/25417)
- feat(test): add large conversation scenario for performance test by
  @cynthialong0-0 in
  [#25331](https://github.com/google-gemini/gemini-cli/pull/25331)
- improve(core): require recurrence evidence before extracting skills by
  @SandyTao520 in
  [#25147](https://github.com/google-gemini/gemini-cli/pull/25147)
- test(evals): add subagent delegation evaluation tests by @anj-s in
  [#24619](https://github.com/google-gemini/gemini-cli/pull/24619)
- feat: add github colorblind themes by @Z1xus in
  [#15504](https://github.com/google-gemini/gemini-cli/pull/15504)
- fix(core): honor GOOGLE_GEMINI_BASE_URL and GOOGLE_VERTEX_BASE_URL by
  @chrisjcthomas in
  [#25357](https://github.com/google-gemini/gemini-cli/pull/25357)
- fix(cli): clean up slash command IDE listeners by @jasonmatthewsuhari in
  [#24397](https://github.com/google-gemini/gemini-cli/pull/24397)
- Changelog for v0.38.0 by @gemini-cli-robot in
  [#25470](https://github.com/google-gemini/gemini-cli/pull/25470)
- fix(evals): update eval tests for invoke_agent telemetry and project-scoped
  memory by @SandyTao520 in
  [#25502](https://github.com/google-gemini/gemini-cli/pull/25502)
- Changelog for v0.38.1 by @gemini-cli-robot in
  [#25476](https://github.com/google-gemini/gemini-cli/pull/25476)
- feat(core): integrate skill-creator into skill extraction agent by
  @SandyTao520 in
  [#25421](https://github.com/google-gemini/gemini-cli/pull/25421)
- feat(cli): provide default post-submit prompt for skill command by @ruomengz
  in [#25327](https://github.com/google-gemini/gemini-cli/pull/25327)
- feat(core): add tools to list and read MCP resources by @ruomengz in
  [#25395](https://github.com/google-gemini/gemini-cli/pull/25395)
- fix(evals): add typecheck coverage for evals, integration-tests, and
  memory-tests by @SandyTao520 in
  [#25480](https://github.com/google-gemini/gemini-cli/pull/25480)
- Use OSC 777 for terminal notifications by @jackyliuxx in
  [#25300](https://github.com/google-gemini/gemini-cli/pull/25300)
- fix(extensions): fix bundling for examples by @abhipatel12 in
  [#25542](https://github.com/google-gemini/gemini-cli/pull/25542)
- fix(cli): reset plan session state on /clear by @jasonmatthewsuhari in
  [#25515](https://github.com/google-gemini/gemini-cli/pull/25515)
- feat(core): add .mdx support to get-internal-docs tool by @g-samroberts in
  [#25090](https://github.com/google-gemini/gemini-cli/pull/25090)
- docs(policy): mention that workspace policies are broken by @6112 in
  [#24367](https://github.com/google-gemini/gemini-cli/pull/24367)
- fix(core): allow explicit write permissions to override governance file
  protections in sandboxes by @galz10 in
  [#25338](https://github.com/google-gemini/gemini-cli/pull/25338)
- feat(sandbox): resolve custom seatbelt profiles from $HOME/.gemini first by
  @mvanhorn in [#25427](https://github.com/google-gemini/gemini-cli/pull/25427)
- Reduce blank lines. by @gundermanc in
  [#25563](https://github.com/google-gemini/gemini-cli/pull/25563)
- fix(ui): revert preview theme on dialog unmount by @JayadityaGit in
  [#22542](https://github.com/google-gemini/gemini-cli/pull/22542)
- fix(core): fix ShellExecutionConfig spread and add ProjectRegistry save
  backoff by @mahimashanware in
  [#25382](https://github.com/google-gemini/gemini-cli/pull/25382)
- feat(core): Disable topic updates for subagents by @gundermanc in
  [#25567](https://github.com/google-gemini/gemini-cli/pull/25567)
- feat(core): enable topic update narration by default and promote to general by
  @gundermanc in
  [#25586](https://github.com/google-gemini/gemini-cli/pull/25586)
- docs: migrate installation and authentication to mdx with tabbed layouts by
  @g-samroberts in
  [#25155](https://github.com/google-gemini/gemini-cli/pull/25155)
- feat(config): split memoryManager flag into autoMemory by @SandyTao520 in
  [#25601](https://github.com/google-gemini/gemini-cli/pull/25601)
- fix(core): allow Cloud Shell users to use PRO_MODEL_NO_ACCESS experiment by
  @sehoon38 in [#25702](https://github.com/google-gemini/gemini-cli/pull/25702)
- fix(cli): round slow render latency to avoid opentelemetry float warning by
  @scidomino in [#25709](https://github.com/google-gemini/gemini-cli/pull/25709)
- docs(tracker): introduce experimental task tracker feature by @anj-s in
  [#24556](https://github.com/google-gemini/gemini-cli/pull/24556)
- docs(cli): fix inconsistent system.md casing in system prompt docs by @Bodlux
  in [#25414](https://github.com/google-gemini/gemini-cli/pull/25414)
- feat(cli): add streamlined `gemini gemma` local model setup by @Samee24 in
  [#25498](https://github.com/google-gemini/gemini-cli/pull/25498)
- Changelog for v0.38.2 by @gemini-cli-robot in
  [#25593](https://github.com/google-gemini/gemini-cli/pull/25593)
- Fix: Disallow overriding IDE stdio via workspace .env (RCE) by @M0nd0R in
  [#25022](https://github.com/google-gemini/gemini-cli/pull/25022)
- feat(test): refactor the memory usage test to use metrics from CLI process
  instead of test runner by @cynthialong0-0 in
  [#25708](https://github.com/google-gemini/gemini-cli/pull/25708)
- feat(vertex): add settings for Vertex AI request routing by @gordonhwc in
  [#25513](https://github.com/google-gemini/gemini-cli/pull/25513)
- Fix/allow for session persistence by @ahsanfarooq210 in
  [#25176](https://github.com/google-gemini/gemini-cli/pull/25176)
- Allow dots on GEMINI_API_KEY by @DKbyo in
  [#25497](https://github.com/google-gemini/gemini-cli/pull/25497)
- feat(telemetry): add flag for enabling traces specifically by @spencer426 in
  [#25343](https://github.com/google-gemini/gemini-cli/pull/25343)
- fix(core): resolve nested plan directory duplication and relative path
  policies by @mahimashanware in
  [#25138](https://github.com/google-gemini/gemini-cli/pull/25138)
- feat: detect new files in @ recommendations with watcher based updates by
  @prassamin in [#25256](https://github.com/google-gemini/gemini-cli/pull/25256)
- fix(cli): use newline in shell command wrapping to avoid breaking heredocs by
  @cocosheng-g in
  [#25537](https://github.com/google-gemini/gemini-cli/pull/25537)
- fix(cli): ensure theme dialog labels are rendered for all themes by
  @JayadityaGit in
  [#24599](https://github.com/google-gemini/gemini-cli/pull/24599)
- fix(core): disable detached mode in Bun to prevent immediate SIGHUP of child
  processes by @euxaristia in
  [#22620](https://github.com/google-gemini/gemini-cli/pull/22620)
- feat: add /new as alias for /clear and refine command description by @ved015
  in [#17865](https://github.com/google-gemini/gemini-cli/pull/17865)
- fix(cli): start auto memory in ACP sessions by @jasonmatthewsuhari in
  [#25626](https://github.com/google-gemini/gemini-cli/pull/25626)
- fix(core): remove duplicate initialize call on agents refreshed by
  @adamfweidman in
  [#25670](https://github.com/google-gemini/gemini-cli/pull/25670)
- test(e2e): default integration tests to Flash Preview by @SandyTao520 in
  [#25753](https://github.com/google-gemini/gemini-cli/pull/25753)
- refactor(memory): replace MemoryManagerAgent with prompt-driven memory editing
  across four tiers by @SandyTao520 in
  [#25716](https://github.com/google-gemini/gemini-cli/pull/25716)
- fix(cli): fix "/clear (new)" command by @mini2s in
  [#25801](https://github.com/google-gemini/gemini-cli/pull/25801)
- fix(core): use dynamic CLI version for IDE client instead of hardcoded '1.0.0'
  by @thekishandev in
  [#24414](https://github.com/google-gemini/gemini-cli/pull/24414)
- fix(core): handle line endings in ignore file parsing by @xoma-zver in
  [#23895](https://github.com/google-gemini/gemini-cli/pull/23895)
- Fix/command injection shell by @Famous077 in
  [#24170](https://github.com/google-gemini/gemini-cli/pull/24170)
- fix(ui): removed background color for input by @devr0306 in
  [#25339](https://github.com/google-gemini/gemini-cli/pull/25339)
- fix(devtools): reduce memory usage and defer connection by @SandyTao520 in
  [#24496](https://github.com/google-gemini/gemini-cli/pull/24496)
- fix(core): support jsonl session logs in memory and summary services by
  @SandyTao520 in
  [#25816](https://github.com/google-gemini/gemini-cli/pull/25816)
- fix(release): exclude ripgrep binaries from npm tarballs by @SandyTao520 in
  [#25841](https://github.com/google-gemini/gemini-cli/pull/25841)
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

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.38.0-preview.0...v0.40.0-preview.2
