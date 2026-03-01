#!/usr/bin/env node
/**
 * generate_merge_plan.cjs
 *
 * Reads the output from analyze_upstream.cjs (via stdin or a file) and
 * generates a numbered, risk-ordered merge plan.
 *
 * Usage:
 *   node analyze_upstream.cjs | node generate_merge_plan.cjs
 *   node generate_merge_plan.cjs --report <path/to/report.txt>
 *   node generate_merge_plan.cjs   (reads from stdin)
 *
 * Options:
 *   --report <path>    Read analysis report from file instead of stdin
 *   --upstream-remote  Remote name (default: upstream)
 *   --upstream-branch  Branch name (default: main)
 */

'use strict';

const fs = require('fs');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Parse the summary block from the analysis report
// ---------------------------------------------------------------------------
function parseSummary(lines) {
  const summary = { behind: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const line of lines) {
    const t = line.trim();
    const m = (key) => { const r = t.match(new RegExp(`^${key}=(\\d+)$`)); return r ? parseInt(r[1], 10) : null; };
    if (m('BEHIND') !== null) summary.behind = m('BEHIND');
    if (m('HIGH') !== null) summary.high = m('HIGH');
    if (m('MEDIUM') !== null) summary.medium = m('MEDIUM');
    if (m('LOW') !== null) summary.low = m('LOW');
    if (m('TOTAL_FILES') !== null) summary.total = m('TOTAL_FILES');
  }
  return summary;
}

// Parse HIGH/MEDIUM/LOW file lists from the report
function parseFilesByRisk(lines) {
  const byRisk = { HIGH: [], MEDIUM: [], LOW: [] };
  let currentRisk = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.includes('HIGH RISK')) { currentRisk = 'HIGH'; continue; }
    if (t.includes('MEDIUM RISK')) { currentRisk = 'MEDIUM'; continue; }
    if (t.includes('LOW RISK')) { currentRisk = 'LOW'; continue; }
    if (t.startsWith('SUMMARY') || t.startsWith('UPSTREAM SYNC') || t.startsWith('TOP CHANGED') || t.startsWith('RECENT UPSTREAM')) {
      currentRisk = null;
      continue;
    }
    if (currentRisk && t.startsWith('[') && t.includes(']')) {
      // Format: [Area] path/to/file
      const m = t.match(/^\[([^\]]+)\]\s+(.+)$/);
      if (m) byRisk[currentRisk].push({ area: m[1], file: m[2] });
    }
  }
  return byRisk;
}

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------
function generatePlan(summary, byRisk, upstreamRemote, upstreamBranch) {
  const upstreamRef = `${upstreamRemote}/${upstreamBranch}`;
  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const LINE = '═'.repeat(72);
  const line = '─'.repeat(72);
  const steps = [];
  let stepNum = 1;

  const step = (title, commands, notes = []) => {
    steps.push({ num: stepNum++, title, commands, notes });
  };

  // Always: backup + fetch
  step(
    'Create a backup tag',
    [`git tag backup/before-upstream-sync-${dateTag}`],
    ['This lets you recover quickly if anything goes wrong.'],
  );

  step(
    'Fetch latest upstream',
    [`git fetch ${upstreamRemote}`],
  );

  step(
    'Create a sync working branch',
    [
      `git checkout -b sync/upstream-${dateTag}`,
    ],
    ['Work on this branch; merge back into your main fork branch at the end.'],
  );

  step(
    'Start the merge',
    [`git merge ${upstreamRef}`],
    ['Git will open an editor for any auto-merge conflicts. If there are none, it will proceed automatically.'],
  );

  // LOW risk tier
  if (byRisk.LOW.length > 0) {
    const files = byRisk.LOW.map(f => `  • ${f.file}`).join('\n');
    step(
      `Resolve LOW-risk files (${byRisk.LOW.length} file(s))`,
      ['# For each file below, accept upstream changes:', 'git checkout --theirs <file>', 'git add <file>'],
      [
        'LOW-risk files: docs, tests, scripts, built-in skills.',
        'Simply take upstream\'s version unless you have explicit changes here.',
        '',
        'Files to review:',
        files,
      ],
    );

    step(
      'Run tests after LOW-risk tier',
      ['npm run build', 'npm run test'],
      ['Do not proceed to the next tier until all tests pass.'],
    );
  }

  // MEDIUM risk tier
  if (byRisk.MEDIUM.length > 0) {
    const lockFiles = byRisk.MEDIUM.filter(f => f.file.includes('package-lock'));
    const schemaFiles = byRisk.MEDIUM.filter(f => f.file.includes('settings.schema'));
    const otherMedium = byRisk.MEDIUM.filter(f => !lockFiles.includes(f) && !schemaFiles.includes(f));

    if (lockFiles.length > 0) {
      step(
        'Handle package-lock.json (always take upstream)',
        [
          'git checkout --theirs package-lock.json',
          'npm install',
          'git add package-lock.json',
        ],
        ['Never manually edit package-lock.json — let npm regenerate it.'],
      );
    }

    if (schemaFiles.length > 0) {
      step(
        'Merge settings.schema.json (keep both property sets)',
        [
          '# Open the file and merge both upstream and fork property additions.',
          '# Validate JSON after editing:',
          'node -e "JSON.parse(require(\'fs\').readFileSync(\'schemas/settings.schema.json\',\'utf8\'))"',
          'git add schemas/settings.schema.json',
        ],
        [
          'Do NOT simply take upstream\'s version — the fork may have added custom settings.',
          'Keep all properties from both sides. When the same property exists in both, prefer upstream\'s.',
        ],
      );
    }

    if (otherMedium.length > 0) {
      const files = otherMedium.map(f => `  • [${f.area}] ${f.file}`).join('\n');
      step(
        `Review remaining MEDIUM-risk files (${otherMedium.length} file(s))`,
        [
          '# For each file, diff carefully before deciding:',
          `git diff HEAD ${upstreamRef} -- <file>`,
          '# Then either accept upstream or manually merge:',
          'git checkout --theirs <file>   # take upstream',
          'git add <file>',
        ],
        [
          'MEDIUM-risk files include new tools, CLI commands, and UI components.',
          'Check whether any newly added tools should be excluded in your extension.',
          '',
          'Files to review:',
          files,
        ],
      );
    }

    step(
      'Run tests after MEDIUM-risk tier',
      ['npm run build', 'npm run test', 'npm run lint'],
      ['Do not proceed to HIGH-risk files until this tier is clean.'],
    );
  }

  // HIGH risk tier
  if (byRisk.HIGH.length > 0) {
    const files = byRisk.HIGH.map(f => `  • [${f.area}] ${f.file}`).join('\n');
    step(
      `Review HIGH-risk files (${byRisk.HIGH.length} file(s)) — one at a time`,
      [
        '# For each file, inspect the upstream intent:',
        `git log ${upstreamRef} --oneline -- <file> | head -10`,
        `git diff HEAD ${upstreamRef} -- <file>`,
        '',
        '# Apply changes manually — do NOT blindly take either side.',
        '# After each file, compile to catch errors early:',
        'npx tsc --noEmit',
        'git add <file>',
      ],
      [
        '⚠️  HIGH-risk files include core loop logic, turn management, and loop detection.',
        'Any fork customizations in these files (e.g., tuned thresholds, custom logic) must',
        'be carefully preserved while incorporating upstream improvements.',
        '',
        'Files to review:',
        files,
      ],
    );

    step(
      'Full validation after HIGH-risk tier',
      ['npm run build', 'npm run test', 'npm run lint'],
      ['All tests must pass before proceeding.'],
    );
  }

  // Finalize
  step(
    'Commit the merge resolution',
    [
      `git commit -m "chore: sync with upstream ${upstreamRef} (${dateTag})"`,
    ],
    ['If the merge was auto-committed by git merge, this step is already done.'],
  );

  step(
    'Run smoke tests',
    [
      'gemini --help',
      'gemini mcp list',
      'gemini skills list',
    ],
    [
      'Verify the CLI starts, MCP servers load, and skills are discovered.',
      'Also test your fork\'s custom tools and any excluded tools remain excluded.',
    ],
  );

  step(
    'Merge sync branch back and push',
    [
      'git checkout <your-fork-branch>',
      `git merge sync/upstream-${dateTag} --no-ff -m "chore: merge upstream sync ${dateTag}"`,
      'git push origin <your-fork-branch>',
    ],
  );

  step(
    'Tag the sync point and update the fork sync log',
    [
      `git tag upstream-sync/${dateTag}`,
    ],
    [
      'Append an entry to FORK_SYNC_LOG.md documenting:',
      '  - Upstream commit SHA merged',
      '  - Number of commits behind before sync',
      '  - Conflicts resolved and decisions made',
      '  - Test result',
      'See references/merge-strategies.md for a log template.',
    ],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const out = [];
  out.push('');
  out.push(LINE);
  out.push('  UPSTREAM SYNC MERGE PLAN');
  out.push(LINE);
  out.push(`  Commits to merge: ${summary.behind}`);
  out.push(`  Files changed:    ${summary.total} (HIGH: ${summary.high}, MEDIUM: ${summary.medium}, LOW: ${summary.low})`);
  out.push(`  Total steps:      ${steps.length}`);
  out.push('');

  for (const s of steps) {
    out.push(`  STEP ${s.num}: ${s.title}`);
    out.push(line);
    if (s.commands.length > 0) {
      out.push('  Commands:');
      s.commands.forEach(c => out.push(`    $ ${c}`));
    }
    if (s.notes.length > 0) {
      out.push('  Notes:');
      s.notes.forEach(n => out.push(`    ${n}`));
    }
    out.push('');
  }

  out.push(LINE);
  out.push('  End of merge plan. Good luck!');
  out.push('  Refer to references/merge-strategies.md for detailed conflict resolution guidance.');
  out.push(LINE);
  out.push('');

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf('--report');
  const reportFile = reportIdx !== -1 ? args[reportIdx + 1] : null;
  const upstreamRemoteIdx = args.indexOf('--upstream-remote');
  const upstreamBranchIdx = args.indexOf('--upstream-branch');
  const upstreamRemote = upstreamRemoteIdx !== -1 ? args[upstreamRemoteIdx + 1] : 'upstream';
  const upstreamBranch = upstreamBranchIdx !== -1 ? args[upstreamBranchIdx + 1] : 'main';

  let lines;
  if (reportFile) {
    if (!require('fs').existsSync(reportFile)) {
      console.error(`ERROR: report file not found: ${reportFile}`);
      process.exit(1);
    }
    lines = fs.readFileSync(reportFile, 'utf8').split('\n');
  } else {
    // Read from stdin
    lines = [];
    const rl = readline.createInterface({ input: process.stdin });
    await new Promise(resolve => {
      rl.on('line', l => lines.push(l));
      rl.on('close', resolve);
    });
  }

  if (lines.length === 0) {
    console.error('ERROR: No input received. Pipe the output of analyze_upstream.cjs or provide --report <file>.');
    process.exit(1);
  }

  const summary = parseSummary(lines);
  const byRisk = parseFilesByRisk(lines);

  if (summary.behind === 0 && summary.total === 0) {
    console.log('Fork appears to be up to date with upstream. No merge plan needed.');
    process.exit(0);
  }

  console.log(generatePlan(summary, byRisk, upstreamRemote, upstreamBranch));
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
