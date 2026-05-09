## Gemini CLI - High-Quality Contribution Opportunities

### Repository Analysis Summary

**Project Type**: Open-source AI CLI agent powered by Gemini  
**Architecture**: TypeScript monorepo with React (Ink) UI  
**Code Quality Standards**: Strict TypeScript, 100% type safety, eslint
max-warnings: 0  
**Testing**: Comprehensive Vitest coverage with integration & performance
tests  
**Contribution Guidelines**: Small PRs linked to issues, CLA required, "help
wanted" label for community PRs

---

## Ranked Contribution Opportunities (Highest-Value First)

### 🥇 PRIORITY 1: Error Message Enhancement for File Operations

**Difficulty**: Beginner-Friendly | **Time**: 30-60 min | **Impact**: High |
**Visibility**: High

**Why It Matters**: Users frequently encounter filesystem errors. Better error
messages directly improve UX and reduce support burden.

**Current State**:

- File errors have basic messages in
  `packages/core/src/utils/fsErrorMessages.ts`
- ENOTDIR error exists but handling could be more helpful
- No guidance for symlinks, permission issues on different OSes

**Implementation**:

1. **Extend `fsErrorMessages.ts` with context-aware suggestions**:
   - Add EISYMLINK handling (symlink permission issues)
   - Add EAGAIN handling (temporary resource unavailable)
   - Add platform-specific suggestions (Windows vs macOS vs Linux)
   - Add recovery suggestions for each error type

2. **Add recovery hints** based on error context:

   ```typescript
   // Example enhancement
   ENOTDIR: (path) => {
     if (path?.includes('..')) {
       return `Path traversal issue: '${path}' contains invalid parent references...`;
     }
     return (
       (path ? `Not a directory: '${path}'. ` : 'Not a directory. ') +
       'Verify all parent components are directories, not files.'
     );
   };
   ```

3. **Add test cases** for edge cases:
   - Path with symlinks
   - Relative vs absolute paths
   - Windows-style paths
   - Very long paths

**Files Affected**:

- `packages/core/src/utils/fsErrorMessages.ts`
- `packages/core/src/utils/fsErrorMessages.test.ts`

**Testing Strategy**:

- Unit tests for new error codes
- Mock different filesystem scenarios
- Verify message accuracy and helpfulness

**Example Commit**:

```
feat(core): enhance filesystem error messages with recovery hints

- Add EISYMLINK and EAGAIN error handling
- Include platform-specific guidance for permission errors
- Add path context analysis for clearer diagnostics
- Include recovery steps for common scenarios
```

**Risks**: Low - UI improvement only, no breaking changes

---

### 🥈 PRIORITY 2: Missing formatBytes Edge Cases in CLI Utils

**Difficulty**: Beginner-Friendly | **Time**: 20-40 min | **Impact**: Medium |
**Visibility**: Medium

**Why It Matters**: The `formatBytes` formatter is used in memory display,
performance metrics, and file operations. Edge cases cause confusing output.

**Current State** (in `packages/cli/src/ui/utils/formatters.ts`):

```typescript
export const formatBytes = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  // ... more logic
};
```

**Issues**:

- Negative values not handled
- NaN/Infinity not handled
- Doesn't format bytes < 1KB well
- No zero handling edge case

**Implementation**:

1. **Add edge case handling**:

   ```typescript
   export const formatBytes = (bytes: number | undefined | null): string => {
     if (bytes == null || !Number.isFinite(bytes)) {
       return 'N/A';
     }

     const abs = Math.abs(bytes);
     const sign = bytes < 0 ? '-' : '';

     if (abs < 1024) {
       return `${sign}${abs} B`;
     }
     if (abs < 1024 * 1024) {
       return `${sign}${(abs / 1024).toFixed(1)} KB`;
     }
     // ... rest of logic with sign preservation
   };
   ```

2. **Add comprehensive tests**:
   - Negative values
   - Zero
   - Very large values (TB range)
   - null/undefined
   - NaN/Infinity
   - Sub-byte values

3. **Update existing tests** to verify no regressions

**Files Affected**:

- `packages/cli/src/ui/utils/formatters.ts`
- `packages/cli/src/ui/utils/formatters.test.ts`

**Example Commit**:

```
fix(cli): improve formatBytes to handle edge cases

- Handle null, undefined, NaN, and Infinity values
- Support negative byte values with sign preservation
- Format bytes < 1KB properly (show B unit)
- Add comprehensive test coverage for edge cases
```

**Risks**: Low - adds robustness, maintains backward compatibility

---

### 🥉 PRIORITY 3: Add Jsdoc Comments to Utility Functions

**Difficulty**: Beginner-Friendly | **Time**: 45-90 min | **Impact**: Medium |
**Visibility**: Medium

**Why It Matters**: Undocumented utilities make onboarding harder and increase
maintenance burden.

**Current State**:

- Many utilities lack JSDoc comments
- IDE autocomplete and hover help is incomplete
- New contributors struggle to understand function purpose

**Example Undocumented Functions**:

- `packages/core/src/utils/textUtils.ts`
- `packages/cli/src/ui/utils/displayUtils.ts`
- `packages/core/src/utils/markdownUtils.ts`

**Implementation**:

1. **Audit utility files** - prioritize:
   - Most-used utilities (check imports)
   - Public APIs and exports
   - Complex functions

2. **Add JSDoc comments**:

   ```typescript
   /**
    * Formats text to fit within a maximum width, preserving word boundaries.
    * Handles special characters and ansi escape sequences properly.
    *
    * @param text - The text to format
    * @param maxWidth - Maximum line width in characters (default: 80)
    * @param indent - Number of spaces to indent wrapped lines (default: 0)
    * @returns Formatted text with line breaks
    *
    * @example
    * const formatted = formatTextWidth("Long text here", 40);
    * // "Long text here" (if <= 40 chars)
    */
   export function formatTextWidth(
     text: string,
     maxWidth = 80,
     indent = 0,
   ): string {
     // implementation
   }
   ```

3. **Check for:**
   - Parameter descriptions with types
   - Return value documentation
   - Examples for complex functions
   - Note edge cases

**Files Affected** (suggested starting points):

- `packages/core/src/utils/textUtils.ts`
- `packages/core/src/utils/markdownUtils.ts`
- `packages/cli/src/ui/utils/displayUtils.ts`

**Testing Strategy**:

- Verify JSDoc TypeScript types match implementation
- Test that generated IDE hints are accurate
- Check for consistency with project style

**Example Commit**:

```
docs(core): add JSDoc comments to text utilities

- Document formatTextWidth with parameters, return type, and examples
- Document truncateText with truncation strategy
- Add notes on special character handling
- Improve IDE autocomplete support
```

**Risks**: Very Low - documentation only

---

### 🎯 PRIORITY 4: Add Missing Error Test Cases

**Difficulty**: Beginner | **Time**: 30-60 min | **Impact**: Medium |
**Visibility**: Low

**Why It Matters**: Better test coverage prevents regressions and makes code
changes safer.

**Current State**:

- Some error handling paths not well tested
- Edge cases in error parsing untested
- Test snapshots may be incomplete

**Example Areas** (from code review):

1. `packages/core/src/utils/errorParsing.ts` - parseAndFormatApiError has
   multiple branches
2. `packages/core/src/utils/googleErrors.ts` - API error classification
3. `packages/cli/src/ui/utils/formatters.ts` - formatDuration edge cases

**Implementation**:

1. **Identify untested branches**:
   - Use coverage reports: `npm run test -- --coverage`
   - Check for multiple if/else paths without tests
   - Look for error handling without test cases

2. **Add test cases**:

   ```typescript
   describe('parseAndFormatApiError', () => {
     it('handles null/undefined errors', () => {
       const result = parseAndFormatApiError(null);
       expect(result).toBeDefined();
     });

     it('preserves error codes in formatted output', () => {
       const error = { status: 429, message: 'Rate limited' };
       const result = parseAndFormatApiError(error);
       expect(result).toContain('429');
     });

     // Add more edge cases
   });
   ```

3. **Use parameterized tests**:
   ```typescript
   it.each([
     [null, '[API Error: Unknown error]'],
     [undefined, '[API Error: Unknown error]'],
     [{ status: 429 }, expect.stringContaining('quota')],
   ])('handles error %s', (error, expected) => {
     // test
   });
   ```

**Files Affected**:

- Error handling test files (identified via coverage)
- Example: `packages/core/src/utils/errorParsing.test.ts`

**Example Commit**:

```
test(core): add missing error parsing test cases

- Add tests for null/undefined error handling
- Test all error code branches in parseAndFormatApiError
- Add parameterized tests for multiple error scenarios
- Improve test coverage for error utilities
```

**Risks**: Very Low - test-only changes

---

### 🚀 PRIORITY 5: Performance Improvement - Cache File Extension Checks

**Difficulty**: Intermediate | **Time**: 60-90 min | **Impact**: Medium-High |
**Visibility**: Medium

**Why It Matters**: File extension checks happen frequently in tool invocations.
Caching can improve performance in workflows processing many files.

**Current State**:

- File extension checks done inline throughout codebase
- No caching of extension patterns
- Regex compilation repeated for each check

**Implementation**:

1. **Create extension cache utility**:

   ```typescript
   // packages/core/src/utils/fileExtensionCache.ts

   const extensionCache = new Map<string, string>();

   /**
    * Get file extension with caching. Handles double extensions (.tar.gz).
    */
   export function getCachedExtension(filePath: string): string {
     if (extensionCache.has(filePath)) {
       return extensionCache.get(filePath)!;
     }

     const ext = extractExtension(filePath);
     extensionCache.set(filePath, ext);
     return ext;
   }

   /**
    * Check if file has one of multiple extensions (cached).
    */
   export function hasExtensionCached(
     filePath: string,
     extensions: readonly string[],
   ): boolean {
     const ext = getCachedExtension(filePath);
     return extensions.includes(ext);
   }

   export function clearExtensionCache(): void {
     extensionCache.clear();
   }
   ```

2. **Add LRU eviction** to prevent unbounded memory growth:
   - Keep max 10,000 entries
   - Evict least-recently used on overflow

3. **Update relevant utilities** to use the cache:
   - `fileUtils.ts`
   - `glob.ts`
   - Tool validators

4. **Comprehensive tests**:
   - Cache hit/miss scenarios
   - Double extensions (.tar.gz, .tar.bz2)
   - Performance benchmark
   - Memory limits

**Files Affected**:

- New: `packages/core/src/utils/fileExtensionCache.ts`
- New: `packages/core/src/utils/fileExtensionCache.test.ts`
- Modified: `packages/core/src/utils/fileUtils.ts`

**Testing Strategy**:

```typescript
describe('fileExtensionCache', () => {
  beforeEach(() => clearExtensionCache());

  it('caches extension lookups', () => {
    const spy = vi.spyOn(path, 'extname');
    getCachedExtension('file.ts');
    getCachedExtension('file.ts');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('handles double extensions', () => {
    expect(getCachedExtension('archive.tar.gz')).toBe('.tar.gz');
  });
});
```

**Example Commit**:

```
perf(core): add file extension caching for repeated lookups

- Introduce fileExtensionCache utility with LRU eviction
- Cache up to 10,000 extensions per session
- Handle double extensions (.tar.gz, .tar.bz2, etc.)
- Add performance tests to verify improvement
- Update fileUtils to use cache for 10-50% faster checks
```

**Risks**: Low-Medium - Add tests to verify no behavior changes

---

### 💡 PRIORITY 6: Add Help Text for Common Error Scenarios

**Difficulty**: Intermediate | **Time**: 60-90 min | **Impact**: High |
**Visibility**: High

**Why It Matters**: Users encountering errors need immediate, actionable
guidance.

**Current State**:

- Error messages exist but lack context-specific help
- No "did you mean?" suggestions
- Recovery paths not clear to users

**Implementation**:

1. **Create error suggestion system**:

   ```typescript
   // packages/cli/src/ui/utils/errorSuggestions.ts

   interface ErrorSuggestion {
     title: string;
     steps: string[];
     relatedDocs?: string;
     link?: string;
   }

   const suggestions: Record<string, ErrorSuggestion> = {
     EACCES_GEMINI_FILE: {
       title: 'Permission Denied - GEMINI.md Configuration',
       steps: [
         'Check GEMINI.md file permissions: ls -la GEMINI.md',
         'Ensure your user can read the file',
         'Try: chmod 644 GEMINI.md',
       ],
       relatedDocs: '/docs/configuration',
     },
     AUTH_FAILED: {
       title: 'Authentication Failed',
       steps: [
         'Run: gemini /auth to re-authenticate',
         'Verify your API key is valid',
         'Check: gemini /auth status',
       ],
       link: 'https://geminicli.com/docs/get-started/authentication',
     },
   };

   export function getErrorSuggestion(
     errorCode: string,
   ): ErrorSuggestion | undefined {
     return suggestions[errorCode];
   }
   ```

2. **Integrate with error messages**:
   - Show in interactive mode after error
   - Provide actionable next steps
   - Link to documentation

3. **Add suggestion tests** for accuracy

**Files Affected**:

- New: `packages/cli/src/ui/utils/errorSuggestions.ts`
- New: `packages/cli/src/ui/utils/errorSuggestions.test.ts`
- Modified: Error display components

**Example Commit**:

```
feat(ux): add error recovery suggestions

- Create error suggestion system for common issues
- Add suggestions for auth failures, permission errors, quota limits
- Show actionable recovery steps in interactive mode
- Link to relevant documentation
```

**Risks**: Low - UX improvement, no behavior change

---

### 🔧 PRIORITY 7: Type Safety - Stricter Command Typing

**Difficulty**: Intermediate | **Time**: 90-120 min | **Impact**: Medium |
**Visibility**: Low

**Why It Matters**: Better typing prevents runtime errors and catches mistakes
at compile time.

**Current State**:

- Command contexts use loose typing in some areas
- Tool arguments not fully typed
- Return types could be more specific

**Implementation**:

1. **Strengthen types** in `packages/cli/src/ui/commands/types.ts`:

   ```typescript
   // Better typing for command context
   interface CommandContext {
     readonly services: {
       readonly agentContext: AgentContext | undefined;
       // ... other services
     };
     readonly ui: Readonly<UIContext>;
   }

   // Better typing for command definition
   interface SlashCommand {
     readonly name: string;
     readonly description: string;
     readonly kind: CommandKind;
     readonly action: (context: CommandContext, args?: string) => Promise<void>;
   }
   ```

2. **Add type guards**:

   ```typescript
   function isValidCommandContext(ctx: unknown): ctx is CommandContext {
     return (
       ctx != null &&
       typeof ctx === 'object' &&
       'services' in ctx &&
       'ui' in ctx
     );
   }
   ```

3. **Update commands** to use stricter types
4. **Add type tests** to verify type safety

**Files Affected**:

- `packages/cli/src/ui/commands/types.ts`
- `packages/cli/src/ui/commands/*.ts` (multiple command files)

**Testing Strategy**:

- Type check only (no runtime impact): `tsc --noEmit`
- Verify no `any` types in commands
- Add type test cases

**Example Commit**:

```
refactor(cli): strengthen command type safety

- Add readonly modifiers to prevent accidental mutations
- Create type guards for CommandContext validation
- Improve tool argument typing in SlashCommand
- Verify no implicit any types in command handlers
```

**Risks**: Low - compile-time only, improves safety

---

### 📊 PRIORITY 8: Add Performance Monitoring Utility

**Difficulty**: Intermediate | **Time**: 75-120 min | **Impact**: Medium |
**Visibility**: Low

**Why It Matters**: Performance monitoring helps identify bottlenecks and
measure improvements.

**Current State**:

- No centralized performance tracking
- Benchmarks are scattered
- Hard to measure real-world performance

**Implementation**:

1. **Create performance monitoring utility**:

   ```typescript
   // packages/core/src/utils/performanceMonitor.ts

   interface PerformanceMetric {
     name: string;
     duration: number;
     timestamp: number;
     tags?: Record<string, string>;
   }

   class PerformanceMonitor {
     private metrics: PerformanceMetric[] = [];

     mark(name: string): void {
       performance.mark(`${name}-start`);
     }

     measure(name: string, tags?: Record<string, string>): number {
       performance.measure(name, `${name}-start`);
       const measure = performance.getEntriesByName(name)[0];

       if (measure) {
         this.metrics.push({
           name,
           duration: measure.duration,
           timestamp: Date.now(),
           tags,
         });
       }

       return measure?.duration ?? 0;
     }

     getMetrics(): PerformanceMetric[] {
       return [...this.metrics];
     }
   }

   export const perfMonitor = new PerformanceMonitor();
   ```

2. **Integrate with CLI**:
   - Track tool invocation times
   - Monitor file operations
   - Measure API response times

3. **Add reporting**:
   - `/stats` command enhancements
   - Performance data export
   - Trend analysis

**Files Affected**:

- New: `packages/core/src/utils/performanceMonitor.ts`
- New: `packages/core/src/utils/performanceMonitor.test.ts`
- Modified: Tool implementations
- Modified: `statsCommand.ts`

**Example Commit**:

```
feat(core): add performance monitoring utility

- Create centralized performance tracking system
- Add mark/measure helpers for common operations
- Export metrics for analysis and reporting
- Integrate with stats command for visibility
```

**Risks**: Low - internal utility, opt-in use

---

## Quick-Win Opportunities (< 30 min)

### 1. **Add Missing Test Case for `formatDuration`**

- **File**: `packages/cli/src/ui/utils/formatters.test.ts`
- **Issue**: Missing tests for very large values (>1000 hours)
- **Time**: 10-15 min

### 2. **Fix Type Annotation in Error Types**

- **File**: `packages/core/src/utils/errors.ts`
- **Issue**: Some error properties use `any` type
- **Time**: 15-20 min

### 3. **Add Unit Tests for `stripReferenceContent`**

- **File**: `packages/cli/src/ui/utils/formatters.ts`
- **Issue**: Function lacks test coverage for edge cases
- **Time**: 15-20 min

### 4. **Improve Variable Naming in Utils**

- **File**: `packages/core/src/utils/textUtils.ts`
- **Issue**: Single-letter variables in loop; can be more descriptive
- **Time**: 10-15 min

### 5. **Add JSDoc to `formatDuration`**

- **File**: `packages/cli/src/ui/utils/formatters.ts`
- **Issue**: No documentation for millisecond formatting behavior
- **Time**: 5-10 min

---

## Contribution Workflow

### ✅ Step-by-Step Process for Any Opportunity

1. **Fork & Setup**:

   ```bash
   git clone https://github.com/YOUR-USERNAME/gemini-cli.git
   cd gemini-cli
   npm install
   npm run build
   ```

2. **Create Feature Branch**:

   ```bash
   git checkout -b fix/fs-error-messages-enhancement
   ```

3. **Make Changes**:
   - Follow code style (80 char width, single quotes, 2 spaces)
   - Run: `npm run format` to auto-format
   - Add tests alongside changes

4. **Validate**:

   ```bash
   npm run preflight  # Runs format + lint + test
   ```

5. **Commit**:

   ```bash
   git commit -m "fix(core): enhance filesystem error messages with recovery hints"
   ```

6. **Create PR**:
   - Link to issue: "Closes #XXXX" in description
   - Keep PR small and focused
   - Wait for maintainer approval on issue first

---

## Getting Approval Before Coding

**IMPORTANT**: The project requires issue approval before PR submission.

1. **Comment on issue**: `/assign`
2. **Wait** for maintainer review (24-48 hours typical)
3. **Get approval** if labeled "help wanted"
4. **Then submit PR**

---

## Testing Requirements

- **Unit Tests**: All logic changes must have tests
- **No Coverage Regressions**: Coverage should not decrease
- **Snapshot Tests**: Use sparingly, verify intentional changes
- **Type Safety**: No `any` types, pass `tsc --noEmit`

---

## Documentation Requirements

- **JSDoc comments** for public APIs
- **Commit messages** should reference issue:
  `fix(area): description. Closes #123`
- **PR description** should explain what and why
- **Test descriptions** should be clear and specific

---

## Next Steps

1. **Pick one opportunity** above (recommend starting with PRIORITY 1-3 for
   speed)
2. **Check current GitHub issues** for existing work
3. **Open/comment on issue** with `/assign`
4. **Wait for approval**, then start coding
5. **Follow the workflow** above for PR submission

**All opportunities follow Google's contribution standards and align with the
project roadmap. Choose based on your comfort level and available time!**

---

## Issue Discovery Shortcuts (Use These First)

Use these filters before writing code so your work is aligned and reviewable:

- **Help wanted (self-assignable):**
  `https://github.com/google-gemini/gemini-cli/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22`
- **Bug + help wanted:**
  `https://github.com/google-gemini/gemini-cli/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22+label%3Abug`
- **UX area:**
  `https://github.com/google-gemini/gemini-cli/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%2Fux`
- **Core area:**
  `https://github.com/google-gemini/gemini-cli/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%2Fcore`
- **Tooling area:**
  `https://github.com/google-gemini/gemini-cli/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%2Ftooling`

### Triage Rule of Thumb

Pick issues that satisfy all of these:

1. Clear repro or acceptance criteria exists.
2. Blast radius is limited to 1-3 files.
3. Expected change can fit in < 250 lines net diff.
4. Tests can be added in same PR.
5. No API redesign or cross-package refactor needed.

---

## Maintainer-Grade Definition of Done

Before opening PR, ensure all are true:

- Change is linked to an existing issue.
- Problem statement and scope are explicit.
- One focused change only (no opportunistic cleanup).
- Tests cover happy path + at least one edge case.
- No breaking behavior changes unless issue explicitly requests it.
- Docs/changelog updated if user-visible behavior changed.
- `npm run preflight` passes locally.

### Non-Negotiables

- Do **not** include unrelated formatting or refactors.
- Do **not** change public contracts without maintainer agreement.
- Do **not** mix feature work and test-infra fixes in one PR.

---

## PR Size Guidance

Use this sizing model to maximize merge velocity:

- **Small (ideal):** 50-200 changed lines, 1 package, 1 test file touched.
- **Medium (acceptable):** 200-400 changed lines, 1-2 packages, clear
  boundaries.
- **Large (slow review):** >400 changed lines; split into stacked PRs.

If large, split by sequence:

1. Refactor-only prep (no behavior changes).
2. Behavior change.
3. Follow-up tests/docs.

---

## Copy-Paste Templates

### 1) Issue Comment to Self-Assign

```text
/assign
```

### 2) Work Plan Comment on Issue

```md
I’d like to work on this.

Proposed scope:

- Implement <specific fix/feature>
- Add tests for <exact scenarios>
- Update docs at <path> if behavior is user-visible

Out of scope:

- <explicitly excluded items>
```

### 3) Commit Message Template

```text
fix(<area>): <short imperative summary>

- <what changed>
- <why this approach>
- <test coverage added>

Closes #<issue_number>
```

### 4) PR Description Template

```md
## Summary

Closes #<issue_number>

This PR <one-sentence outcome>.

## What Changed

- <change 1>
- <change 2>
- <change 3>

## Why

- <reason 1>
- <reason 2>

## Tests

- [x] Unit: <test names>
- [x] Integration: <if applicable>
- [x] `npm run preflight`

## Risk

- Risk level: Low/Medium
- Mitigation: <how regressions are prevented>

## Out of Scope

- <explicit non-goals>
```

---

## Validation Commands (Run Exactly)

```bash
# Full contributor gate
npm run preflight

# If debugging one package only
npm run test --workspace @google/gemini-cli-core
npm run test --workspace @google/gemini-cli

# Type safety gate
npm run build
```

### If `npm run test` exits non-zero

In this repo, test output can be noisy. Separate **warnings/logs** from **actual
failing tests**:

1. Look for `FAIL`, `×`, or `failed` summary lines.
2. Confirm package-level test summaries show passed/failed counts.
3. Re-run only failing workspace with `--workspace` filter.

---

## High-Value Refactor Opportunities (Review-Friendly)

These are good after 1-2 smaller wins:

1. **Extract repeated error formatting helpers**
   - Difficulty: Intermediate
   - Time: 2-3 hours
   - Files: `packages/core/src/utils/errorParsing.ts`, related utils/tests
   - Risk: Medium (message text regressions)
   - Tests: snapshot or exact-string assertions per branch

2. **Consolidate duplicate path/ignore checks**
   - Difficulty: Intermediate
   - Time: 2-4 hours
   - Files: `packages/core/src/utils/ignore*`, `packages/core/src/tools/*`
   - Risk: Medium (subtle behavior differences)
   - Tests: cross-platform path fixtures, Windows/Unix separators

3. **Improve deterministic test setup for noisy integrations**
   - Difficulty: Intermediate
   - Time: 2-4 hours
   - Files: `packages/sdk/src/*.integration.test.ts`, fake generators/mocks
   - Risk: Low-Medium
   - Tests: enforce explicit fake response ordering, avoid implicit global state

---

## 30/60/90 Minute Execution Plans

### 30 Minutes

- Pick one low-risk utility or test-gap issue.
- Implement smallest valid fix.
- Add one focused test.
- Run targeted workspace test.

### 60 Minutes

- Add edge-case handling plus 3-5 tests.
- Run `npm run test --workspace <package>` and `npm run build`.
- Open draft PR with clear scope.

### 90 Minutes

- Deliver full small PR with docs if user-visible.
- Run `npm run preflight`.
- Address quick review comments.

---

## Common Rejection Reasons (Avoid These)

- PR not linked to issue.
- Scope creep (multiple unrelated improvements).
- Missing tests for changed logic.
- Unclear behavioral intent in PR description.
- Large diff with mixed refactor + feature.
- Breaks established naming/style conventions.

---

## Best First Contribution Recommendation

Start with **PRIORITY 2 (formatBytes edge cases)** or **PRIORITY 4 (missing
tests)**.

Why these two first:

1. Easy to validate with deterministic tests.
2. Minimal architecture risk.
3. Clear user/developer value.
4. Likely fast reviewer turnaround.
