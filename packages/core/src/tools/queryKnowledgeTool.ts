/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import { QUERY_KNOWLEDGE_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { QUERY_KNOWLEDGE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { KnowledgeIndexingService } from '../services/knowledgeIndexingService.js';
import type { KnowledgeIndexEntry } from '../services/knowledgeIndexingService.js';

interface QueryKnowledgeParams {
  query: string;
  level?: 'global' | 'project' | 'micro' | 'epic';
}

class QueryKnowledgeInvocation extends BaseToolInvocation<
  QueryKnowledgeParams,
  ToolResult
> {
  private readonly config: Config;

  constructor(
    params: QueryKnowledgeParams,
    config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
    this.config = config;
  }

  getDescription(): string {
    return `Querying knowledge index for: ${this.params.query}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { query, level } = this.params;
    const indexer = new KnowledgeIndexingService(this.config);

    try {
      const index = await indexer.loadIndex();
      if (!index || index.entries.length === 0) {
        return {
          llmContent: JSON.stringify({
            success: true,
            results: [],
            message: 'Knowledge index is empty. No matches found.',
          }),
          returnDisplay: 'Knowledge index is empty.',
        };
      }

      // Simple keyword match for now
      const keywords = query.toLowerCase().split(/\s+/);
      const matches = index.entries
        .filter((entry) => {
          if (level && entry.level !== level) return false;
          const searchable =
            `${entry.path} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
          return keywords.some((k) => searchable.includes(k));
        })
        .sort((a, b) => {
          // Rank by number of keyword hits
          const score = (entry: KnowledgeIndexEntry) => {
            const searchable =
              `${entry.path} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
            return keywords.filter((k) => searchable.includes(k)).length;
          };
          return score(b) - score(a);
        })
        .slice(0, 5);

      const detailedResults = await Promise.all(
        matches.map(async (entry) => {
          const fullPath = path.join(this.config.getProjectRoot(), entry.path);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            return {
              ...entry,
              fullContent: content.substring(0, 2000), // Cap content for context safety
            };
          } catch {
            return { ...entry, fullContent: 'File could not be read.' };
          }
        }),
      );

      return {
        llmContent: JSON.stringify({
          success: true,
          results: detailedResults,
        }),
        returnDisplay: `Found ${matches.length} matching insights.`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({ success: false, error: errorMessage }),
        returnDisplay: `Error querying knowledge: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }
  }
}

export class QueryKnowledgeTool extends BaseDeclarativeTool<
  QueryKnowledgeParams,
  ToolResult
> {
  static readonly Name = QUERY_KNOWLEDGE_TOOL_NAME;
  private readonly config: Config;

  constructor(config: Config, messageBus: MessageBus) {
    super(
      QueryKnowledgeTool.Name,
      'QueryKnowledge',
      QUERY_KNOWLEDGE_DEFINITION.base.description!,
      Kind.Think,
      QUERY_KNOWLEDGE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
    this.config = config;
  }

  protected createInvocation(
    params: QueryKnowledgeParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new QueryKnowledgeInvocation(
      params,
      this.config,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(QUERY_KNOWLEDGE_DEFINITION, modelId);
  }
}
