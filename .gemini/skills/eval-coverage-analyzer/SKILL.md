---
name: eval-coverage-analyzer
description:
  Analyze behavioral eval coverage across tools and prompt behaviors. Use when
  assessing which agent behaviors have eval tests and which don't, identifying
  gaps for new eval contributions, or reviewing overall eval health. Trigger
  when the user asks about eval coverage, eval gaps, what needs testing, or
  which tools lack behavioral tests.
---

# Eval Coverage Analyzer

Scans existing behavioral evals and cross-references them with tool definitions
and system prompt behaviors to produce a coverage report. This helps
contributors identify where new evals are most needed.

> The [behavioral-evals](.gemini/skills/behavioral-evals/SKILL.md) skill tells
> you HOW to write evals. This skill tells you WHAT to write by finding gaps.

## Workflow

### 1. Scan existing evals

Read all `evals/*.eval.ts` files. For each test case, extract:

- the `describe` block name (feature area)
- the test `name` (specific behavior)
- which tool names appear in assertions (look for constants like `read_file`,
  `replace`, `write_file`, `grep_search`, `ask_user`, etc.)
- the type of assertion (tool was called, tool was NOT called, tool ordering,
  file content check)

Also check `evals/app-test-helper.ts` for tests using `appEvalTest` (these test
interactive/UI behaviors with breakpoints).

### 2. Get the full tool inventory

Read `packages/core/src/tools/tool-names.ts` and find the
`ALL_BUILTIN_TOOL_NAMES` array. This is the authoritative list of every built-in
tool. The actual string values for each constant are in
`packages/core/src/tools/definitions/base-declarations.ts`.

### 3. Scan prompt behaviors

Read `packages/core/src/prompts/snippets.ts` and extract the key behavioral
instructions from:

- **Core Mandates** section (security, context efficiency)
- **Engineering Standards** section (conventions, testing, libraries, proactiveness)
- **Context Efficiency** examples (searching, editing, reading patterns)

Each of these represents a behavior that could be tested by an eval.

### 4. Cross-reference and report

Produce a coverage report with these sections:

#### Tools with eval coverage

For each tool that appears in at least one eval assertion, list:
- tool name
- which eval file(s) test it
- what behaviors are tested

#### Tools with NO eval coverage

List every tool from `ALL_BUILTIN_TOOL_NAMES` that does not appear in any eval
assertion. These are the primary gaps.

#### Prompt behaviors with coverage

Map the behavioral instructions from snippets.ts to existing evals. For example:
- "do not stage or commit changes unless requested" → `gitRepo.eval.ts`
- "use ranged reads for large files" → `frugalReads.eval.ts`

#### Prompt behaviors without coverage

List behavioral instructions from snippets.ts that have no corresponding eval.

#### Suggested next evals

Based on the gaps found, suggest the top 3-5 most important missing evals,
prioritized by:
1. tools/behaviors used frequently by users
2. behaviors that are safety-critical (e.g., not deleting files unprompted)
3. behaviors that have been the subject of bug reports or regressions

For detailed guidance on writing the suggested evals, see
**[references/coverage-analysis-guide.md](references/coverage-analysis-guide.md)**.
