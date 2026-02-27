/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { Content } from '@google/genai';
import {
  type ConversationRecord,
  LlmRole,
  getResponseText,
  debugLogger,
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

    // 4. Call LLM for qualitative analysis using ONLY sanitized metrics.
    //    SECURITY: We intentionally do NOT pass raw session transcripts to
    //    the LLM to prevent indirect prompt injection. Session logs may
    //    contain untrusted content from tool outputs (e.g. web_fetch).
    //    Only computed numeric metrics and tool names (extracted by our
    //    code) are sent, which cannot carry attacker-controlled payloads.
    let llmAnalysis: string | null = null;
    try {
      const baseLlmClient = config.getBaseLlmClient();

      const toolBreakdown = Object.entries(metrics.toolUsage)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(
          ([name, data]) =>
            `  - ${name}: ${data.count} calls, ${data.successes} successes (${data.count > 0 ? ((data.successes / data.count) * 100).toFixed(0) : 0}% success rate)`,
        )
        .join('\n');

      const systemInstruction = `You are a productivity analyst reviewing aggregated usage metrics from a developer's AI coding assistant sessions.
You are given ONLY numeric statistics and tool names — no raw conversation content.
Based on these metrics, produce a concise analysis covering:
1. **Usage Patterns**: Comment on the overall interaction volume and tool usage distribution.
2. **Tool Effectiveness**: Identify tools with low success rates that may indicate friction.
3. **Underutilized Features**: Based on the tool names present (or absent), suggest CLI features the user could try.
4. **Workflow Tips**: Suggest 1-3 general best practices for improving productivity with the CLI.

Keep the output concise and actionable. Use Markdown formatting with headers and bullet points.`;

      const successRate =
        metrics.totalToolCalls > 0
          ? (
              (metrics.successfulToolCalls / metrics.totalToolCalls) *
              100
            ).toFixed(1)
          : 'N/A';

      const userPrompt = `Here are the aggregated usage metrics (no raw content included):
- Sessions analyzed: ${metrics.totalSessions}
- Total messages: ${metrics.totalMessages}
- User messages: ${metrics.totalUserMessages}
- Assistant messages: ${metrics.totalAssistantMessages}
- Total tool calls: ${metrics.totalToolCalls}
- Successful tool calls: ${metrics.successfulToolCalls}
- Failed tool calls: ${metrics.failedToolCalls}
- Overall tool success rate: ${successRate}%
- Tool breakdown:
${toolBreakdown}

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
    } catch (e) {
      // Graceful degradation: still show quantitative report
      debugLogger.warn('[Insights] LLM analysis failed:', e);
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
