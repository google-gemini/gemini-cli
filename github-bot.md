Open fix: improve path validation in memory discovery and resolve IDE errors
#16055 sontoriyama wants to merge 5 commits into google-gemini:main from
sontoriyama:fix-clean-history +261 −102 Conversation 3 Commits 5 Checks 2 Files
changed 7 Conversation @sontoriyama sontoriyama commented 23 minutes ago • This
PR improves the robustness of the memory discovery logic and resolves systemic
IDE diagnostic errors.

Key changes:

Enhanced path validation and boundary checks in memory discovery. Resolved
constructor parameter mismatches in DeclarativeTool. Verified stability with
existing test suites. General cleanup of temporary diagnostic files. sontoriyama
added 5 commits 1 hour ago @sontoriyama fix(core): add 'antigravity' as fallback
binary name for Linux b727cd2 @sontoriyama fix(core): skip directories when
reading GEMINI.md files 30619af @sontoriyama fix(core): improve path validation
for imports and resolve test logic… d53c401 @sontoriyama security: implement
path traversal protection and fix linter diagnostics 88cced0 @sontoriyama fix:
resolve IDE parameter mismatches and ensure memory tool security 2c3c861
@sontoriyama sontoriyama requested a review from a team as a code owner 23
minutes ago @gemini-code-assist Contributor gemini-code-assist bot commented 23
minutes ago Summary of Changes Hello @sontoriyama, I'm Gemini Code Assist1! I'm
currently reviewing this pull request and will post my feedback shortly. In the
meantime, here's a summary to help you and other reviewers quickly get up to
speed!

This pull request significantly enhances the security and reliability of the
memory management system by introducing robust path traversal prevention for
GEMINI.md files and imports. It also improves the memory discovery process by
gracefully handling misnamed directories. Additionally, the PR includes
important dependency updates and minor fixes for IDE compatibility and editor
command aliases, contributing to a more stable and secure codebase.

Highlights Enhanced Security for Memory Tools: Implemented robust path traversal
prevention for GEMINI.md filenames and imports, ensuring that memory files
cannot access sensitive data outside designated project or global directories.
Improved Memory Discovery Robustness: Added logic to silently skip directories
that are mistakenly named GEMINI.md during memory discovery, preventing errors
and improving user experience. Dependency Updates and Cleanup: Updated several
core dependencies, including express, qs, and type-is, and refined the
NOTICES.txt file to reflect these changes and remove outdated entries. IDE
Compatibility Fixes: Addressed a TypeScript type assertion issue in MemoryTool
tests to resolve potential IDE false positives. Expanded Editor Support: Added
'antigravity' as an alias for the 'agy' command in the editor utility. Using
Gemini Code Assist Footnotes Review the Privacy Notices, Generative AI
Prohibited Use Policy, Terms of Service, and learn how to configure Gemini Code
Assist in GitHub here. Gemini can make mistakes, so double check it and use code
with caution. ↩

@sontoriyama sontoriyama changed the title fix: resolve IDE false positives and
validate memory tool security security: prevent path traversal in GEMINI.md
imports and fix IDE errors 20 minutes ago @sontoriyama sontoriyama changed the
title security: prevent path traversal in GEMINI.md imports and fix IDE errors
fix: improve path validation in memory discovery and resolve IDE errors 17
minutes ago gemini-code-assist[bot] gemini-code-assist bot reviewed 15 minutes
ago Contributor gemini-code-assist bot left a comment Code Review This pull
request introduces important security enhancements and bug fixes, primarily
focused on the MemoryTool. The changes effectively add path traversal validation
for memory file names and memory imports, which is a significant improvement.
The accompanying tests are thorough and cover critical security scenarios, such
as preventing imports from outside the project root. The handling of directories
named like memory files also adds to the robustness of the memory discovery
process.

I have found one critical security vulnerability that remains in the
setGeminiMdFilename function, where the validation is incomplete and still
allows for path traversal using . or .. as filenames. My review includes a
specific suggestion to address this.

Overall, this is a valuable contribution to the security and stability of the
tool. Once the identified issue is resolved, this PR will be in great shape.

packages/core/src/tools/memoryTool.ts Comment on lines +75 to +79 if
(trimmed.includes('/') || trimmed.includes('\\')) { throw new Error(
`Invalid GEMINI.md filename: ${trimmed}. Filenames cannot contain path separators.`,
); } Contributor @gemini-code-assist gemini-code-assist bot 15 minutes ago
critical

The validation for newFilename is a good security measure, but it's incomplete.
It currently checks for path separators (/ and \\) but fails to prevent the use
of . or .. as a filename. This allows for a path traversal vulnerability. For
instance, setting newFilename to '..' would cause functions like
getGlobalMemoryFilePath to construct a path that traverses up one directory,
enabling file writes outside the intended .gemini directory. To mitigate this,
the validation should also explicitly disallow . and .. as filenames.

Suggested change if (trimmed.includes('/') || trimmed.includes('\\')) { throw
new Error(
`Invalid GEMINI.md filename: ${trimmed}. Filenames cannot contain path separators.`,
); } if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' ||
trimmed === '..') { throw new Error(
`Invalid GEMINI.md filename: ${trimmed}. Filenames cannot contain path separators or be '.' or '..'.`,
); } @sontoriyama Reply... Merge info Review required Code owner review required
by reviewers with write access.

3 workflows awaiting approval This workflow requires approval from a maintainer.
Learn more about approving workflows.

pending checks CI CIExpected — Waiting for status to be reported Required E2E
(Chained) E2E (Chained)Expected — Waiting for status to be reported Required
successful checks cla/google cla/googleSuccessful in 1s — ✅ All contributors
are covered under a CLA with Google Required Gemini Automated PR Labeler /
label-pr (pull_request_target) Gemini Automated PR Labeler / label-pr
(pull_request_target)Successful in 1m Merging is blocked Waiting on code owner
review from google-gemini/gemini-cli-maintainers.
