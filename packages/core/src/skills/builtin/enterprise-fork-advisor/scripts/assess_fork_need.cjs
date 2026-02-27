#!/usr/bin/env node
/**
 * assess_fork_need.cjs
 *
 * Analyzes the diff between an enterprise fork and upstream/main and categorizes
 * each changed file into one of four buckets:
 *
 *   AVOIDABLE_VIA_CONFIG      — expressible in settings.json or policy TOML
 *   AVOIDABLE_VIA_EXTENSION   — belongs in a gemini-extension.json bundle
 *   AVOIDABLE_VIA_MCP         — custom tool that should be an MCP server
 *   REQUIRES_FORK             — genuine core-logic change, no config equivalent
 *
 * Usage:
 *   node assess_fork_need.cjs [--diff <path/to/patch.diff>]
 *
 * If --diff is not provided the script runs `git diff upstream/main..HEAD`
 * in the current working directory.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Categorisation rules — ordered from most specific to least specific.
// Each rule: { pattern: RegExp, bucket: string, reason: string }
// ---------------------------------------------------------------------------
const RULES = [
  // Config-avoidable: schema / settings
  {
    pattern: /settings\.schema\.json/,
    bucket: 'AVOIDABLE_VIA_CONFIG',
    reason: 'Settings schema change — add the new field to your settings.json instead of modifying the schema.',
  },
  {
    pattern: /\/config\/(config|storage|settings)\.(ts|js)/,
    bucket: 'AVOIDABLE_VIA_CONFIG',
    reason: 'Config loading logic — prefer workspace/user settings.json or system-level policy TOML.',
  },

  // Extension-avoidable: UI, themes, commands, context
  {
    pattern: /packages\/cli\/src\/ui\//,
    bucket: 'AVOIDABLE_VIA_EXTENSION',
    reason: 'UI theming change — use the `themes` field in gemini-extension.json instead.',
  },
  {
    pattern: /packages\/cli\/src\/commands\//,
    bucket: 'AVOIDABLE_VIA_EXTENSION',
    reason: 'Custom CLI command — consider bundling it as an MCP tool or extension contextFileName.',
  },
  {
    pattern: /gemini-extension\.json/,
    bucket: 'AVOIDABLE_VIA_EXTENSION',
    reason: 'Extension manifest change — create your own extension instead of modifying the built-in one.',
  },
  {
    pattern: /contextFileName|GEMINI\.md|context\.(md|txt)/i,
    bucket: 'AVOIDABLE_VIA_EXTENSION',
    reason: 'Context file change — use contextFileName in your extension or workspace GEMINI.md.',
  },

  // MCP-avoidable: custom tools
  {
    pattern: /packages\/core\/src\/tools\/(?!activate-skill|tools|tool-registry|definitions)/,
    bucket: 'AVOIDABLE_VIA_MCP',
    reason: 'Custom built-in tool — implement as an MCP server tool instead (no source change needed).',
  },
  {
    pattern: /mcp[-_]?(server|client|tool)/i,
    bucket: 'AVOIDABLE_VIA_MCP',
    reason: 'MCP-related change — configure via mcpServers in settings.json or an extension.',
  },

  // High-risk core: requires fork
  {
    pattern: /packages\/core\/src\/core\/(client|turn|session)\.(ts|js)/,
    bucket: 'REQUIRES_FORK',
    reason: 'Core loop / session management — this is a genuine fork requirement. Consider opening an upstream issue.',
  },
  {
    pattern: /packages\/core\/src\/services\/loopDetection/,
    bucket: 'REQUIRES_FORK',
    reason: 'Loop detection logic — consider contributing your improvement upstream.',
  },
  {
    pattern: /packages\/core\/src\/core\/nextSpeaker/,
    bucket: 'REQUIRES_FORK',
    reason: 'Next-speaker logic — core behavioural change; open an upstream RFC.',
  },

  // Low-signal files — skip or note as informational
  {
    pattern: /package(-lock)?\.json$/,
    bucket: 'INFORMATIONAL',
    reason: 'Dependency change — review if any added deps can be moved to an MCP server process.',
  },
  {
    pattern: /\.(md|txt|rst)$/i,
    bucket: 'INFORMATIONAL',
    reason: 'Documentation change — no fork impact.',
  },
  {
    pattern: /\.(test|spec)\.(ts|js)$/,
    bucket: 'INFORMATIONAL',
    reason: 'Test file — no production impact.',
  },

  // Catch-all for .ts / .js source changes
  {
    pattern: /\.(ts|js|cjs|mjs)$/,
    bucket: 'REQUIRES_FORK',
    reason: 'TypeScript/JavaScript source change — verify whether this can be expressed as config or an extension.',
  },
];

function categorize(filePath) {
  for (const rule of RULES) {
    if (rule.pattern.test(filePath)) {
      return { bucket: rule.bucket, reason: rule.reason };
    }
  }
  return { bucket: 'INFORMATIONAL', reason: 'Unrecognized file type — manual review recommended.' };
}

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------
function extractChangedFiles(diffText) {
  const files = new Set();
  for (const line of diffText.split('\n')) {
    // "diff --git a/path/to/file b/path/to/file"
    // git quotes paths containing spaces as "a/path with spaces/file"
    const m = line.match(/^diff --git a\/((?:"[^"]*"|[^ ]+)) b\//);
    if (m) {
      // Strip surrounding quotes if present (git adds them for paths with spaces)
      const raw = m[1];
      files.add(raw.startsWith('"') ? raw.slice(1, -1) : raw);
    }
  }
  return [...files];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const diffIndex = args.indexOf('--diff');
  const diffFile = diffIndex !== -1 ? args[diffIndex + 1] : null;

  let diffText;
  if (diffFile) {
    if (!fs.existsSync(diffFile)) {
      console.error(`ERROR: diff file not found: ${diffFile}`);
      process.exit(1);
    }
    diffText = fs.readFileSync(diffFile, 'utf8');
  } else {
    // Run git diff in cwd
    const result = spawnSync('git', ['diff', 'upstream/main..HEAD'], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    if (result.error) {
      console.error('ERROR: Could not run git. Make sure you are inside the fork repository.');
      console.error('Tip: Add an upstream remote: git remote add upstream https://github.com/google-gemini/gemini-cli.git');
      process.exit(1);
    }
    if (result.status !== 0 && result.stderr) {
      console.error('git diff error:', result.stderr.trim());
      console.error('Ensure the upstream remote exists: git remote add upstream https://github.com/google-gemini/gemini-cli.git');
      process.exit(1);
    }
    diffText = result.stdout;
  }

  if (!diffText.trim()) {
    console.log('No differences found between your branch and upstream/main.');
    console.log('Your fork is either up-to-date or you may need to fetch upstream first:');
    console.log('  git remote add upstream https://github.com/google-gemini/gemini-cli.git');
    console.log('  git fetch upstream');
    process.exit(0);
  }

  const changedFiles = extractChangedFiles(diffText);
  if (changedFiles.length === 0) {
    console.log('Could not parse any file paths from the diff. Is this a valid unified diff?');
    process.exit(1);
  }

  // Categorize each file
  const buckets = {
    AVOIDABLE_VIA_CONFIG: [],
    AVOIDABLE_VIA_EXTENSION: [],
    AVOIDABLE_VIA_MCP: [],
    REQUIRES_FORK: [],
    INFORMATIONAL: [],
  };

  for (const file of changedFiles) {
    const { bucket, reason } = categorize(file);
    buckets[bucket].push({ file, reason });
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------
  const LINE = '─'.repeat(72);
  console.log('\n' + LINE);
  console.log('  ENTERPRISE FORK ASSESSMENT REPORT');
  console.log(LINE);
  console.log(`  Analyzed ${changedFiles.length} changed file(s)\n`);

  const order = ['AVOIDABLE_VIA_CONFIG', 'AVOIDABLE_VIA_EXTENSION', 'AVOIDABLE_VIA_MCP', 'REQUIRES_FORK', 'INFORMATIONAL'];
  const labels = {
    AVOIDABLE_VIA_CONFIG: '✅ AVOIDABLE — Use settings.json / policy TOML',
    AVOIDABLE_VIA_EXTENSION: '✅ AVOIDABLE — Use a Gemini CLI Extension',
    AVOIDABLE_VIA_MCP: '✅ AVOIDABLE — Use an MCP server',
    REQUIRES_FORK: '⚠️  REQUIRES FORK — Genuine core-logic change',
    INFORMATIONAL: 'ℹ️  INFORMATIONAL — No direct fork impact',
  };

  for (const bucket of order) {
    const items = buckets[bucket];
    if (items.length === 0) continue;
    console.log(`${labels[bucket]} (${items.length})`);
    console.log(LINE);
    for (const { file, reason } of items) {
      console.log(`  ${file}`);
      console.log(`    → ${reason}`);
    }
    console.log();
  }

  // Summary
  const avoidable =
    buckets.AVOIDABLE_VIA_CONFIG.length +
    buckets.AVOIDABLE_VIA_EXTENSION.length +
    buckets.AVOIDABLE_VIA_MCP.length;
  const forkRequired = buckets.REQUIRES_FORK.length;

  console.log(LINE);
  console.log('  SUMMARY');
  console.log(LINE);
  console.log(`  Avoidable (no fork needed): ${avoidable} file(s)`);
  console.log(`  Requires fork:              ${forkRequired} file(s)`);
  console.log();

  if (forkRequired === 0) {
    console.log('  ✅ Good news! All your customizations can be achieved without a fork.');
    console.log('     See references/configuration-examples.md for copy-paste config snippets.');
  } else {
    console.log(`  ⚠️  ${forkRequired} file(s) require a genuine fork of Gemini CLI.`);
    console.log('     For each item, consider opening an upstream issue to make it configurable.');
    console.log('     If you must maintain a fork, use the `upstream-sync` skill to stay current.');
  }
  console.log(LINE + '\n');
}

main();
