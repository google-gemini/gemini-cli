/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import type { Tool, ToolContext } from '../Tool.js';
import type { Capability } from '../../permissions/Capability.js';

export class ReadFileTool implements Tool {
  public readonly name = 'read_file';
  public readonly description = 'Read the contents of a file within the workspace with optional line slice bounds.';
  public readonly capability: Capability = 'filesystem.read';

  public readonly parameters = {
    path: {
      type: 'string' as const,
      description: 'The relative or absolute file path to read.',
      required: true,
    },
    startLine: {
      type: 'number' as const,
      description: 'Optional starting line number (1-indexed, inclusive).',
      required: false,
    },
    endLine: {
      type: 'number' as const,
      description: 'Optional ending line number (1-indexed, inclusive).',
      required: false,
    },
  };

  public async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const rawPath = String(args['path'] || '').trim();
    if (!rawPath) {
      return 'Error: path parameter is required.';
    }

    const resolved = path.isAbsolute(rawPath)
      ? path.normalize(rawPath)
      : path.normalize(path.join(context.workspaceRoot, rawPath));

    // Security check: Must stay within workspaceRoot
    const normalizedRoot = path.normalize(context.workspaceRoot);
    if (!resolved.startsWith(normalizedRoot)) {
      return `Access denied: path "${rawPath}" is outside the workspace root "${normalizedRoot}".`;
    }

    if (!fs.existsSync(resolved)) {
      return `Error: File not found: "${rawPath}".`;
    }

    const stats = fs.statSync(resolved);
    if (stats.isDirectory()) {
      return `Error: "${rawPath}" is a directory, not a file. Use search_files or list directory instead.`;
    }

    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      const lines = content.split('\n');

      const startLine = Math.max(1, typeof args['startLine'] === 'number' ? args['startLine'] : 1);
      const endLine = typeof args['endLine'] === 'number'
        ? Math.min(lines.length, args['endLine'])
        : Math.min(lines.length, startLine + 800);

      const slice = lines.slice(startLine - 1, endLine);
      const formatted = slice
        .map((line, idx) => `${String(startLine + idx).padStart(4, ' ')} | ${line}`)
        .join('\n');

      return `File: ${path.relative(context.workspaceRoot, resolved)}\nLines: ${startLine}-${endLine} of ${lines.length}\n\n${formatted}`;
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
