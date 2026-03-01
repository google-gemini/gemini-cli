# Merge Strategies

Concrete techniques for common upstream sync scenarios.

---

## Choosing the Right Integration Strategy

| Scenario                           | Strategy              | Command                    |
| ---------------------------------- | --------------------- | -------------------------- |
| Sync to latest upstream main       | Merge                 | `git merge upstream/main`  |
| Backport a single upstream fix     | Cherry-pick           | `git cherry-pick <sha>`    |
| Apply a security patch urgently    | Cherry-pick           | `git cherry-pick <sha>`    |
| Reorganize fork history (advanced) | Rebase (with caution) | `git rebase upstream/main` |

**Prefer merge over rebase for forks.** Merge preserves the fork's commit
history, keeps `git blame` accurate, and avoids rewriting SHAs (which requires
force-push and invalidates existing PR reviews). Rebase is only appropriate if
the fork team has agreed to rewrite history and all open PRs/branches are
rebased simultaneously.

---

## Step-by-Step: Full Upstream Merge

```bash
# 1. Ensure upstream remote exists
git remote add upstream https://github.com/google-gemini/gemini-cli.git  # skip if exists

# 2. Fetch latest upstream
git fetch upstream

# 3. Create a sync branch off the current fork branch
git checkout -b sync/upstream-$(date +%Y%m%d) <your-fork-branch>

# 4. Merge upstream main (may open conflict editor)
git merge upstream/main

# 5. Resolve conflicts (see below)

# 6. Run tests
npm run build && npm run test

# 7. Merge back into your fork branch
git checkout <your-fork-branch>
git merge sync/upstream-$(date +%Y%m%d) --no-ff -m "chore: sync with upstream $(date +%Y-%m-%d)"

# 8. Push
git push origin <your-fork-branch>
```

---

## Resolving Common Conflict Types

### `package-lock.json`

**Always take upstream's version:**

```bash
git checkout --theirs package-lock.json
npm install   # Regenerate with any fork-specific deps added back
git add package-lock.json
```

Do not manually edit `package-lock.json` — it is auto-generated.

### `schemas/settings.schema.json`

Both upstream and the fork may have added new properties. Merge both:

1. Open the file in an editor
2. Keep **all** `properties` entries from both sides
3. If both modified the same property: prefer upstream's version unless the fork
   has a valid security reason to differ
4. Validate the JSON:
   `node -e "JSON.parse(require('fs').readFileSync('schemas/settings.schema.json','utf8'))"`

### `packages/core/src/core/client.ts`

This is the highest-risk file. Steps:

1. Generate a three-way diff:
   `git diff HEAD upstream/main -- packages/core/src/core/client.ts`
2. Identify the upstream change's intent (read commit message:
   `git log upstream/main --oneline -- packages/core/src/core/client.ts | head -5`)
3. Apply upstream's logic to the fork's version manually — do not blindly take
   either side
4. Compile immediately: `npx tsc --noEmit`
5. Run core tests: `npx vitest run packages/core/src/core/client.test.ts`

### Loop detection (`loopDetectionService.ts`, `nextSpeakerChecker.ts`)

These files are sensitive because enterprise forks sometimes tune loop
thresholds or add custom detection logic.

1. Note which constants/thresholds the fork changed (e.g.,
   `LLM_CHECK_AFTER_TURNS`)
2. After merging, verify the fork's tuned values are still present
3. Run: `npx vitest run packages/core/src/services/loopDetectionService.test.ts`

### Tool definitions (`coreTools.ts`, `tool-registry.ts`)

Upstream may add new tools the fork wants to exclude:

1. Merge upstream changes
2. Check if any newly added tools should be in the fork's `excludeTools` list
3. Update `gemini-extension.json` if needed

### `packages/cli/src/ui/` (UI components)

If the fork has theme customizations:

1. Take upstream's structural changes
2. Re-apply fork's colour/style overrides using the extension `themes` mechanism
   instead of in-source changes (this is also an opportunity to migrate away
   from the fork change)

---

## Cherry-Picking Specific Upstream Commits

Use this when you need one upstream fix without taking everything in
`upstream/main`:

```bash
# Find the commit SHA
git log upstream/main --oneline | grep "fix(security)"

# Cherry-pick it
git cherry-pick <sha>

# If conflicts arise, resolve and continue
git cherry-pick --continue

# Or abort and try a different approach
git cherry-pick --abort
```

**Caution**: Cherry-picked commits create divergent history. If you later do a
full merge, Git may re-introduce the same changes as conflicts. Always note
which upstream commits have been cherry-picked in your fork's internal
changelog.

---

## Post-Merge Validation Checklist

```bash
# Build
npm run build

# Full test suite
npm run test

# Lint
npm run lint

# Manual smoke test
gemini --help                         # CLI starts
echo "list files" | gemini            # Basic session works
gemini mcp list                       # MCP configuration loads
gemini skills list                    # Skills discovered
```

Also verify:

- [ ] Fork's custom MCP servers connect successfully
- [ ] Fork's custom `contextFileName` loads in sessions
- [ ] Any excluded tools remain excluded
- [ ] Approval mode behaves as configured
- [ ] Any fork-specific loop detection thresholds are still in place

---

## Maintaining a Fork Health Log

After each sync, append to a `FORK_SYNC_LOG.md` in your fork:

```markdown
## Sync: 2026-03-01

- Upstream version: v0.31.0 (commit abc1234)
- Fork branch: acme/main
- Commits behind before sync: 47
- Conflicts resolved:
  - `client.ts`: Kept fork's MAX_CONSECUTIVE_CONTINUATIONS=5 (vs upstream 10)
  - `settings.schema.json`: Merged both property sets
- Test result: ✅ 127 passed
- Notes: Upstream added web-fetch timeout setting — adopted as-is
```

This log is invaluable context for the next sync cycle and for onboarding new
team members to the fork.
