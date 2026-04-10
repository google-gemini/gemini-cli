/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { LlmRole, resolveModel } from '@google/gemini-cli-core';
import type { Content } from '@google/genai';

const INSTRUCTION =
  "Generate an enhanced version of the user's prompt, using the preceding conversation as context. Reply with ONLY the enhanced prompt - no conversation, explanations, lead-in, bullet points, placeholders, or surrounding quotes.";

function clean(text: string) {
  const stripped = text.replace(/^```\w*\n?|```$/g, '').trim();
  return stripped.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
}

export const enhanceCommand: SlashCommand = {
  name: 'enhance',
  description: 'Enhance a prompt with additional context and rephrasing',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const draft = args.trim();
    if (!draft) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Please provide a prompt to enhance. Usage: /enhance <prompt>',
      });
      return;
    }

    const agentContext = context.services.agentContext;
    if (!agentContext) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Agent context not available.',
      });
      return;
    }

    const config = agentContext.config;
    const contentGenerator = config.getContentGenerator();
    const promptId = agentContext.promptId;

    const model = resolveModel(
      config.getModel(),
      config.getGemini31LaunchedSync?.() ?? false,
      false,
      config.getHasAccessToPreviewModel?.() ?? true,
      config,
    );

    context.ui.setDebugMessage('Enhancing prompt...');

    try {
      const history = agentContext.geminiClient?.getHistory() ?? [];
      const contents: Content[] = [
        ...history,
        { role: 'user', parts: [{ text: draft }] },
      ];

      const response = await contentGenerator.generateContent(
        {
          model,
          contents,
          config: {
            systemInstruction: {
              role: 'system',
              parts: [{ text: INSTRUCTION }],
            },
          },
        },
        promptId,
        LlmRole.UTILITY_TOOL,
      );

      const enhancedText = response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (enhancedText) {
        const cleanedText = clean(enhancedText);
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Enhanced prompt:\n\n${cleanedText}`,
        });
        context.ui.setInput(cleanedText);
      } else {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: 'Failed to enhance prompt: Empty response from model.',
        });
      }
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to enhance prompt: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      context.ui.setDebugMessage('');
    }
  },
};
