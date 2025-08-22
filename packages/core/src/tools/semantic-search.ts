/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { makeRelative } from '../utils/paths.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';

import { Config } from '../config/config.js';
import { CBICodebaseIndexer } from '../services/codebaseIndexer/cbiCodebaseIndexer.js';

export interface SemanticSearchToolParams {
  query: string;
  topk?: number;
  context_lines?: number;
}

class SemanticSearchToolInvocation extends BaseToolInvocation<
  SemanticSearchToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: SemanticSearchToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Search codebase for: "${this.params.query}"`;
  }

  override toolLocations(): ToolLocation[] {
    return [];
  }

  async execute(): Promise<ToolResult> {
    const targetDir = this.config.getTargetDir();
    const indexer = CBICodebaseIndexer.fromConfig(targetDir, this.config);
    
    const status = await indexer.getIndexStatus();
    if (!status.exists) {
      return {
        llmContent: 'No codebase index found. Please run /codebase index first to create an index.',
        returnDisplay: '❌ **No codebase index found**\n\nPlease run `/codebase index` first to create an index before using semantic search.',
      };
    }

    try {
      const results = await indexer.search(
        this.params.query,
        this.params.topk || 8,
        this.params.context_lines || 2,
      );

      if (!results || results.length === 0) {
        return {
          llmContent: `No results found for query: "${this.params.query}"`,
          returnDisplay: `🔍 **No results found**\n\nQuery: "${this.params.query}"\n\nNo relevant code found in the indexed codebase.`,
        };
      }

      let displayText = `🔍 **Semantic Search Results**\n\n`;
      displayText += `**Query:** "${this.params.query}"\n`;
      displayText += `**Found:** ${results.length} results\n\n`;

      let llmContent = `Semantic search results for "${this.params.query}":\n\n`;
      for (const result of results) {
        const relativePath = makeRelative(result.file, targetDir);
        llmContent += `${relativePath} (${result.score.toFixed(3)})\n`;
        
        try {
          const fs = await import('fs/promises');
          const fileContent = await fs.readFile(result.file, 'utf-8');
          const lines = fileContent.split('\n');
          const lineNumber = result.start_line;
          const start = Math.max(0, lineNumber - 1);
          const end = Math.min(lines.length, lineNumber + 2);
          
          for (let i = start; i < end; i++) {
            const lineNum = i + 1;
            const line = lines[i] || '';
            llmContent += `${lineNum.toString().padStart(4)}    ${line}\n`;
          }
        } catch (error) {
          llmContent += `${result.start_line.toString().padStart(4)}    ${result.text}\n`;
        }
        llmContent += '\n';
      }

      return {
        llmContent,
        returnDisplay: displayText,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error performing semantic search: ${errorMessage}`,
        returnDisplay: `❌ **Search Error**\n\nFailed to perform semantic search: ${errorMessage}`,
      };
    }
  }
}

export class SemanticSearchTool extends BaseDeclarativeTool<
  SemanticSearchToolParams,
  ToolResult
> {
  static readonly Name: string = 'semantic_search';

  constructor(private config: Config) {
    super(
      SemanticSearchTool.Name,
      'SemanticSearch',
      `Performs semantic search across the indexed codebase using neural embeddings. This tool can only be used if the codebase has been indexed using the /codebase index command. It finds the most semantically similar code snippets to the given query and returns them with context. The search uses vector similarity to find relevant code, making it much more powerful than simple text search.`,
      Kind.Search,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant code in the codebase. Be specific and descriptive about what you are looking for.',
          },
          topk: {
            type: 'number',
            description: 'Optional: Number of top results to return (default: 8, max: 20)',
            minimum: 1,
            maximum: 20,
          },
          context_lines: {
            type: 'number',
            description: 'Optional: Number of context lines to show around each result (default: 2, max: 10)',
            minimum: 0,
            maximum: 10,
          },
        },
        required: ['query'],
      },
    );
  }

  protected override validateToolParamValues(
    params: SemanticSearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }

    if (params.topk !== undefined && (params.topk < 1 || params.topk > 20)) {
      return 'topk must be between 1 and 20';
    }

    if (params.context_lines !== undefined && (params.context_lines < 0 || params.context_lines > 10)) {
      return 'context_lines must be between 0 and 10';
    }

    return null;
  }

  protected createInvocation(
    params: SemanticSearchToolParams,
  ): ToolInvocation<SemanticSearchToolParams, ToolResult> {
    return new SemanticSearchToolInvocation(this.config, params);
  }
}
