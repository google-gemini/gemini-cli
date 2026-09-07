/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import type { Tool, ToolContext } from '../Tool.js';
import type { Capability } from '../../permissions/Capability.js';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
]);

export class SearchFilesTool implements Tool {
  public readonly name = 'search_files';
  public readonly description = 'Search for files by filename pattern or search text content across files in the workspace.';
  public readonly capability: Capability = 'filesystem.search';

  public readonly parameters = {
    pattern: {
      type: 'string' as const,
      description: 'Optional substring or extension to match against file paths (e.g. ".ts", "config").',
      required: false,
    },
    query: {
      type: 'string' as const,
      description: 'Optional text to grep for inside files.',
      required: false,
    },
    maxResults: {
      type: 'number' as const,
      description: 'Maximum number of results to return (default: 50).',
      required: false,
    },
  };

  public async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const pattern = typeof args['pattern'] === 'string' ? args['pattern'].toLowerCase() : '';
    const query = typeof args['query'] === 'string' ? args['query'] : '';
    const maxResults = typeof args['maxResults'] === 'number' ? args['maxResults'] : 50;

    const results: string[] = [];

    const walk = (currentDir: string): void => {
      if (results.length >= maxResults) return;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(context.workspaceRoot, fullPath);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          // If pattern filter provided, check matching
          if (pattern && !entry.name.toLowerCase().includes(pattern) && !relPath.toLowerCase().includes(pattern)) {
            continue;
          }

          // If query text provided, search inside file
          if (query) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= maxResults) break;
                if (lines[i].includes(query)) {
                  results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                }
              }
            } catch {
              // Skip binary or unreadable files
            }
          } else {
            results.push(relPath);
          }
        }
      }
    };

    walk(context.workspaceRoot);

    if (results.length === 0) {
      return `No matches found in workspace.`;
    }

    return `Found ${results.length} result(s):\n${results.join('\n')}`;
  }
}
