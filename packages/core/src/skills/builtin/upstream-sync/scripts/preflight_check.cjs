#!/usr/bin/env node
/**
 * preflight_check.cjs
 *
 * Validates all pre-merge preconditions before an upstream sync attempt.
 * Run this FIRST — it prevents common mistakes that cause messy merges.
 *
 * Usage:
 *   node preflight_check.cjs [--upstream-remote <name>] [--upstream-branch <name>]
 *
 * Exit codes:
 *   0 — all checks passed (safe to proceed)
 *   1 — one or more checks failed (do not proceed until resolved)
 */

'use strict';

const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const upstreamRemoteIdx = args.indexOf('--upstream-remote');
const upstreamBranchIdx = args.indexOf('--upstream-branch');
const UPSTREAM_REMOTE = upstreamRemoteIdx !== -1 ? args[upstreamRemoteIdx + 1] : 'upstream';
const UPSTREAM_BRANCH = upstreamBranchIdx !== -1 ? args[upstreamBranchIdx + 1] : 'main';
const UPSTREAM_REF = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function git(gitArgs) {
  const r = spawnSync('git', gitArgs, { encoding: 'utf8', cwd: process.cwd() });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function npm(npmArgs) {
  const r = spawnSync('npm', npmArgs, {
    encoding: 'utf8',
    cwd: process.cwd(),
    shell: true,
  });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
const WARN = '⚠️  WARN';
const INFO = 'ℹ️  INFO';

const results = [];

function check(label, status, detail = '') {
  results.push({ label, status, detail });
}

// ---------------------------------------------------------------------------
// CHECK 1: Inside a git repository
// ---------------------------------------------------------------------------
const insideGit = git(['rev-parse', '--git-dir']);
if (!insideGit.ok) {
  console.error('ERROR: Not inside a git repository. Run this from the fork root.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CHECK 2: upstream remote exists
// ---------------------------------------------------------------------------
const remotes = git(['remote']).stdout.split('\n').map(s => s.trim());
if (remotes.includes(UPSTREAM_REMOTE)) {
  check(`Upstream remote "${UPSTREAM_REMOTE}" exists`, PASS);
} else {
  check(
    `Upstream remote "${UPSTREAM_REMOTE}" exists`,
    FAIL,
    `Fix: git remote add ${UPSTREAM_REMOTE} https://github.com/google-gemini/gemini-cli.git`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 3: upstream remote is reachable (fetch --dry-run)
// ---------------------------------------------------------------------------
process.stderr.write(`Checking ${UPSTREAM_REMOTE} reachability...\n`);
const fetchDry = git(['fetch', '--dry-run', UPSTREAM_REMOTE]);
if (fetchDry.ok) {
  check(`Upstream remote "${UPSTREAM_REMOTE}" is reachable`, PASS);
} else {
  check(
    `Upstream remote "${UPSTREAM_REMOTE}" is reachable`,
    WARN,
    'Could not reach upstream. Check network/VPN. Continuing with cached remote state.',
  );
}

// ---------------------------------------------------------------------------
// CHECK 4: working tree is clean (no uncommitted changes)
// ---------------------------------------------------------------------------
const status = git(['status', '--porcelain']);
if (status.stdout === '') {
  check('Working tree is clean (no uncommitted changes)', PASS);
} else {
  const lines = status.stdout.split('\n').slice(0, 5).join('\n    ');
  check(
    'Working tree is clean (no uncommitted changes)',
    FAIL,
    `Uncommitted changes found:\n    ${lines}\n    Fix: git stash  or  git commit -am "WIP: stash before sync"`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 5: no untracked files that could conflict
// ---------------------------------------------------------------------------
const untracked = git(['ls-files', '--others', '--exclude-standard']).stdout;
const untrackedLines = untracked ? untracked.split('\n').filter(Boolean) : [];
const riskExtensions = /\.(ts|js|json|md)$/;
const riskyUntracked = untrackedLines.filter(f => riskExtensions.test(f));
if (riskyUntracked.length === 0) {
  check('No risky untracked files (*.ts, *.js, *.json, *.md)', PASS);
} else {
  check(
    'No risky untracked files (*.ts, *.js, *.json, *.md)',
    WARN,
    `${riskyUntracked.length} untracked source file(s) could cause confusion after merge:\n    ${riskyUntracked.slice(0, 5).join('\n    ')}`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 6: current branch is not main/master (protect the main branch)
// ---------------------------------------------------------------------------
const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
if (!['main', 'master', 'develop'].includes(currentBranch)) {
  check(`Not on a protected branch (current: ${currentBranch})`, PASS);
} else {
  check(
    `Not on a protected branch (current: ${currentBranch})`,
    WARN,
    `You are on "${currentBranch}". Create a sync branch first:\n    git checkout -b sync/upstream-$(date +%Y%m%d)`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 7: backup tag exists
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const tags = git(['tag', '--list', `backup/before-upstream-sync-*`]).stdout;
const hasBackupTag = tags.includes('backup/before-upstream-sync-');
if (hasBackupTag) {
  const latestTag = tags.split('\n').filter(Boolean).pop();
  check(`Backup tag exists (${latestTag})`, PASS);
} else {
  check(
    'Backup tag exists',
    FAIL,
    `No backup tag found. Create one before merging:\n    git tag backup/before-upstream-sync-${today}`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 8: how far behind upstream
// ---------------------------------------------------------------------------
// Fetch quietly to get current remote state
git(['fetch', UPSTREAM_REMOTE]);
const behind = git(['rev-list', '--count', `HEAD..${UPSTREAM_REF}`]);
const ahead = git(['rev-list', '--count', `${UPSTREAM_REF}..HEAD`]);
const behindCount = parseInt(behind.stdout || '0', 10);
const aheadCount = parseInt(ahead.stdout || '0', 10);

if (behindCount === 0) {
  check('Fork is up to date with upstream', PASS, 'No sync needed.');
} else if (behindCount <= 20) {
  check(
    `Fork is ${behindCount} commit(s) behind upstream`,
    PASS,
    `${aheadCount} fork-only commit(s). Low-volume sync — should be straightforward.`,
  );
} else if (behindCount <= 100) {
  check(
    `Fork is ${behindCount} commit(s) behind upstream`,
    WARN,
    `${aheadCount} fork-only commit(s). Medium-volume sync — run analyze_upstream.cjs before proceeding.`,
  );
} else {
  check(
    `Fork is ${behindCount} commit(s) behind upstream`,
    FAIL,
    `${aheadCount} fork-only commit(s). Very large sync — high conflict risk. Consider cherry-picking only critical upstream commits first.`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 9: no active merge/rebase/cherry-pick in progress
// ---------------------------------------------------------------------------
const mergeHead = git(['rev-parse', '--verify', 'MERGE_HEAD']);
const rebaseDir = spawnSync('test', ['-d', '.git/rebase-merge'], { shell: true });
const cherryPick = git(['rev-parse', '--verify', 'CHERRY_PICK_HEAD']);

if (!mergeHead.ok && rebaseDir.status !== 0 && !cherryPick.ok) {
  check('No merge/rebase/cherry-pick in progress', PASS);
} else {
  const inProgress = mergeHead.ok
    ? 'merge'
    : rebaseDir.status === 0
      ? 'rebase'
      : 'cherry-pick';
  check(
    'No merge/rebase/cherry-pick in progress',
    FAIL,
    `A ${inProgress} is already in progress. Finish or abort it first:\n    git ${inProgress} --abort`,
  );
}

// ---------------------------------------------------------------------------
// CHECK 10: node_modules exists (dependencies installed)
// ---------------------------------------------------------------------------
const { existsSync } = require('fs');
if (existsSync('node_modules')) {
  check('node_modules present (dependencies installed)', PASS);
} else {
  check(
    'node_modules present (dependencies installed)',
    FAIL,
    'Run: npm install',
  );
}

// ---------------------------------------------------------------------------
// CHECK 11: upstream branch exists on remote
// ---------------------------------------------------------------------------
const upstreamBranchExists = git(['ls-remote', '--heads', UPSTREAM_REMOTE, UPSTREAM_BRANCH]);
if (upstreamBranchExists.stdout.includes(UPSTREAM_BRANCH)) {
  check(`Upstream branch "${UPSTREAM_BRANCH}" exists on remote`, PASS);
} else {
  check(
    `Upstream branch "${UPSTREAM_BRANCH}" exists on remote`,
    WARN,
    `Could not confirm "${UPSTREAM_BRANCH}" on "${UPSTREAM_REMOTE}". Check: git remote show ${UPSTREAM_REMOTE}`,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const LINE = '─'.repeat(72);
const DLINE = '═'.repeat(72);

console.log('\n' + DLINE);
console.log('  UPSTREAM SYNC PRE-MERGE CHECKLIST');
console.log(DLINE);
console.log(`  Fork branch:  ${currentBranch}`);
console.log(`  Upstream ref: ${UPSTREAM_REF}`);
console.log('');

let failures = 0;
let warnings = 0;

for (const { label, status, detail } of results) {
  console.log(`  ${status}  ${label}`);
  if (detail) {
    detail.split('\n').forEach(l => console.log(`         ${l}`));
  }
  if (status === FAIL) failures++;
  if (status === WARN) warnings++;
}

console.log('');
console.log(DLINE);
console.log('  RESULT');
console.log(LINE);

if (failures === 0 && warnings === 0) {
  console.log('  ✅ All checks passed. Safe to proceed with the sync.');
  console.log('     Next: node analyze_upstream.cjs | node generate_merge_plan.cjs');
} else if (failures === 0) {
  console.log(`  ⚠️  ${warnings} warning(s), 0 failures. Review warnings above, then proceed with care.`);
  console.log('     Next: node analyze_upstream.cjs | node generate_merge_plan.cjs');
} else {
  console.log(`  ❌ ${failures} check(s) FAILED, ${warnings} warning(s).`);
  console.log('     Resolve all FAIL items before starting the merge.');
}
console.log(DLINE + '\n');

process.exit(failures > 0 ? 1 : 0);
