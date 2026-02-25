/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { Content } from '@google/genai';
import {
  partListUnionToString,
  type ConversationRecord,
  type MessageRecord,
  LlmRole,
  getResponseText,
} from '@google/gemini-cli-core';
import { getSessionFiles, type SessionInfo } from '../../utils/sessionUtils.js';
import { MessageType, type HistoryItemInsights } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import * as fs from 'node:fs/promises';

const MAX_SESSIONS_TO_ANALYZE = 20;
const MAX_MESSAGES_PER_SESSION = 15;
const MAX_MESSAGE_LENGTH = 300;
const INSIGHTS_TIMEOUT_MS = 30_000;

/**
 * Aggregated quantitative metrics extracted from local session logs.
 */
interface SessionMetrics {
  totalSessions: number;
  totalMessages: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  toolUsage: Record<string, { count: number; successes: number }>;
}

/**
 * Reads a full ConversationRecord from disk for a given SessionInfo.
 */
async function loadConversation(
  chatsDir: string,
  session: SessionInfo,
): Promise<ConversationRecord | null> {
  try {
    const filePath = path.join(chatsDir, session.fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed: ConversationRecord = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extracts quantitative metrics from a set of conversations.
 */
function computeMetrics(conversations: ConversationRecord[]): SessionMetrics {
  const metrics: SessionMetrics = {
    totalSessions: conversations.length,
    totalMessages: 0,
    totalUserMessages: 0,
    totalAssistantMessages: 0,
    totalToolCalls: 0,
    successfulToolCalls: 0,
    failedToolCalls: 0,
    toolUsage: {},
  };

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      metrics.totalMessages++;
      if (msg.type === 'user') {
        metrics.totalUserMessages++;
      } else if (msg.type === 'gemini') {
        metrics.totalAssistantMessages++;
        if ('toolCalls' in msg && msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            metrics.totalToolCalls++;
            const entry = metrics.toolUsage[tc.name] ?? {
              count: 0,
              successes: 0,
            };
            entry.count++;
            if (tc.status === 'success') {
              entry.successes++;
              metrics.successfulToolCalls++;
            } else if (tc.status === 'error') {
              metrics.failedToolCalls++;
            }
            metrics.toolUsage[tc.name] = entry;
          }
        }
      }
    }
  }

  return metrics;
}

/**
 * Builds a condensed transcript of recent sessions suitable for LLM analysis.
 */
function buildTranscriptPayload(conversations: ConversationRecord[]): string {
  const parts: string[] = [];

  for (const conv of conversations.slice(-MAX_SESSIONS_TO_ANALYZE)) {
    const sessionHeader = `--- Session (${conv.startTime}) ---`;
    const msgs = conv.messages
      .filter((m: MessageRecord) => m.type === 'user' || m.type === 'gemini')
      .slice(0, MAX_MESSAGES_PER_SESSION)
      .map((m: MessageRecord) => {
        const role = m.type === 'user' ? 'User' : 'Assistant';
        let content = partListUnionToString(m.content);
        if (content.length > MAX_MESSAGE_LENGTH) {
          content = content.slice(0, MAX_MESSAGE_LENGTH) + '...';
        }
        return `${role}: ${content}`;
      })
      .join('\n');

    parts.push(`${sessionHeader}\n${msgs}`);
  }

  return parts.join('\n\n');
}

export const insightsCommand: SlashCommand = {
  name: 'insights',
  description:
    'Analyze session history for usage patterns and optimization tips',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const config = context.services.config;
    if (!config) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Configuration is unavailable. Cannot generate insights.',
      });
      return;
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: '🔍 Analyzing session history…',
    });

    // 1. Load sessions
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
    const sessions: SessionInfo[] = await getSessionFiles(
      chatsDir,
      config.getSessionId(),
    );

    if (sessions.length === 0) {
      context.ui.addItem({
        type: MessageType.WARNING,
        text: 'No session history found for this project. Start a few conversations first!',
      });
      return;
    }

    // 2. Load full conversation data for recent sessions
    const recentSessions = sessions.slice(-MAX_SESSIONS_TO_ANALYZE);
    const conversations: ConversationRecord[] = [];
    for (const s of recentSessions) {
      const conv = await loadConversation(chatsDir, s);
      if (conv) {
        conversations.push(conv);
      }
    }

    if (conversations.length === 0) {
      context.ui.addItem({
        type: MessageType.WARNING,
        text: 'Could not load any session data.',
      });
      return;
    }

    // 3. Compute quantitative metrics
    const metrics = computeMetrics(conversations);

    // 4. Build transcript and call LLM for qualitative analysis
    let llmAnalysis: string | null = null;
    try {
      const baseLlmClient = config.getBaseLlmClient();
      const transcript = buildTranscriptPayload(conversations);

      const systemInstruction = `You are a productivity analyst reviewing a developer's recent AI coding assistant sessions.
Based on the conversation transcripts and tool usage data provided, produce a concise analysis covering:
1. **Session Categories**: Briefly categorize the sessions (e.g., bug fixing, refactoring, exploration, code generation).
2. **Friction Points**: Identify patterns where the user had to repeat themselves, correct the AI, or abandon a line of inquiry.
3. **Underutilized Features**: If you notice the user could benefit from tools or commands they aren't using, mention them.
4. **GEMINI.md Suggestions**: Suggest 1-3 concrete lines that could be added to the project's GEMINI.md (system instructions) to improve future interactions based on observed patterns.

Keep the output concise and actionable. Use Markdown formatting with headers and bullet points.`;

      const userPrompt = `Here are the quantitative metrics:
- Sessions: ${metrics.totalSessions}
- Total messages: ${metrics.totalMessages}
- Tool calls: ${metrics.totalToolCalls} (Success rate: ${metrics.totalToolCalls > 0 ? ((metrics.successfulToolCalls / metrics.totalToolCalls) * 100).toFixed(1) : 'N/A'}%)
- Most used tools: ${Object.entries(metrics.toolUsage)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([name, data]) => `${name} (${data.count})`)
        .join(', ')}

Here are the condensed session transcripts:

${transcript}

Please provide your analysis.`;

      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ];

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, INSIGHTS_TIMEOUT_MS);

      try {
        const response = await baseLlmClient.generateContent({
          modelConfigKey: { model: 'summarizer-default' },
          contents,
          systemInstruction,
          abortSignal: abortController.signal,
          promptId: 'insights-analysis',
          role: LlmRole.UTILITY_SUMMARIZER,
        });

        llmAnalysis = getResponseText(response)?.trim() ?? null;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      // Graceful degradation: still show quantitative report
      llmAnalysis = null;
    }

    // 5. Build sorted toolUsage array
    const toolUsageArray = Object.entries(metrics.toolUsage)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([name, data]) => ({
        name,
        count: data.count,
        successes: data.successes,
      }));

    // 6. Display structured report
    context.ui.addItem({
      type: MessageType.INSIGHTS,
      sessionsAnalyzed: metrics.totalSessions,
      totalMessages: metrics.totalMessages,
      userMessages: metrics.totalUserMessages,
      assistantMessages: metrics.totalAssistantMessages,
      totalToolCalls: metrics.totalToolCalls,
      successfulToolCalls: metrics.successfulToolCalls,
      failedToolCalls: metrics.failedToolCalls,
      toolUsage: toolUsageArray,
      llmAnalysis,
    } as HistoryItemInsights);
  },
};
