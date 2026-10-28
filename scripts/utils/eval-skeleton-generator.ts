/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Renders a deterministic, fail-closed TypeScript behavioral
 * eval draft from explicit human choices.
 */

import { formatWithPrettier } from './autogen.js';

export interface SkeletonOptions {
  name: string;
  suiteName?: string;
  prompt: string;
  files: Record<string, string>;
  expectedTools: string[];
  forbiddenTools: string[];
}

function quote(value: string): string {
  let result = '';
  for (const character of JSON.stringify(value)) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0x7f && codePoint <= 0x9f) ||
        codePoint === 0x061c ||
        codePoint === 0x200e ||
        codePoint === 0x200f ||
        (codePoint >= 0x2028 && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069))
    ) {
      result += `\\u${codePoint.toString(16).padStart(4, '0')}`;
    } else {
      result += character;
    }
  }
  return result;
}

function generateFilesBlock(files: Record<string, string>): string {
  const entries = Object.entries(files).sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  );
  if (entries.length === 0) {
    return '';
  }

  const lines = ['const FILES = {'];
  for (const [filePath, content] of entries) {
    lines.push(`  [${quote(filePath)}]: ${quote(content)},`);
  }
  lines.push('} as const;', '');
  return lines.join('\n');
}

function generateToolAssertions(options: SkeletonOptions): string[] {
  const lines: string[] = [];

  for (const toolName of options.expectedTools) {
    lines.push(
      `expect(toolLogs.some((log) => log.toolRequest.name === ${quote(toolName)})).toBe(true);`,
    );
  }

  for (const toolName of options.forbiddenTools) {
    lines.push(
      `expect(toolLogs.some((log) => log.toolRequest.name === ${quote(toolName)})).toBe(false);`,
    );
  }

  return lines;
}

function buildRawSkeleton(options: SkeletonOptions): string {
  if (
    options.expectedTools.length === 0 &&
    options.forbiddenTools.length === 0
  ) {
    throw new Error(
      'At least one expected or forbidden tool is required to generate a draft.',
    );
  }

  const suiteName = options.suiteName ?? 'regression';
  const filesBlock = generateFilesBlock(options.files);
  const filesProperty =
    Object.keys(options.files).length > 0 ? '    files: FILES,' : undefined;
  const assertions = generateToolAssertions(options);

  const lines = [
    '/**',
    ' * @license',
    ' * Copyright 2026 Google LLC',
    ' * SPDX-License-Identifier: Apache-2.0',
    ' */',
    '',
    "import { describe, expect } from 'vitest';",
    "import { evalTest } from './test-helper.js';",
    '',
    filesBlock,
    `describe(${quote(`logs-to-eval draft: ${options.name}`)}, () => {`,
    "  evalTest('USUALLY_PASSES', {",
    `    suiteName: ${quote(suiteName)},`,
    "    suiteType: 'behavioral',",
    `    name: ${quote(options.name)},`,
    `    prompt: ${quote(options.prompt)},`,
    ...(filesProperty ? [filesProperty] : []),
    '    assert: async (rig) => {',
    '      const toolLogs = rig.readToolLogs();',
    ...assertions.map((line) => `      ${line}`),
    '',
    '      // TODO: Confirm the prompt, fixtures, and assertions; then prove',
    '      // this eval fails before the behavior fix and remove this guard.',
    '      throw new Error(',
    "        'Generated logs-to-eval draft is incomplete. Resolve every TODO and remove this guard.',",
    '      );',
    '    },',
    '  });',
    '});',
    '',
  ];

  return lines.join('\n');
}

export async function generateEvalSkeleton(
  options: SkeletonOptions,
  outputPath: string,
): Promise<string> {
  return formatWithPrettier(buildRawSkeleton(options), outputPath);
}
