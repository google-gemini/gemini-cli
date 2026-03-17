/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { constants } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MorphClient, WarpGrepClient } from '@morphllm/morphsdk';

const MORPH_API_URL = 'https://api.morphllm.com';
const WORKSPACE_PATH = process.cwd();
const EXISTING_CODE_MARKER = '// ... existing code ...';
const NON_TRIVIAL_FILE_LINES = 12;
const DIFF_SNIPPET_LINES = 24;

const MORPH_API_KEY = process.env.MORPH_API_KEY;

const missingApiKeyMessage = `Error: MORPH_API_KEY is required.

Set MORPH_API_KEY in your environment and retry.`;

const morphClient = MORPH_API_KEY
  ? new MorphClient({ apiKey: MORPH_API_KEY })
  : null;

const warpGrepClient = MORPH_API_KEY
  ? new WarpGrepClient({
      morphApiKey: MORPH_API_KEY,
      morphApiUrl: MORPH_API_URL,
      timeout: 60000,
    })
  : null;

function safePath(targetPath) {
  const normalized = targetPath.trim();
  if (!normalized) {
    throw new Error('target_path must be provided.');
  }

  return path.isAbsolute(normalized)
    ? path.normalize(normalized)
    : path.resolve(WORKSPACE_PATH, normalized);
}

function formatDiffSnippet(diff = '') {
  const lines = diff.trim().split('\n');
  if (lines.length <= DIFF_SNIPPET_LINES) {
    return `\`\`\`diff\n${diff.trim()}\n\`\`\``;
  }
  return `\`\`\`diff\n${lines
    .slice(0, DIFF_SNIPPET_LINES)
    .join('\n')}\n... (truncated)\n\`\`\``;
}

function formatContextLine(filePath, value) {
  return value ? `${filePath}: ${value}` : filePath;
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function shortText(value, limit = 240) {
  if (!isText(value)) return '';
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit).replace(/\s+$/, '')}...`;
}

function formatWarpGrepResult(result, title) {
  if (!result) {
    return `${title}: no result object returned by WarpGrep`;
  }
  if (result.error) {
    return `${title}: ${result.error}`;
  }

  const contexts = Array.isArray(result.contexts) ? result.contexts : [];
  const contextLines = contexts.map((context, index) => {
    const file = formatContextLine(
      context.filePath || context.file || context.path || 'unknown',
      context.line ?? context.lineNumber ?? context.startLine,
    );
    const snippet = shortText(context.snippet ?? context.text ?? context.content, 260);
    const source = shortText(context.source ?? context.summary, 260);
    const details = [snippet || source].filter(Boolean);
    const prefix = `${index + 1}. ${file}`;
    if (details.length === 0) {
      return prefix;
    }
    return `${prefix}\n${details.map((detail) => `   ${detail}`).join('\n')}`;
  });

  if (contextLines.length === 0) {
    return `${title}: no matching contexts returned`;
  }

  return `${title}\n${contextLines.join('\n')}`;
}

function getGitHubRepo(input) {
  const hasOwnerRepo = isText(input.owner_repo);
  const hasGithubUrl = isText(input.github_url);
  if ((hasOwnerRepo ? 1 : 0) + (hasGithubUrl ? 1 : 0) !== 1) {
    return {
      error:
        'Provide exactly one repository locator: owner_repo or github_url.',
    };
  }

  if (hasOwnerRepo) {
    const repo = input.owner_repo.trim();
    return { repo };
  }

  try {
    const parsed = new URL(input.github_url);
    const cleanPath = parsed.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
    const parts = cleanPath.split('/').filter(Boolean);
    if (parts.length < 2) {
      return { error: `Invalid github_url: ${input.github_url}` };
    }
    return { repo: `${parts[0]}/${parts[1]}` };
  } catch (_err) {
    return { error: `Invalid github_url: ${input.github_url}` };
  }
}

async function ensureExistingFile(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (_err) {
    return false;
  }
}

const server = new McpServer({
  name: 'morph',
  version: '1.0.0',
});

server.registerTool(
  'morph_edit',
  {
    description:
      'Apply an edit to an existing workspace file using Morph fast apply and existing-code markers.',
    inputSchema: z
      .object({
        target_path: z.string(),
        instructions: z.string(),
        code_edit: z.string(),
      })
      .shape,
  },
  async ({ target_path, instructions, code_edit }) => {
    if (!MORPH_API_KEY || !morphClient) {
      return {
        content: [{ type: 'text', text: missingApiKeyMessage }],
      };
    }

    const targetPath = safePath(target_path);
    const targetExists = await ensureExistingFile(targetPath);
    if (!targetExists) {
      return {
        content: [
          {
            type: 'text',
            text: `morph_edit is for existing files only. Missing file: ${targetPath}`,
          },
        ],
      };
    }

    const originalCode = await readFile(targetPath, 'utf-8');
    const originalLines = originalCode.split('\n').length;
    const hasMarkers = code_edit.includes(EXISTING_CODE_MARKER);

    if (!hasMarkers && originalLines > NON_TRIVIAL_FILE_LINES) {
      return {
        content: [
          {
            type: 'text',
            text: `Refuse to replace entire file without markers.

Your file has ${originalLines} lines. For non-trivial files, include "${EXISTING_CODE_MARKER}" in code_edit so fast apply can safely merge your changes.`,
          },
        ],
      };
    }

    const result = await morphClient.fastApply.applyEdit(
      {
        originalCode,
        codeEdit: code_edit,
        instructions,
        filepath: targetPath,
      },
      {
        morphApiUrl: MORPH_API_URL,
        generateUdiff: true,
      },
    );

    if (!result?.success || !isText(result.mergedCode)) {
      const reason = result?.error || 'unknown failure';
      return {
        content: [
          {
            type: 'text',
            text: `Morph edit failed: ${reason}`,
          },
        ],
      };
    }

    await writeFile(targetPath, result.mergedCode, 'utf-8');
    const mergedLines = result.mergedCode.split('\n').length;
    const changes = result.changes || {};

    return {
      content: [
        {
          type: 'text',
          text: `Edited ${targetPath}

Lines: +${changes.linesAdded ?? 0}, -${changes.linesRemoved ?? 0}
Before/After: ${originalLines} -> ${mergedLines}

${formatDiffSnippet(result.udiff || '')}`,
        },
      ],
    };
  },
);

server.registerTool(
  'warpgrep_codebase_search',
  {
    description:
      'Search the current workspace with Morph WarpGrep and return concise contextual matches.',
    inputSchema: z.object({ search_term: z.string() }).shape,
  },
  async ({ search_term }) => {
    if (!MORPH_API_KEY || !warpGrepClient) {
      return {
        content: [{ type: 'text', text: missingApiKeyMessage }],
      };
    }

    let result;
    try {
      result = await warpGrepClient.execute({
        searchTerm: search_term,
        repoRoot: process.cwd(),
        streamSteps: false,
      });
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `warpgrep_codebase_search failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: formatWarpGrepResult(
            result,
            `warpgrep_codebase_search for "${search_term}"`,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  'warpgrep_github_search',
  {
    description:
      'Search a single public GitHub repo with Morph WarpGrep.',
    inputSchema: z
      .object({
        search_term: z.string(),
        owner_repo: z.string().optional(),
        github_url: z.string().optional(),
      })
      .shape,
  },
  async ({ search_term, owner_repo, github_url }) => {
    if (!MORPH_API_KEY || !warpGrepClient) {
      return {
        content: [{ type: 'text', text: missingApiKeyMessage }],
      };
    }

    const locator = getGitHubRepo({ owner_repo, github_url });
    if ('error' in locator) {
      return {
        content: [{ type: 'text', text: locator.error }],
      };
    }

    try {
      const result = await warpGrepClient.searchGitHub({
        searchTerm: search_term,
        github: locator.repo,
      });
      return {
        content: [
          {
            type: 'text',
            text: formatWarpGrepResult(
              result,
              `warpgrep_github_search for "${search_term}" in ${locator.repo}`,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `warpgrep_github_search failed: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          },
        ],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
