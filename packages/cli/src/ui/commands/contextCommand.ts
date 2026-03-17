/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MessageType,
  type ContextWindowTurn,
  type ContextWindowTurnKind,
} from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { tokenLimit, estimateTokenCountSync } from '@google/gemini-cli-core';
import type { Content, Tool } from '@google/genai';

function estimateStringTokens(text: string): number {
  if (!text) return 0;
  return estimateTokenCountSync([{ text }]);
}

function estimateTurnTokens(content: Content): number {
  return estimateTokenCountSync(content.parts || []);
}

function estimateToolDeclarationTokens(tools: Tool[]): number {
  if (!tools || tools.length === 0) return 0;
  return Math.floor(JSON.stringify(tools).length / 4);
}

/**
 * Classifies a conversation turn by its dominant content type.
 */
function classifyTurn(content: Content): ContextWindowTurnKind {
  const parts = content.parts || [];
  let hasText = false;
  let hasCall = false;
  let hasResult = false;
  let hasMedia = false;

  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.length > 0) hasText = true;
    else if (part.functionCall) hasCall = true;
    else if (part.functionResponse) hasResult = true;
    else if ('inlineData' in part || 'fileData' in part) hasMedia = true;
  }

  const count = [hasText, hasCall, hasResult, hasMedia].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (hasCall) return 'tool_call';
  if (hasResult) return 'tool_result';
  if (hasMedia) return 'media';
  return 'text';
}

function getContentPreview(content: Content, maxLen: number = 80): string {
  const parts = content.parts || [];
  const segments: string[] = [];

  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      segments.push(part.text);
    } else if (part.functionCall) {
      segments.push(`[call: ${part.functionCall.name}]`);
    } else if (part.functionResponse) {
      segments.push(`[result: ${part.functionResponse.name}]`);
    } else if ('inlineData' in part || 'fileData' in part) {
      segments.push('[media]');
    }
  }

  const full = segments.join(' ').replace(/\n+/g, ' ').trim();
  if (full.length <= maxLen) return full;
  return full.slice(0, maxLen - 3) + '...';
}

function contextAction(context: CommandContext): void {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Config not available.',
    });
    return;
  }

  const client = config.getGeminiClient();
  if (!client || !client.isInitialized()) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Chat not initialized yet.',
    });
    return;
  }

  const chat = client.getChat();
  const history = chat.getHistory();
  const model = config.getModel() || 'unknown';
  const limit = tokenLimit(model);

  const sysInstruction = chat.getSystemInstruction();
  const systemPromptTokens = estimateStringTokens(sysInstruction);

  const tools = chat.getTools();
  const toolDeclarationTokens = estimateToolDeclarationTokens(tools);
  const toolCount = tools.reduce(
    (sum, t) => sum + (t.functionDeclarations?.length ?? 0),
    0,
  );

  const turns: ContextWindowTurn[] = [];
  let conversationTokens = 0;

  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    const tokens = estimateTurnTokens(turn);
    conversationTokens += tokens;
    turns.push({
      index: i + 1,
      role: turn.role || 'unknown',
      kind: classifyTurn(turn),
      tokens,
      preview: getContentPreview(turn),
    });
  }

  // Sum our estimates for the total — the API-reported
  // lastPromptTokenCount only covers conversation history, not
  // system prompt or tool schemas.
  const tokensUsed =
    systemPromptTokens + toolDeclarationTokens + conversationTokens;

  context.ui.addItem({
    type: MessageType.CONTEXT_WINDOW,
    data: {
      model,
      tokenLimit: limit,
      tokensUsed,
      systemPromptTokens,
      toolDeclarationTokens,
      toolCount,
      conversationTokens,
      turns,
    },
  });
}

export const contextCommand: SlashCommand = {
  name: 'context',
  description: 'Show what is in the current context window',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: contextAction,
};
