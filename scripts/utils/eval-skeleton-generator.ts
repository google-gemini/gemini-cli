/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generates a TypeScript eval skeleton from extracted session
 * data.
 *
 * The generated file is a valid `.eval.ts` that conforms to all rules enforced
 * by `eval:validate`:
 *  - Uses `USUALLY_PASSES` policy (required for new evals by `new-evals-policy`)
 *  - Has static `suiteName` and `suiteType` strings
 *  - Has a `prompt` property
 *  - Has a static case name
 *  - Includes at least one tool reference in the `assert` body
 *
 * The skeleton uses the same import / describe / evalTest pattern found in all
 * existing evals.
 */

import { formatWithPrettier } from './autogen.js';

export interface SkeletonOptions {
  /** Display name for the eval case (becomes the `name:` field). */
  name: string;

  /** The `suiteName` field. Defaults to `'regression'`. */
  suiteName?: string;

  /**
   * The `describe()` block label. If not provided, derived from `name`.
   */
  description?: string;

  /** The sanitized user prompt extracted from the session. */
  prompt: string;

  /**
   * Workspace files in the pre-session state.
   * Keys are workspace-relative paths (forward slashes).
   * Values are the file contents.
   */
  files: Record<string, string>;

  /**
   * Tool names that were called and completed successfully during the session.
   * Used to generate meaningful assertions.
   */
  observedTools: string[];
}

/** Maximum number of file entries to include in the generated `FILES` map. */
const MAX_FILES = 10;

/**
 * Returns the subset of observed tools that are worth asserting on.
 * We skip low-signal tools like `list_directory` in favour of more meaningful
 * ones like `write_file`, `replace`, `run_shell_command`, etc.
 */
const LOW_SIGNAL_TOOLS = new Set([
  'list_directory',
  'get_internal_docs',
  'activate_skill',
]);

function selectAssertionTools(observedTools: string[]): string[] {
  const meaningful = observedTools.filter((t) => !LOW_SIGNAL_TOOLS.has(t));
  // Deduplicate while preserving order
  return [...new Set(meaningful)];
}

/**
 * Escapes a string for safe embedding in a TypeScript template literal.
 * Replaces backticks and `${` sequences.
 */
function escapeTemplateLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * Formats a file path as a valid TypeScript object key (quoted if needed).
 */
function formatFileKey(filePath: string): string {
  // Quote keys that contain characters not safe as bare identifiers/keys
  if (/[^a-zA-Z0-9_\-./]/.test(filePath)) {
    return JSON.stringify(filePath);
  }
  return `'${filePath}'`;
}

/**
 * Generates the `const FILES = { ... } as const;` block.
 */
function generateFilesBlock(files: Record<string, string>): string {
  const entries = Object.entries(files).slice(0, MAX_FILES);

  if (entries.length === 0) {
    return '';
  }

  const lines: string[] = ['const FILES = {'];
  for (const [filePath, content] of entries) {
    const key = formatFileKey(filePath);
    // Use template literal for content to handle multiline values naturally
    lines.push(`  ${key}: \`${escapeTemplateLiteral(content)}\`,`);
  }
  lines.push('} as const;');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates the `assert` function body based on observed tools.
 *
 * For each tool worth asserting on we generate a filter + expect block.
 * If no meaningful tools were observed we fall back to a basic result check.
 */
function generateAssertBody(observedTools: string[]): string {
  const tools = selectAssertionTools(observedTools);
  const lines: string[] = ['const toolLogs = rig.readToolLogs();', ''];

  if (tools.length === 0) {
    // Minimal fallback assertion — at least something ran
    lines.push(
      '// TODO: Add specific assertions based on the expected agent behavior.',
    );
    lines.push('expect(result).toBeTruthy();');
    return lines.join('\n');
  }

  for (const tool of tools) {
    const varName = tool.replace(/[^a-zA-Z0-9]/g, '_') + 'Calls';
    lines.push(`// Verify the agent called '${tool}'`);
    lines.push(
      `const ${varName} = toolLogs.filter((log) => log.toolRequest.name === '${tool}');`,
    );
    lines.push(`expect(${varName}.length).toBeGreaterThanOrEqual(1);`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Derives a safe `describe()` label from the eval case name.
 */
function deriveDescribeLabel(name: string): string {
  // Truncate and clean up for use as a describe block label
  return name.length > 80 ? name.slice(0, 77) + '...' : name;
}

/**
 * Generates a complete `.eval.ts` source string.
 *
 * The returned string is not yet Prettier-formatted — call
 * `generateEvalSkeleton()` to get the formatted version.
 */
function buildRawSkeleton(options: SkeletonOptions): string {
  const {
    name,
    suiteName = 'regression',
    description,
    prompt,
    files,
    observedTools,
  } = options;

  const describeLabel = description ?? deriveDescribeLabel(name);
  const hasFiles = Object.keys(files).length > 0;
  const filesBlock = hasFiles ? generateFilesBlock(files) : '';
  const assertBody = generateAssertBody(observedTools);

  const filesProperty = hasFiles ? '\n    files: FILES,' : '';

  const lines: string[] = [
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
    `describe('${escapeTemplateLiteral(describeLabel)}', () => {`,
    '  /**',
    `   * Regression eval generated from a session log.`,
    `   * Prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}`,
    '   *',
    '   * TODO: Review the generated assertions and refine them to precisely',
    '   * capture the expected behavior before promoting to ALWAYS_PASSES.',
    '   */',
    `  evalTest('USUALLY_PASSES', {`,
    `    suiteName: '${suiteName}',`,
    `    suiteType: 'behavioral',`,
    `    name: '${escapeTemplateLiteral(name)}',`,
    `    prompt: \`${escapeTemplateLiteral(prompt)}\`,`,
    `    ${filesProperty}`,
    `    assert: async (rig, result) => {`,
    `      ${assertBody.split('\n').join('\n      ')}`,
    `    },`,
    `  });`,
    `});`,
    '',
  ];

  return lines.join('\n');
}

/**
 * Generates a complete, Prettier-formatted `.eval.ts` source string from the
 * provided session data.
 *
 * @param options - The extracted and sanitized session data.
 * @param outputPath - The intended output file path, used for Prettier config
 *   resolution. Can be a placeholder path if the file doesn't exist yet.
 * @returns The formatted TypeScript source code.
 */
export async function generateEvalSkeleton(
  options: SkeletonOptions,
  outputPath: string,
): Promise<string> {
  const raw = buildRawSkeleton(options);
  try {
    return await formatWithPrettier(raw, outputPath);
  } catch {
    // If Prettier fails (e.g., in environments without config), return raw
    return raw;
  }
}

/**
 * Derives a reasonable eval case name from a user prompt string.
 * Truncates, lowercases, and converts to a human-readable statement.
 */
export function deriveEvalName(prompt: string): string {
  const cleaned = prompt
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .toLowerCase();

  const truncated =
    cleaned.length > 80 ? cleaned.slice(0, 80).trimEnd() : cleaned;

  // Ensure it reads as a statement starting with "should"
  if (!truncated.startsWith('should')) {
    return `should handle: ${truncated}`;
  }
  return truncated;
}
