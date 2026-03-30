/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_BUILTIN_TOOL_NAMES } from '../packages/core/src/tools/tool-names.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = path.resolve(__dirname, '../evals');

// A rudimentary regex to find imported/used tool names in the eval files
const TOOL_NAME_REGEX = /([A-Z_]+_TOOL_NAME)/g;

async function scanEvalsForCoverage() {
  console.log('🔍 Scanning behavioral evals for tool coverage...\n');

  try {
    const files = await fs.readdir(EVALS_DIR);
    const evalFiles = files.filter((f) => f.endsWith('.eval.ts'));

    // Set to collect all unique *_TOOL_NAME variables used in tests
    const usedToolNames = new Set<string>();

    // Map variable names (e.g., 'WEB_SEARCH_TOOL_NAME') to the actual string name if known
    // Since we can't easily execute the AST to resolve vars, we'll map common ones.
    const varToToolName: Record<string, string> = {};
    for (const tool of ALL_BUILTIN_TOOL_NAMES) {
      // Very naive mapping: 'google_web_search' -> 'WEB_SEARCH_TOOL_NAME'
      let varName =
        tool.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_TOOL_NAME';
      // Handle known exceptions:
      if (tool === 'google_web_search') varName = 'WEB_SEARCH_TOOL_NAME';
      if (tool === 'list_directory') varName = 'LS_TOOL_NAME';
      if (tool === 'glob') varName = 'GLOB_TOOL_NAME';
      if (tool === 'replace') varName = 'EDIT_TOOL_NAME';
      if (tool === 'run_shell_command') varName = 'SHELL_TOOL_NAME';
      varToToolName[varName] = tool;
    }

    for (const file of evalFiles) {
      const content = await fs.readFile(path.join(EVALS_DIR, file), 'utf-8');

      let match;
      // Reset regex state
      TOOL_NAME_REGEX.lastIndex = 0;
      while ((match = TOOL_NAME_REGEX.exec(content)) !== null) {
        usedToolNames.add(match[1]);
      }
    }

    // Convert variables used back to actual string list
    const coveredTools = new Set<string>();
    for (const varUsed of usedToolNames) {
      if (varToToolName[varUsed]) {
        coveredTools.add(varToToolName[varUsed]);
      }
    }

    const unmappedVars = Array.from(usedToolNames).filter(
      (v) => !varToToolName[v],
    );

    console.log('✅ COVERED TOOLS:');
    for (const tool of ALL_BUILTIN_TOOL_NAMES) {
      if (coveredTools.has(tool)) {
        console.log(`  - ${tool}`);
      }
    }

    console.log('\n❌ UNCOVERED TOOLS:');
    let uncoveredCount = 0;
    for (const tool of ALL_BUILTIN_TOOL_NAMES) {
      if (!coveredTools.has(tool)) {
        console.log(`  - ${tool}`);
        uncoveredCount++;
      }
    }

    console.log(
      `\nCoverage: ${ALL_BUILTIN_TOOL_NAMES.length - uncoveredCount}/${ALL_BUILTIN_TOOL_NAMES.length}`,
    );

    if (unmappedVars.length > 0) {
      console.log(
        '\nNote: Found these unrecognized tool variables in evals (might need mapping update):',
      );
      unmappedVars.forEach((v) => console.log('  - ' + v));
    }
  } catch (err) {
    console.error('Error scanning evals:', err);
    process.exit(1);
  }
}

scanEvalsForCoverage();
