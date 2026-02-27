#!/usr/bin/env node
/**
 * analyze_upstream.cjs
 *
 * Fetches and analyzes the difference between the current fork branch and
 * upstream/main, producing a risk-categorized report that drives the merge plan.
 *
 * Usage:
 *   node analyze_upstream.cjs [--no-fetch] [--upstream-remote <name>] [--upstream-branch <name>]
 *
 * Options:
 *   --no-fetch              Skip `git fetch upstream` (use cached remote state)
 *   --upstream-remote       Remote name for upstream (default: upstream)
 *   --upstream-branch       Branch name on upstream (default: main)
 *
 * Output is written to stdout (suitable for piping into generate_merge_plan.cjs).
 */

'use strict';

const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Risk classification rules
// Applied in order; first match wins.
// ---------------------------------------------------------------------------
const RISK_RULES = [
  // LOW: docs, tests, scripts, markdown
  { pattern: /^docs\//, risk: 'LOW', area: 'Documentation' },
  { pattern: /\.(test|spec)\.(ts|js)$/, risk: 'LOW', area: 'Tests' },
  { pattern: /^scripts\//, risk: 'LOW', area: 'Build scripts' },
  { pattern: /^\.github\//, risk: 'LOW', area: 'CI/GitHub config' },
  { pattern: /\.(md|txt|rst)$/i, risk: 'LOW', area: 'Documentation' },
  { pattern: /^packages\/core\/src\/skills\/builtin\//, risk: 'LOW', area: 'Built-in skills' },
  { pattern: /CHANGELOG|RELEASE/, risk: 'LOW', area: 'Changelog' },

  // MEDIUM: config schema, new tools, CLI commands, dependencies
  { pattern: /settings\.schema\.json$/, risk: 'MEDIUM', area: 'Settings schema' },
  { pattern: /packages\/core\/src\/tools\/definitions\//, risk: 'MEDIUM', area: 'Tool definitions' },
  { pattern: /packages\/core\/src\/tools\/[^/]+\.(ts|js)$/, risk: 'MEDIUM', area: 'Built-in tools' },
  { pattern: /packages\/cli\/src\/commands\//, risk: 'MEDIUM', area: 'CLI commands' },
  { pattern: /packages\/core\/src\/config\//, risk: 'MEDIUM', area: 'Config loading' },
  { pattern: /packages\/cli\/src\/ui\//, risk: 'MEDIUM', area: 'UI components' },
  { pattern: /package\.json$/, risk: 'MEDIUM', area: 'Dependencies' },
  { pattern: /package-lock\.json$/, risk: 'MEDIUM', area: 'Lock file' },
  { pattern: /packages\/cli\/src\/config\/extension/, risk: 'MEDIUM', area: 'Extension config' },

  // HIGH: core loop, turn management, loop detection, tool registry
  { pattern: /packages\/core\/src\/core\/client\.(ts|js)$/, risk: 'HIGH', area: 'Core client (GeminiClient)' },
  { pattern: /packages\/core\/src\/core\/turn\.(ts|js)$/, risk: 'HIGH', area: 'Turn management' },
  { pattern: /packages\/core\/src\/core\/nextSpeaker/, risk: 'HIGH', area: 'Next-speaker checker' },
  { pattern: /packages\/core\/src\/services\/loopDetection/, risk: 'HIGH', area: 'Loop detection' },
  { pattern: /packages\/core\/src\/tools\/tool-registry/, risk: 'HIGH', area: 'Tool registry' },
  { pattern: /packages\/core\/src\/tools\/activate-skill/, risk: 'HIGH', area: 'Skill activation' },
  { pattern: /packages\/core\/src\/services\//, risk: 'HIGH', area: 'Core services' },

  // Default
  { pattern: /\.(ts|js|cjs|mjs)$/, risk: 'MEDIUM', area: 'Source code' },
];

function classify(filePath) {
  for (const rule of RISK_RULES) {
    if (rule.pattern.test(filePath)) return { risk: rule.risk, area: rule.area };
  }
  return { risk: 'LOW', area: 'Other' };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function git(args, opts = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', cwd: process.cwd(), ...opts });
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  return { stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim(), status: result.status };
}

function hasRemote(name) {
  const { stdout } = git(['remote']);
  return stdout.split('\n').map(s => s.trim()).includes(name);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const noFetch = args.includes('--no-fetch');
  const upstreamRemoteIdx = args.indexOf('--upstream-remote');
  const upstreamBranchIdx = args.indexOf('--upstream-branch');
  const upstreamRemote = upstreamRemoteIdx !== -1 ? args[upstreamRemoteIdx + 1] : 'upstream';
  const upstreamBranch = upstreamBranchIdx !== -1 ? args[upstreamBranchIdx + 1] : 'main';
  const upstreamRef = `${upstreamRemote}/${upstreamBranch}`;

  const LINE = '─'.repeat(72);

  // Check upstream remote
  if (!hasRemote(upstreamRemote)) {
    console.error(`ERROR: Remote "${upstreamRemote}" not found.`);
    console.error(`Add it with:`);
    console.error(`  git remote add ${upstreamRemote} https://github.com/google-gemini/gemini-cli.git`);
    process.exit(1);
  }

  // Fetch upstream
  if (!noFetch) {
    process.stderr.write(`Fetching ${upstreamRemote}...\n`);
    const fetchResult = git(['fetch', upstreamRemote]);
    if (fetchResult.status !== 0) {
      console.error(`ERROR: git fetch ${upstreamRemote} failed:\n${fetchResult.stderr}`);
      process.exit(1);
    }
  }

  // Current branch
  const { stdout: currentBranch } = git(['rev-parse', '--abbrev-ref', 'HEAD']);

  // Commits the fork has that upstream doesn't (fork-only)
  const { stdout: forkOnlyRaw } = git(['log', `${upstreamRef}..HEAD`, '--oneline']);
  const forkOnlyCommits = forkOnlyRaw ? forkOnlyRaw.split('\n').filter(Boolean) : [];

  // Commits upstream has that the fork doesn't (behind)
  const { stdout: upstreamOnlyRaw } = git(['log', `HEAD..${upstreamRef}`, '--oneline']);
  const upstreamOnlyCommits = upstreamOnlyRaw ? upstreamOnlyRaw.split('\n').filter(Boolean) : [];

  // Changed files (symmetric diff)
  const { stdout: changedFilesRaw } = git(['diff', `HEAD...${upstreamRef}`, '--name-only']);
  const changedFiles = changedFilesRaw ? changedFilesRaw.split('\n').filter(Boolean) : [];

  // Categorize
  const byRisk = { HIGH: [], MEDIUM: [], LOW: [] };
  const areaCount = {};

  for (const file of changedFiles) {
    const { risk, area } = classify(file);
    byRisk[risk].push({ file, area });
    areaCount[area] = (areaCount[area] || 0) + 1;
  }

  // Top areas
  const topAreas = Object.entries(areaCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ---------------------------------------------------------------------------
  // Output report (stdout — pipeable to generate_merge_plan.cjs)
  // ---------------------------------------------------------------------------
  const report = [];
  const emit = (...lines) => lines.forEach(l => report.push(l));

  emit(LINE);
  emit('  UPSTREAM SYNC ANALYSIS REPORT');
  emit(LINE);
  emit(`  Fork branch:    ${currentBranch}`);
  emit(`  Upstream ref:   ${upstreamRef}`);
  emit(`  Commits behind: ${upstreamOnlyCommits.length}`);
  emit(`  Fork-only commits: ${forkOnlyCommits.length}`);
  emit(`  Files changed:  ${changedFiles.length}`);
  emit('');

  if (upstreamOnlyCommits.length === 0) {
    emit('  ✅ Fork is up to date with upstream. No sync needed.');
    emit(LINE);
    console.log(report.join('\n'));
    return;
  }

  // Recent upstream commits
  emit('  RECENT UPSTREAM COMMITS (newest first)');
  emit(LINE);
  upstreamOnlyCommits.slice(0, 15).forEach(c => emit(`  ${c}`));
  if (upstreamOnlyCommits.length > 15) emit(`  ... and ${upstreamOnlyCommits.length - 15} more`);
  emit('');

  // Top changed areas
  emit('  TOP CHANGED AREAS');
  emit(LINE);
  topAreas.forEach(([area, count]) => emit(`  ${String(count).padStart(3)}  ${area}`));
  emit('');

  // Risk breakdown
  for (const risk of ['HIGH', 'MEDIUM', 'LOW']) {
    const items = byRisk[risk];
    if (items.length === 0) continue;
    const label = risk === 'HIGH' ? '⚠️  HIGH RISK' : risk === 'MEDIUM' ? '⚡ MEDIUM RISK' : '✅ LOW RISK';
    emit(`  ${label} — ${items.length} file(s)`);
    emit(LINE);
    for (const { file, area } of items) {
      emit(`  [${area}] ${file}`);
    }
    emit('');
  }

  // Summary line (machine-parseable for generate_merge_plan.cjs)
  emit(LINE);
  emit('  SUMMARY');
  emit(LINE);
  emit(`  BEHIND=${upstreamOnlyCommits.length}`);
  emit(`  HIGH=${byRisk.HIGH.length}`);
  emit(`  MEDIUM=${byRisk.MEDIUM.length}`);
  emit(`  LOW=${byRisk.LOW.length}`);
  emit(`  TOTAL_FILES=${changedFiles.length}`);

  if (byRisk.HIGH.length > 0) {
    emit('');
    emit('  ⚠️  This sync contains HIGH-risk changes. Review carefully before merging.');
    emit('     Run: node generate_merge_plan.cjs to get a step-by-step plan.');
  } else if (byRisk.MEDIUM.length > 0) {
    emit('');
    emit('  ⚡ MEDIUM-risk changes present. Review tool definitions and settings schema.');
    emit('     Run: node generate_merge_plan.cjs to get a step-by-step plan.');
  } else {
    emit('');
    emit('  ✅ Only LOW-risk changes. This sync should be straightforward.');
    emit('     Merge with: git merge upstream/main');
  }
  emit(LINE);

  console.log(report.join('\n'));
}

main();
