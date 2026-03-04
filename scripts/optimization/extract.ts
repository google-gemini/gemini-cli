/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskVariables } from './masking.js';

export interface OptimizationTarget {
  id: string;
  sourceFile: string;
  originalText: string;
  maskedText: string;
  maskMap: Record<string, string>;
}

/**
 * Robustly finds a block bounded by { } using character scanning.
 */
function findBlockBounds(
  content: string,
  startIdx: number,
): { start: number; end: number } | null {
  const blockStart = content.indexOf('{', startIdx);
  if (blockStart === -1) return null;

  let braceCount = 0;
  for (let i = blockStart; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (braceCount === 0) {
      return { start: blockStart, end: i };
    }
  }
  return null;
}

/**
 * Main extraction function.
 */
export async function runExtraction() {
  const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
  const targets: OptimizationTarget[] = [];

  // 1. Snippets
  const snippetNames =
    manifest.data_inventory?.optimization_targets?.snippets || [];
  const snippetsPath = 'packages/core/src/prompts/snippets.ts';
  if (fs.existsSync(snippetsPath)) {
    const content = fs.readFileSync(snippetsPath, 'utf8');
    for (const name of snippetNames) {
      const startIdx = content.indexOf(`export function ${name}`);
      if (startIdx === -1) continue;

      const bounds = findBlockBounds(content, startIdx);
      if (!bounds) continue;

      const body = content.substring(bounds.start, bounds.end + 1);
      // Capture the LAST template literal
      const tickMatches = [...body.matchAll(/`((?:[^`\\]|\\.)*)`/g)];
      if (tickMatches.length > 0) {
        const text = tickMatches[tickMatches.length - 1][1].trim();
        const { maskedText, maskMap } = maskVariables(text);
        targets.push({
          id: `snippets:${name}`,
          sourceFile: snippetsPath,
          originalText: text,
          maskedText,
          maskMap,
        });
      }
    }
  }

  // 2. Tools
  const toolNames = Object.keys(manifest.data_inventory?.tools || {});
  const gemini3Path =
    'packages/core/src/tools/definitions/model-family-sets/gemini-3.ts';
  if (fs.existsSync(gemini3Path)) {
    const content = fs.readFileSync(gemini3Path, 'utf8');
    for (const name of toolNames) {
      // Find tool key (2-space indent)
      const toolRegex = new RegExp(`^\\s{2}${name}:\\s*\\{`, 'm');
      const match = toolRegex.exec(content);
      if (!match) continue;

      const bounds = findBlockBounds(content, match.index);
      if (!bounds) continue;

      const toolBlock = content.substring(match.index, bounds.end + 1);
      const descRegex =
        /description:\s*(?:`((?:[^`\\]|\\.)*)`|'([^']*)'|"([^"]*)")/g;
      const descMatch = descRegex.exec(toolBlock);

      if (descMatch) {
        const text = (descMatch[1] || descMatch[2] || descMatch[3]).trim();
        const { maskedText, maskMap } = maskVariables(text);
        targets.push({
          id: `gemini3:${name}:description`,
          sourceFile: gemini3Path,
          originalText: text,
          maskedText,
          maskMap,
        });
      }
    }
  }

  // 3. Dynamic Helpers
  const helpersPath =
    'packages/core/src/tools/definitions/dynamic-declaration-helpers.ts';
  if (fs.existsSync(helpersPath)) {
    const content = fs.readFileSync(helpersPath, 'utf8');
    const specs = [
      {
        id: 'shell:darwin:description',
        regex:
          /return `This tool executes a given shell command as \\`bash -c <command>\\`. ([\s\S]*?)`;/,
      },
      {
        id: 'shell:win32:description',
        regex:
          /return `This tool executes a given shell command as \\`powershell\.exe -NoProfile -Command <command>\\`. ([\s\S]*?)`;/,
      },
      {
        id: 'exit_plan_mode:description',
        regex:
          /name: EXIT_PLAN_MODE_TOOL_NAME,[\s\S]*?description:\s*'([^']*)',/,
      },
      {
        id: 'activate_skill:description',
        regex:
          /name: ACTIVATE_SKILL_TOOL_NAME,[\s\S]*?description:\s*`((?:[^`\\]|\\.)*)`,/,
      },
    ];
    for (const s of specs) {
      const m = s.regex.exec(content);
      if (m && m[1]) {
        const text = m[1].trim();
        const { maskedText, maskMap } = maskVariables(text);
        targets.push({
          id: s.id,
          sourceFile: helpersPath,
          originalText: text,
          maskedText,
          maskMap,
        });
      }
    }
  }

  const outputDir = 'data/optimization';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, 'targets.json'),
    JSON.stringify(targets, null, 2),
  );
  return targets;
}

// CLI Entrypoint
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
if (isMain) {
  runExtraction()
    // eslint-disable-next-line no-console
    .then((t) => console.log(`✅ Extracted ${t.length} targets.`))
    // eslint-disable-next-line no-console
    .catch(console.error);
}
