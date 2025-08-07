/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { globStream } from 'glob';
import { BaseTool, Icon, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { Config } from '../config/config.js';
import okapibm25 from 'okapibm25';

// ESM/CJS interop: use 'any' for compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BM25 = (okapibm25 as any).default || okapibm25;

// --- Interfaces ---

/**
 * Parameters for the BM25SearchTool
 */
export interface BM25SearchToolParams {
  /**
   * The search query.
   */
  query: string;

  /**
   * The directory to search in (optional, defaults to current directory relative to root)
   */
  path?: string;

  /**
   * File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")
   */
  include?: string;

  /**
   * The number of lines per chunk.
   */
  chunk_size?: number;

  /**
   * The number of lines to overlap between chunks.
   */
  overlap?: number;
}

interface Chunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

// --- BM25SearchTool Class ---

export class BM25SearchTool extends BaseTool<BM25SearchToolParams, ToolResult> {
  static readonly Name = 'bm25_search';

  constructor(private readonly config: Config) {
    super(
      BM25SearchTool.Name,
      'BM25Search',
      'Performs a relevance search for keywords on code chunks within files, returning the most relevant snippets as ranked results. Ideal for locating code blocks containing a set of keywords, even when those keywords are not adjacent or on the same line.',
      Icon.FileSearch,
      {
        properties: {
          query: {
            description: 'The search query.',
            type: Type.STRING,
          },
          path: {
            description:
              'Optional: The absolute path to the directory to search within. If omitted, searches the current working directory.',
            type: Type.STRING,
          },
          include: {
            description:
              "Optional: A glob pattern to filter which files are searched (e.g., '*.js', '*.{ts,tsx}', 'src/**'). If omitted, searches all files (respecting potential global ignores).",
            type: Type.STRING,
          },
          chunk_size: {
            description:
              'Optional: The number of lines per chunk. Defaults to 100.',
            type: Type.NUMBER,
          },
          overlap: {
            description:
              'Optional: The number of lines to overlap between chunks. Defaults to 20.',
            type: Type.NUMBER,
          },
        },
        required: ['query'],
        type: Type.OBJECT,
      },
    );
  }

  private resolveAndValidatePath(relativePath?: string): string | null {
    if (!relativePath) {
      return null;
    }

    const targetPath = path.resolve(this.config.getTargetDir(), relativePath);
    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(targetPath)) {
      const directories = workspaceContext.getDirectories();
      throw new Error(
        `Path validation failed: Attempted path "${relativePath}" resolves outside the allowed workspace directories: ${directories.join(
          ', ',
        )}`,
      );
    }

    try {
      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
      }
    } catch (error: unknown) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw new Error(`Path does not exist: ${targetPath}`);
      }
      throw new Error(
        `Failed to access path stats for ${targetPath}: ${error}`,
      );
    }

    return targetPath;
  }

  validateToolParams(params: BM25SearchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (params.path) {
      try {
        this.resolveAndValidatePath(params.path);
      } catch (error) {
        return getErrorMessage(error);
      }
    }

    return null;
  }

  async execute(
    params: BM25SearchToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Model provided invalid parameters. Error: ${validationError}`,
      };
    }

    try {
      const workspaceContext = this.config.getWorkspaceContext();
      const searchDirAbs = this.resolveAndValidatePath(params.path);
      const searchDirDisplay = params.path || '.';

      let searchDirectories: readonly string[];
      if (searchDirAbs === null) {
        searchDirectories = workspaceContext.getDirectories();
      } else {
        searchDirectories = [searchDirAbs];
      }

      let allChunks: Chunk[] = [];
      for (const searchDir of searchDirectories) {
        const chunks = await this.createChunks({
          path: searchDir,
          include: params.include,
          chunkSize: params.chunk_size ?? 100,
          overlap: params.overlap ?? 20,
          signal,
        });
        allChunks = allChunks.concat(chunks);
      }

      if (allChunks.length === 0) {
        const noFilesMsg = `No files found to search for query "${params.query}" ${searchDirDisplay ? `in path "${searchDirDisplay}"` : ''}${params.include ? ` (filter: "${params.include}")` : ''}.`;
        return { llmContent: noFilesMsg, returnDisplay: `No files found` };
      }

      const documentContents = allChunks.map((chunk) => chunk.content);
      const queryTokens = params.query.split(/\W+/);

      const scores = BM25(documentContents, queryTokens) as number[];

      const scoredChunks = allChunks
        .map((chunk, index) => ({
          chunk,
          score: scores[index],
        }))
        .filter((item) => item.score > 0);

      scoredChunks.sort((a, b) => b.score - a.score);

      const topResults = scoredChunks.slice(0, 10);

      if (topResults.length === 0) {
        const noMatchMsg = `No matches found for query "${params.query}" ${searchDirDisplay ? `in path "${searchDirDisplay}"` : ''}${params.include ? ` (filter: "${params.include}")` : ''}.`;
        return { llmContent: noMatchMsg, returnDisplay: `No matches found` };
      }

      const matchCount = topResults.length;
      const matchTerm = matchCount === 1 ? 'match' : 'matches';
      let llmContent = `Found ${matchCount} ${matchTerm} for query "${params.query}":
---
`;

      for (const result of topResults) {
        const chunk = result.chunk;
        llmContent += `File: ${chunk.filePath} (Lines ${chunk.startLine}-${chunk.endLine})
`;
        llmContent += `Score: ${result.score.toFixed(4)}
`;
        llmContent += `Content:
${chunk.content}
---
`;
      }

      return {
        llmContent: llmContent.trim(),
        returnDisplay: `Found ${matchCount} ${matchTerm}`,
      };
    } catch (error) {
      console.error(`Error during BM25Search execution: ${error}`);
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error during BM25 search operation: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async createChunks(options: {
    path: string;
    include?: string;
    chunkSize: number;
    overlap: number;
    signal: AbortSignal;
  }): Promise<Chunk[]> {
    const { path: absolutePath, include, chunkSize, overlap, signal } = options;
    const globPattern = include ? include : '**/*';
    const ignorePatterns = [
      '.git/**',
      'node_modules/**',
      'bower_components/**',
      '.svn/**',
      '.hg/**',
    ];

    const filesStream = globStream(globPattern, {
      cwd: absolutePath,
      dot: true,
      ignore: ignorePatterns,
      absolute: true,
      nodir: true,
      signal,
    });

    const allChunks: Chunk[] = [];

    for await (const filePath of filesStream) {
      const fileAbsolutePath = filePath as string;
      try {
        const content = await fsPromises.readFile(fileAbsolutePath, 'utf8');
        const lines = content.split(/\r?\n/);
        if (lines.length === 0) {
          continue;
        }

        for (let i = 0; i < lines.length; i += chunkSize - overlap) {
          const startLine = i + 1;
          const endLine = Math.min(i + chunkSize, lines.length);
          const chunkLines = lines.slice(i, endLine);
          const chunkContent = chunkLines.join('\n');

          allChunks.push({
            filePath:
              path.relative(absolutePath, fileAbsolutePath) ||
              path.basename(fileAbsolutePath),
            startLine,
            endLine,
            content: chunkContent,
          });

          if (endLine === lines.length) {
            break;
          }
        }
      } catch (readError: unknown) {
        if (!isNodeError(readError) || readError.code !== 'ENOENT') {
          console.debug(
            `BM25Search: Could not read/process ${fileAbsolutePath}: ${getErrorMessage(
              readError,
            )}`,
          );
        }
      }
    }
    return allChunks;
  }

  getDescription(params: BM25SearchToolParams): string {
    let description = `'${params.query}'`;
    if (params.include) {
      description += ` in ${params.include}`;
    }
    if (params.path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        params.path,
      );
      if (resolvedPath === this.config.getTargetDir() || params.path === '.') {
        description += ` within ./`;
      } else {
        const relativePath = makeRelative(
          resolvedPath,
          this.config.getTargetDir(),
        );
        description += ` within ${shortenPath(relativePath)}`;
      }
    } else {
      const workspaceContext = this.config.getWorkspaceContext();
      const directories = workspaceContext.getDirectories();
      if (directories.length > 1) {
        description += ` across all workspace directories`;
      }
    }
    return description;
  }
}
