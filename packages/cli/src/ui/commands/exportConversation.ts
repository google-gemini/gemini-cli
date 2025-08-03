/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HistoryItem } from '../types.js';
import { Content } from '@google/genai';

export interface Conversation {
  messages: Array<{
    role: 'user' | 'model';
    content: string;
  }>;
}

export function conversationToMarkdown(conversation: Conversation): string {
  let markdown = '';
  for (const message of conversation.messages) {
    markdown += `## ${message.role}\n\n`;
    markdown += `${message.content}\n\n`;
  }
  return markdown;
}

export function conversationToJsonL(conversation: Conversation): string {
  return conversation.messages
    .map((message) => JSON.stringify(message))
    .join('\n');
}

export function historyToConversation(history: HistoryItem[]): Conversation {
  const messages: Conversation['messages'] = [];
  for (const item of history) {
    if (item.type === 'user') {
      messages.push({
        role: 'user',
        content: item.text,
      });
    } else if (item.type === 'gemini') {
      messages.push({
        role: 'model',
        content: item.text,
      });
    }
  }
  return { messages };
}

export function contentToHistory(content: Content[]): HistoryItem[] {
  const history: HistoryItem[] = [];
  let id = 1;
  for (const item of content) {
    if (item.role === 'user') {
      history.push({
        id: id++,
        type: 'user',
        text:
          item.parts
            ?.map((part: { text?: string }) =>
              'text' in part ? part.text : '',
            )
            .join('') || '',
      });
    } else if (item.role === 'model') {
      history.push({
        id: id++,
        type: 'gemini',
        text:
          item.parts
            ?.map((part: { text?: string }) =>
              'text' in part ? part.text : '',
            )
            .join('') || '',
      });
    }
  }
  return history;
}
