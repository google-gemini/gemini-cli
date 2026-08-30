# PR Title
`fix(core): normalize line endings in getDiffContextSnippet to prevent full-file diffs on CRLF`

---

## Summary

Fixes a bug where `getDiffContextSnippet` produces a full-file diff when comparing strings with mismatched line endings (`LF` vs `CRLF`). On Windows or when editing files with CRLF line endings, the function was dumping 100% of the file back into the model's context instead of a compact 5-line diff context snippet, causing severe context window bloat and unnecessary token consumption.

---

## Details

1. In `EditToolInvocation` (`packages/core/src/tools/edit.ts`), `calculateEdit` normalizes `currentContent` to `\n` (LF), whereas `execute` restores CRLF (`\r\n`) on Windows or CRLF files before saving to disk.
2. `getDiffContextSnippet` in `packages/core/src/tools/diff-utils.ts` passed `originalContent` (`\n`) and `finalContent` (`\r\n`) directly to `Diff.diffLines()`. Because `diffLines` is line-ending sensitive, every line was considered removed and re-added, expanding the diff range to the entire file.
3. **Fix:** Normalized both `originalContent` and `newContent` line endings to `\n` before computing `Diff.diffLines()` in `packages/core/src/tools/diff-utils.ts`.
4. Added comprehensive unit test coverage in `packages/core/src/tools/diff-utils.test.ts` covering mixed LF/CRLF permutations.

---

## Related Issues

<!-- If you raised an issue on GitHub, replace with: Fixes #<issue_number> -->

---

## How to Validate

1. Run the `diff-utils` unit tests:
   ```bash
   npm test --workspace @google/gemini-cli-core -- diff-utils.test.ts
   ```
2. Verify that:
   - Comparing `LF` original content with `CRLF` modified content generates a concise context snippet with `...` truncation markers.
   - Comparing `CRLF` original content with `LF` modified content generates a concise context snippet.
   - All existing tests in `diff-utils.test.ts` pass without regressions.

---

## Pre-Merge Checklist

- [ ] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [x] Validated on required platforms/methods:
  - [ ] MacOS
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
    - [ ] Podman
    - [ ] Seatbelt
  - [x] Windows
    - [x] npm run
    - [ ] npx
    - [ ] Docker
  - [ ] Linux
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
