/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, GeminiClient } from '@google/gemini-cli-core';

export interface ContextBreakdown {
  model: string;
  currentTokens: number;
  maxTokens: number;
  systemPromptTokens: number;
  toolsTokens: number;
  mcpToolsTokens: number;
  memoryTokens: number;
  messagesTokens: number;
  mcpTools: Array<{ name: string; server: string; tokens: number }>;
  memoryFiles: Array<{ path: string; tokens: number }>;
  slashCommands: number;
}

/**
 * Estimates token count for a string using a simple heuristic (4 chars ≈ 1 token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Gathers detailed context information from the Gemini client
 */
export async function getContextBreakdown(
  config: Config | null,
  geminiClient: GeminiClient | undefined,
): Promise<ContextBreakdown | null> {
  if (!config || !geminiClient) {
    return null;
  }

  try {
    const model = config.getModel();
    const { tokenLimit } = await import('@google/gemini-cli-core');
    const maxTokens = tokenLimit(model);

    // Get current prompt token count
    const chat = geminiClient.getChat();
    const currentTokens = chat.getLastPromptTokenCount();

    // Get history to estimate message tokens
    const history = geminiClient.getHistory();
    let messagesTokens = 0;
    for (const content of history) {
      if (content.parts) {
        for (const part of content.parts) {
          if ('text' in part && part.text) {
            messagesTokens += estimateTokens(part.text);
          }
        }
      }
    }

    // Get tool registry to estimate tool tokens
    const toolRegistry = config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();

    // Separate MCP tools from system tools
    const mcpTools: Array<{ name: string; server: string; tokens: number }> =
      [];
    let mcpToolsTokens = 0;
    let systemToolsTokens = 0;

    for (const tool of toolDeclarations) {
      // Skip tools without a name
      if (!tool.name) continue;

      const toolJson = JSON.stringify(tool);
      const toolTokens = estimateTokens(toolJson);

      if (tool.name.startsWith('mcp__') || tool.name.includes('_mcp_')) {
        // Extract server name from tool name (e.g., "mcp__ide__getDiagnostics" -> "ide")
        const parts = tool.name.split('__');
        const serverName: string = parts.length > 1 ? parts[1] : 'unknown';
        mcpTools.push({
          name: tool.name,
          server: serverName,
          tokens: toolTokens,
        });
        mcpToolsTokens += toolTokens;
      } else {
        systemToolsTokens += toolTokens;
      }
    }

    // Sort MCP tools by server name
    mcpTools.sort((a, b) => {
      if (a.server !== b.server) {
        return a.server.localeCompare(b.server);
      }
      return a.name.localeCompare(b.name);
    });

    // Get user memory to estimate memory tokens
    const userMemory = config.getUserMemory();
    const memoryTokens = estimateTokens(userMemory);

    // Estimate system prompt tokens
    // System prompt includes the core prompt + user memory
    const { getCoreSystemPrompt } = await import('@google/gemini-cli-core');
    const systemPrompt = getCoreSystemPrompt(config, userMemory);
    const systemPromptTokens = estimateTokens(systemPrompt);

    // Get memory files (this is a simplification - actual implementation would need to track loaded files)
    const memoryFiles: Array<{ path: string; tokens: number }> = [];

    // Get slash commands count
    const slashCommands = 0; // This would need to be retrieved from command service

    return {
      model,
      currentTokens,
      maxTokens,
      systemPromptTokens,
      toolsTokens: systemToolsTokens,
      mcpToolsTokens,
      memoryTokens,
      messagesTokens,
      mcpTools,
      memoryFiles,
      slashCommands,
    };
  } catch (error) {
    console.error('Error gathering context breakdown:', error);
    return null;
  }
}
