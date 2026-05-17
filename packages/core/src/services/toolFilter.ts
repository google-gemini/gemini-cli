/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

export interface ToolFilterConfig {
  enabled: boolean;
  model: string;
  maxContextMessages: number;
  fallbackBehavior: 'all-tools' | 'no-tools' | 'core-only';
  cacheResults: boolean;
  cacheTtl: number;
}

interface CacheEntry {
  tools: string[];
  expiresAt: number;
}

interface ToolFilterMessage {
  role: string;
  content: string;
}

interface ChatResponse {
  message?: { content?: string };
}

function isChatResponse(value: unknown): value is ChatResponse {
  return typeof value === 'object' && value !== null;
}

export class ToolFilter {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: ToolFilterConfig,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async filterTools(
    allTools: FunctionDeclaration[],
    recentMessages: ToolFilterMessage[],
    userQuery: string,
  ): Promise<FunctionDeclaration[]> {
    if (!this.config.enabled) {
      return allTools;
    }

    const toolNames = allTools.map((t) => t.name || '');
    const cacheKey = this.buildCacheKey(toolNames, recentMessages);

    if (this.config.cacheResults) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return allTools.filter((t) => cached.tools.includes(t.name || ''));
      }
    }

    if (allTools.length === 0) {
      return [];
    }

    try {
      const filteredNames = await this.callFunctionGemma(
        toolNames,
        allTools.map((t) => t.description || ''),
        recentMessages,
        userQuery,
      );

      const validated = this.validateToolNames(filteredNames, toolNames);

      if (this.config.cacheResults && validated.length > 0) {
        this.cache.set(cacheKey, {
          tools: validated,
          expiresAt: Date.now() + this.config.cacheTtl,
        });
      }

      return allTools.filter((t) => validated.includes(t.name || ''));
    } catch (error) {
      debugLogger.warn(
        `ToolFilter: FunctionGemma call failed, falling back. ${error}`,
      );
      return this.applyFallback(allTools);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async callFunctionGemma(
    toolNames: string[],
    toolDescriptions: string[],
    messages: ToolFilterMessage[],
    userQuery: string,
  ): Promise<string[]> {
    const toolsPrompt = toolNames
      .map((name, i) => `${name}: ${toolDescriptions[i] || 'No description'}`)
      .join('\n');

    const context = messages
      .slice(-this.config.maxContextMessages)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Given the following available tools and conversation context, determine which tools are relevant to the user's query. Return only a JSON array of tool names.

Available tools:
${toolsPrompt}

Conversation context:
${context}

User query: ${userQuery}

Relevant tool names (JSON array only):`;

    const ollamaBase = this.baseUrl.replace(/\/v1\/?$/, '');
    const response = await this.fetchImpl(`${ollamaBase}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      throw new Error(
        `FunctionGemma chat failed: ${response.status} ${response.statusText}`,
      );
    }

    const json: unknown = await response.json();
    const body = isChatResponse(json) ? json : ({} as ChatResponse);

    const content = body.message?.content?.trim() || '[]';

    const jsonMatch = content.match(/\[[^\]]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === 'string')
      ? parsed
      : [];
  }

  private validateToolNames(
    requested: string[],
    available: string[],
  ): string[] {
    const availableSet = new Set(available.map((n) => n.toLowerCase()));
    return requested.filter((name) => availableSet.has(name.toLowerCase()));
  }

  private applyFallback(
    allTools: FunctionDeclaration[],
  ): FunctionDeclaration[] {
    switch (this.config.fallbackBehavior) {
      case 'no-tools':
        return [];
      case 'core-only': {
        const coreNames = new Set([
          'read_file',
          'write_file',
          'edit_file',
          'run_shell_command',
          'list_directory',
        ]);
        return allTools.filter((t) =>
          coreNames.has((t.name || '').toLowerCase()),
        );
      }
      case 'all-tools':
      default:
        return allTools;
    }
  }

  private buildCacheKey(
    tools: string[],
    messages: ToolFilterMessage[],
  ): string {
    const toolsPart = tools.sort().join(',');
    const messagesPart = messages
      .slice(-this.config.maxContextMessages)
      .map((m) => `${m.role}:${m.content}`)
      .join('|');
    return `${toolsPart}::${messagesPart}`;
  }
}
