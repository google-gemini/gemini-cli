# Conflict Risk Categories

When merging upstream changes into a Gemini CLI fork, files fall into three risk
tiers. Work through LOW first, then MEDIUM, then HIGH — and run `npm run test`
between tiers.

---

## LOW Risk

**What it means**: Changes in these files are unlikely to conflict with
enterprise customizations. Auto-merge or a quick visual review is sufficient.

**File patterns:**

- `docs/` — documentation, changelogs, tutorials
- `**/*.test.ts`, `**/*.spec.ts` — unit and integration tests
- `packages/core/src/skills/builtin/` — built-in skills (markdown + scripts
  only)
- `scripts/` — build/CI helper scripts
- `.github/` — GitHub Actions workflows, issue templates
- `*.md`, `*.txt`, `*.json` (non-schema) — markdown and data files

**Resolution approach:**

- Accept upstream changes with `git checkout --theirs <file>` (or `ours` if you
  have local doc changes)
- Re-read the file briefly to ensure no policy-sensitive content was added
- Run `npm run test` after accepting all LOW-risk files

---

## MEDIUM Risk

**What it means**: Changes here may interact with enterprise customizations but
are usually additive (new settings, new tools, new MCP capabilities). Requires
file-by-file review but is rarely a deep conflict.

**File patterns:**

- `schemas/settings.schema.json` — new config options added upstream
- `packages/core/src/tools/definitions/coreTools.ts` — new built-in tool
  registrations
- `packages/core/src/tools/<new-tool>.ts` — new tool implementations
- `packages/cli/src/commands/` — new CLI subcommands
- `packages/core/src/config/` — config loading changes
- `package.json` files — dependency bumps
- `packages/cli/src/ui/` — new UI components (if fork has UI customizations)

**Resolution approach:**

- For `settings.schema.json`: merge both sets of `properties` — upstream
  additions are safe to keep alongside fork additions.
- For new tool files: accept upstream as-is unless fork excludes that tool via
  `excludeTools`.
- For `package.json` dependency bumps: accept upstream version, then run
  `npm install` to regenerate `package-lock.json`.
- For `package-lock.json`: **always take theirs** —
  `git checkout --theirs package-lock.json && npm install`.
- Run `npm run build && npm run test` after completing all MEDIUM-risk files.

---

## HIGH Risk

**What it means**: Changes in core execution logic that are most likely to
conflict with deep fork customizations. Every line requires careful review.

**File patterns:**

- `packages/core/src/core/client.ts` — main GeminiClient, `sendMessageStream`,
  `processTurn`
- `packages/core/src/core/turn.ts` — turn management, event types
- `packages/core/src/core/nextSpeakerChecker.ts` — next-speaker LLM check
- `packages/core/src/services/loopDetectionService.ts` — loop detection
  strategies
- `packages/core/src/tools/tool-registry.ts` — tool registry and qualification
- `packages/core/src/tools/activate-skill.ts` — skill activation tool
- `packages/core/src/services/` (other services) — telemetry, compression,
  grounding

**Resolution approach:**

1. Diff each file independently: `git diff HEAD upstream/main -- <file>`
2. Identify whether the upstream change is additive (new feature) or modifies
   existing logic.
3. If the fork has a custom change in the same region: apply upstream's intent
   manually, preserving the fork's customization.
4. Example: if both upstream and the fork modify `processTurn` — merge the logic
   blocks manually, keeping both sets of changes.
5. After each HIGH-risk file: `npm run build` to catch compile errors early.
6. After all HIGH-risk files: `npm run build && npm run test && npm run lint`.

**Escalation**: If a HIGH-risk conflict is too complex to resolve safely,
consider cherry-picking only the specific upstream commits you need rather than
a full merge:

```bash
git cherry-pick <upstream-commit-sha>
```

---

## Special Cases

### Security patches

Security patches arrive in any tier. When an upstream commit message contains
`fix(security)`, `CVE-`, or `vuln`:

- Treat it as HIGH priority regardless of which files it touches
- Apply it immediately, even if it conflicts with fork customizations
- Resolve in favor of the security fix; adapt your customization to work with it

### Breaking API changes

If upstream changes a public API (TypeScript interface, tool schema, settings
key):

- Search the fork for all usages: `grep -r "OldApiName" packages/`
- Update all usages before merging the API change
- Check the upstream CHANGELOG or release notes for a migration guide

### Upstream revert commits

If upstream reverted a feature the fork depends on:

- The conflict will show as the fork adding lines that upstream deleted
- Evaluate whether to keep the fork's version or remove the dependency
- Document the decision in the fork's internal changelog
