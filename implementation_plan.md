# Test Output Silencing Implementation Plan

## Goal
Reduce passing test output to single-line per test file so `npm run preflight` runs cleanly.

## Phase 1: Core Silencing (Week 1-2)

### 1.1 Vitest Configuration 
- **Enable `silent: true`** in all vitest configs (packages/*/vitest.config.ts, evals/vitest.config.ts)
- **Current status**: core tests have `silent: true`; integration-tests and evals do not
- **Risk mitigation**: Logs only in errors; passing tests output nothing
- **Files to modify**:
  - `integration-tests/vitest.config.ts`
  - `evals/vitest.config.ts`
  - `packages/sdk/vitest.config.ts`
  - `packages/a2a-server/vitest.config.ts`
  - `packages/test-utils/vitest.config.ts`

### 1.2 Console Output Capture 
Create centralized stdout/stderr suppression in test setups:
- **Location**: `packages/core/test-setup.ts`
- **Add**:
  - `vi.spyOn(console, 'log').mockImplementation()` 
  - `vi.spyOn(console, 'error').mockImplementation()`
  - `vi.spyOn(console, 'warn').mockImplementation()`
  - `vi.spyOn(process.stdout, 'write').mockImplementation()`
  - `vi.spyOn(process.stderr, 'write').mockImplementation()`
- **Teardown**: Reset mocks in afterEach

### 1.3 Logger Mocking Framework
Create `packages/core/src/utils/loggerMocks.ts`:
- Mock `winston` logger (used for internal logging)
- Mock `chalk` for color stripping
- Mock `debug()` module
- Provide `unmockLogger()` for tests needing to debug logging
- Export as reusable in all test setups

### 1.4 Expected Error Handling
- **Audit** all test files for unhandled error logs
- **Pattern**: Wrap expected errors in try-catch, don't let stack traces print
- **Script to identify**: Search for tests that call functions expected to throw without catching
- **Files affected**: ~80+ integration tests, ~200+ unit tests

### 1.5 CLI Execution Output Buffering
Update `packages/test-utils/src/test-rig.ts`:
- **Buffer stdout/stderr** during `rig.run()` execution
- **Only print on test failure** (use Vitest lifecycle to detect)
- **Suppress intermediate logs** unless `VERBOSE=true`
- **Keep minimal pass/fail markers** for diagnostics

---

## Phase 2: Audit & Fixes (Week 2-3)

### 2.1 Test Output Audit
Run `npm run preflight` with logging enabled:
```bash
npm run test:ci 2>&1 | tee test-output.log
wc -l < test-output.log  # Measure baseline
```

**By package**:
- `packages/core`: 20-30 files, ~100-200 tests
- `packages/sdk`: 10-15 files, ~50 tests  
- `packages/a2a-server`: 5-10 files, ~30 tests
- `packages/cli`: 5-10 files, ~20 tests
- `integration-tests/`: 30-40 files, ~200-300 tests
- `evals/`: 15+ files (conditional, RUN_EVALS=1)

### 2.2 Categorize Output Roots
- **Logger output**: Winston, debug module, custom loggers
- **CLI stderr**: gemini-cli running and printing errors
- **Third-party noise**: dependencies logging (axios, node, etc)
- **Legitimate failures**: Messages still needed for debugging

### 2.3 Fix Test-by-Test
**Process**:
1. Run failing test batch with VERBOSE logging
2. Identify noise source
3. Apply targeted fix (mock, suppress, wrap in try-catch)
4. Verify no loss of legitimate error detection (run act() validation)
5. Repeat per test file

**Priority order**:
1. Core package tests (foundation for others)
2. Integration tests (high noise volume)
3. SDK/CLI tests
4. Evals (lowest priority, conditional)

---

## Phase 3: Automated Safeguards (Week 3-4)

### 3.1 Vitest Reporter Plugin
**File**: `scripts/reporters/output-limit.reporter.ts`

Implements custom reporter that:
- **Tracks per-test output** (stdout+stderr size)
- **Fails if > 5KB per test** (generous threshold for actual errors)
- **Reports summary**: 
  ```
  ✓ 1250 tests passed, 0 exceeded output limit
  ⚠ 3 tests near limit (4.2KB, 3.8KB, 3.9KB)
  ```
- **Integration**: Add to all vitest configs as secondary reporter

### 3.2 CI Output Validation
**GitHub Actions step** (`.github/workflows/test.yml`):
```yaml
- name: Check Test Output
  if: success()  # Only run if tests passed
  run: |
    npx vitest run --reporter=output-limit | grep -q "exceeded" && exit 1
    echo "✓ Test output within limits"
```

### 3.3 ESLint Rule: Unguarded Logger Detection
**File**: `eslint-rules/no-unguarded-logging.ts`

Detects patterns:
- Direct `logger.error()` outside try-catch
- `console.log()` not wrapped in `if (VERBOSE)`
- `console.error()` in error handlers without suppression
- `throw new Error()` not caught in tests

**Config**: Add to `.eslintrc.cjs`:
```js
'no-unguarded-logging': 'error'
```

### 3.4 Pre-commit Hook
**File**: `.husky/pre-commit` addition:
- Run `eslint --rule no-unguarded-logging` on changed test files
- Block commit if violations found
- Developers can override with `--no-verify` if intentional

---

## Phase 4: Documentation & Maintenance (Week 4)

### 4.1 Testing Guidelines
Update `CONTRIBUTING.md`:
- "Passing tests produce no output"
- Mock loggers in test setup
- Use `rig.run({ capture: true })` pattern
- Exception: use `--reporter=verbose` for debugging locally

### 4.2 Logger Mock Library Docs
Create `docs/testing/logger-mocking.md`:
- How to unmock logger for debugging
- List of pre-configured mocks (winston, debug, etc)
- Examples for common logging libraries

### 4.3 Regression Prevention
- **Monthly audit**: Re-run preflight and measure output
- **Alert threshold**: If output > 10x baseline, investigate
- **Dashboard**: Track test output trend in CI metrics

---

## Implementation Details

### A. Mock Order (Critical)
Must apply mocks in order:
1. **Vitest setup**: `silent: true`, spy setup
2. **Logger mocks**: Before any code runs
3. **Test execution**
4. **Teardown**: Reset all mocks

### B. Preserving Legitimate Errors
**Not mocked by default**:
- Vitest assertion failures (these should print)
- Test timeout errors
- Unhandled promise rejections
- Syntax/runtime errors

**Strategy**: Mock at app level, not Vitest level

### C. Environment Flag for Debugging
Add `VERBOSE_TESTS=1` to:
- Disable console mocking
- Disable output buffering  
- Show all logs, errors, timings

Usage:
```bash
VERBOSE_TESTS=1 npm run test:scripts -- integration-tests/api-resilience.test.ts
```

### D. Phased Rollout
1. **Week 1**: Enable silencing in configs only (opt-in with VERBOSE flag)
2. **Week 2**: Fix individual tests with high noise
3. **Week 3**: Enforce with reporter plugin and lint rule
4. **Week 4**: Full integration in CI, update docs

---

## Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| Test files with <10 output lines | 100% | Week 2 |
| Output per test file | <1 line avg | Week 2 |
| lint rule violations | 0 | Week 3 |
| CI integration | Full | Week 4 |
| Developer adoption | 100% | Week 4 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Silent tests hide real failures | Vitest reporter catches output anomalies; lint rule prevents unguarded errors |
| `act()` violations go undetected | Keep test timeout errors visible; React dev tools still catch in browser tests |
| Noise return over time | ESLint pre-commit hook + monthly audit |
| Developers bypass mocks | Document unmocking patterns; VERBOSE flag for debugging |

---

## Quick Reference

### Commands After Implementation
```bash
# Run preflight (should be quiet)
npm run preflight

# Debug noisy tests with full logging
VERBOSE_TESTS=1 npm run test:ci

# Run single test file verbosely
VERBOSE_TESTS=1 npm run test:scripts -- packages/core/src/__tests__/foo.test.ts

# Check for policy violations ahead of commit
npm run lint:logging-policy
```

### File Checklist
- [ ] `packages/*/vitest.config.ts` - enable `silent: true`
- [ ] `packages/core/test-setup.ts` - add console mocks
- [ ] `packages/core/src/utils/loggerMocks.ts` - create mock library
- [ ] `packages/test-utils/src/test-rig.ts` - buffer output
- [ ] `scripts/reporters/output-limit.reporter.ts` - create reporter
- [ ] `eslint-rules/no-unguarded-logging.ts` - create rule
- [ ] `.eslintrc.cjs` - enable rule
- [ ] `.github/workflows/*.yml` - add CI checks
- [ ] `CONTRIBUTING.md` - update testing section
- [ ] `docs/testing/logger-mocking.md` - new guide
