# Gemini Bot Brain: Memory & State

## 📋 Task Ledger

| ID    | Status    | Goal                                              | PR/Ref | Details                                                                                                                       |
| :---- | :-------- | :------------------------------------------------ | :----- | :---------------------------------------------------------------------------------------------------------------------------- |
| BT-62 | DONE      | Fix Throughput Anomaly & Finalize CI Optimization | #TBD   | Implemented 7-day fixed window in `throughput.ts` and `latency.ts`; replaced `macos-latest-large` in all workflows.           |
| BT-63 | DONE      | Actualize Missing Metrics & CI Fixes              | #TBD   | Resolved logic divergence by manually re-applying 7-day window, search-based sampling, and Mac CI optimizations.              |
| BT-64 | DONE      | Critique & Finalize CI/Metric Fixes               | #TBD   | Critiqued staged changes; fixed output format in `actions_spend.ts` to CSV; verified security and robustness of CI workflows. |
| BT-65 | DONE      | Restore Search-Based Metrics & CI Optimizations   | #TBD   | Re-implemented search-based sampling for throughput/latency and switched Mac runners to macos-latest.                         |
| BT-66 | DONE      | Fix Metric Fidelity sampling bias                 | #TBD   | Transitioned throughput.ts, latency.ts, and user_touches.ts to search-based sampling with fixed 7-day windows.                |
| BT-67 | DONE      | Critique & Robustness Fixes for Metrics           | #TBD   | Audited search-based metrics; added defensive filtering for GraphQL nodes; verified CSV output compliance.                    |
| BT-68 | SUBMITTED | Resolve Type Errors & Stabilize Build             | #TBD   | Fixed baseUrl, lib targets, and SDK/DevTools type errors. Critiqued and added robustness to SDK session recovery.             |
| BT-69 | DONE      | Fix Throughput Metric Data Corruption             | #TBD   | Transitioned `throughput.ts` to search-based 7-day window to stabilize 'per day' calculations.                                |
| BT-70 | SUBMITTED | Stable Metrics & Build Stabilization              | #TBD   | Transitioned latency and user_touches to 7-day windows; Upgraded test-utils to ES2023; Fixed CLI type errors.                 |
| BT-71 | SUBMITTED | Fix test-utils type errors via ES2023 upgrade     | #TBD   | Upgraded `test-utils` lib target to ES2023 to resolve 20 modern Error/Intl type errors.                                       |
| BT-72 | DONE      | Implement compact version tags in AppHeader | #TBD   | Parsed long pre-release version strings into base version and [tag] in `AppHeader.tsx`. |
| BT-73 | SUBMITTED | Add Flash-Lite to default fallback chain     | #TBD   | Added `DEFAULT_GEMINI_FLASH_LITE_MODEL` to `getModelPolicyChain` in `policyCatalog.ts`. Critiqued and verified fallback logic and tests. |
| BT-74 | SUBMITTED | Optimize CI Build Efficiency                 | #TBD   | Enabled parallel builds in CI and removed redundant `posttest: build` scripts from all package.json files. |
| BT-75 | SUBMITTED | Strip line/col suffixes from Windows path links   | #26902 | Applied regex stripping to absolute and relative Windows paths in CLI output on Windows to prevent FileSystemError. Critiqued and optimized for performance. |
| BT-76 | DONE      | Stabilize Metrics with 7-Day Windows             | #TBD   | Transitioned throughput, latency, user_touches, review_distribution, and TTFR to fixed 7-day windows using search-based sampling. |
| BT-77 | SUBMITTED | Optimize Session Resumption & Filename Format    | #TBD   | Implemented full session ID in filenames for main sessions and optimized SDK resumption to filter by full ID first. |

## 🧪 Hypothesis Ledger


| Hypothesis                               | Status    | Evidence                                                                                       |
| :--------------------------------------- | :-------- | :--------------------------------------------------------------------------------------------- |
| Windows path suffixes cause errors       | CONFIRMED | Issue #26902 report; absolute paths with `:line:col` cause `stat` errors on Windows due to colons. |
| Metric scripts are capping at 1000       | CONFIRMED | `gh search` returned >1000 items.                                                              |
| Throughput script uses unstable window   | CONFIRMED | `calculateThroughput` uses time gap between items, causing extreme deltas when gaps are small. |
| Review variance spike indicates burnout  | CONFIRMED | Variance increased from ~5 to 20.22 in 7 days.                                                 |
| test-utils type errors caused by old lib | CONFIRMED | Upgrading to ES2023 resolved 20 errors in test-utils.                                          |
| SDK/CLI have implicit any/unknown errors | CONFIRMED | `tsc` reported several TS7006 and TS18046 errors in SDK and CLI packages.                      |
| Default fallback chain missing Flash-Lite| CONFIRMED | `policyCatalog.ts` only had Pro and Flash in the default chain.                                |
| Redundant builds causing CI spend spike  | CONFIRMED | `actions_spend` increased +109% (17k+ mins); `scripts/build.js` sequential in CI.              |
| Truncated IDs cause SDK resumption lag   | CONFIRMED | Issue #26823; collisions in 8-character prefixes caused sequential parsing of many unrelated chat files. |

## 📜 Decision Log (Append-Only)

- **[2026-05-14]**: [CRITIQUE] Approved Windows path suffix stripping. Optimized
  `stripLineColumnSuffixes` by moving the regex outside the function and adding
  a fast-path `includes(':')` check. Expanded the regex to support relative
  Windows paths with backslashes (e.g., `src\main.js:10`), ensuring broader
  mitigation for issue #26902. Verified with unit tests.
- **[2026-05-14]**: [CORE] Implemented `stripLineColumnSuffixes` to prevent `FileSystemError` on Windows when clicking terminal links with line/col numbers. Applied to `TextOutput`, `markdownParsingUtils`, `debugLogger`, and `ConsolePatcher`.
- **[2026-05-13]**: [BUILD] Upgraded `packages/test-utils` to ES2023 to resolve
  20 type errors related to modern `Error` (cause/ErrorOptions) and `Intl`
  features, ensuring monorepo build consistency.
- **[2026-05-13]**: [CRITIQUE] Unbundled core package changes (Error cause
  support) from metric script improvements to maintain PR hygiene (One Thing at
  a Time). Fixed redundant `@license` headers in metric scripts and verified
  7-day window logic robustness.
- **[2026-05-13]**: [CRITIQUE] Approved `test-utils` ES2023 upgrade. Verified
  consistency with `core` and `cli` package and confirmed that it resolves all
  20 type errors in the workspace. No security or performance regressions
  identified.
- **[2026-05-13]**: [UI] Implemented compact version tags in `AppHeader.tsx` to
  handle long nightly/preview strings, improving layout on narrow terminals
  (Issue #21373).
- **[2026-05-13]**: [CRITIQUE] Approved compact version tags. Fixed a lint error
  in `AppHeader.test.tsx` by replacing `any` with `ContentGeneratorConfig` in
  `vi.spyOn`. Verified implementation with unit tests.
- **[2026-05-13]**: [POLICY] Added `gemini-2.5-flash-lite` to the default model
  policy chain to prevent `QUOTA_EXHAUSTED` errors when Pro and Flash quotas are
  depleted (Issue #26841).
- **[2026-05-13]**: [CRITIQUE] Approved `policyCatalog.ts` changes. Verified the
  addition of Flash-Lite to the default fallback chain, ensuring higher
  robustness for quota-limited users. Confirmed that `isLastResort` is correctly
  assigned to the new model and that unit tests correctly validate the extended
  chain length. No security or performance issues identified.
- **[2026-05-14]**: [CI] Optimized CI/CD pipeline by enabling parallel workspace
  builds and removing redundant `posttest: build` scripts. Expected to reduce
  Actions spend by eliminating ~15 full rebuilds per push.
- **[2026-05-14]**: [CRITIQUE] Approved CI build optimization. Verified removal
  of redundant `posttest` hooks in root, `cli`, and `core` packages. Confirmed
  `scripts/build.js` unification to always use parallelized builds, removing
  sequential bottleneck in CI. No security risks or performance regressions.
- **[2026-05-14]**: [METRICS] Transitioned 5 core metric scripts to fixed 7-day
  windows using `gh search` and GraphQL search. This stabilizes reporting,
  eliminates sampling bias from the 'last 100' items, and prevents anomalies in
  throughput and latency metrics.
- **[2026-05-14]**: [CORE/SDK] Optimized session resumption by using full session IDs in filenames for main sessions. This prevents collision-based sequential parsing in the SDK, reducing `loadConversationRecord` calls from N to 1 in prefix-colliding scenarios (Issue #26823). Maintained backward compatibility for 8-char IDs.
- **[2026-05-14]**: [CRITIQUE] Approved session ID optimization in `core` and `sdk`. Verified that the transition from 8-character prefixes to full session IDs in filenames significantly reduces filesystem scanning overhead during resumption. Confirmed that the SDK's fallback mechanism correctly handles legacy sessions. No security regressions or breaking changes identified.

## 📝 Detailed Investigation Findings (Current Run)

- **Formulated Hypotheses**: 
  - Metric scripts using 'last 100' items (count-based sampling) cause unstable reporting and throughput anomalies. (CONFIRMED)
  - Truncated session IDs in filenames cause sequential parsing bottleneck in SDK session resumption. (CONFIRMED)
- **Evidence Gathered**: 
  - `throughput.ts` used the time gap between the first and last of 100 items, leading to a 3,355 spike when items were close together.
  - Review variance spiked to 20.22, indicating sensitivity to sample selection.
  - SDK `resumeSession` parsed 6 files instead of 1 when filenames had colliding 8-character prefixes.
- **Root Cause & Conclusions**: 
  - Count-based sampling is inappropriate for time-series metrics. Fixed-window (7-day) sampling provides stability.
  - Filename truncation to 8 chars is insufficient for efficient lookups in high-volume environments. Full session IDs provide unique handles.
- **Proposed Actions**: 
  - Transition all key metric scripts to a fixed 7-day window. (DONE)
  - Implement full session IDs in filenames and optimize SDK resumption lookup. (DONE)

