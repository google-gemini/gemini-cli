/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import {
  type ConversationRecord,
  SESSION_FILE_PREFIX,
} from './chatRecordingService.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { getResponseText } from '../utils/partUtils.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';

export interface SessionMetadata {
  projectPath: string;
  projectName: string;
  startTime: string;
  summary?: string;
  messageCount: number;
  toolCalls: Array<{
    name: string;
    status: string;
  }>;
  errors: string[];
}

export interface InsightsReport {
  summary: string;
  working: string[];
  notWorking: string[];
  recommendations: string[];
  fullMarkdown: string;
}

const INSIGHTS_PROMPT = `You are an expert AI productivity consultant for Gemini CLI (gcli) users.
Analyze the following session metadata from the user's past and present GCLI sessions.
Provide a comprehensive "Insights Report" to help the user understand their usage patterns and improve their effectiveness with the tool.

Metadata:
{metadata}

The report MUST include:
1. **Summary**: A brief (2-3 sentences) high-level overview of the user's CLI usage and general effectiveness.
2. **What is Working**: A bulleted list of successful patterns, frequently used tools that consistently work well, and types of tasks the user is successfully completing.
3. **What Isn't Working**: A bulleted list of recurring errors, failed tool calls, friction points, or inefficient patterns.
4. **Recommendations**: Specific, actionable advice on how the user can improve their usage (e.g., better prompting, trying specific slash commands, managing context better).

Output the report in Markdown format. Use a professional, encouraging, and highly technical tone.`;

export class InsightsService {
  constructor(private readonly config: Config) {}

  /**
   * Generates an insights report based on past and present sessions.
   */
  async generateInsightsReport(
    baseLlmClient: BaseLlmClient,
    maxSessions: number = 10,
  ): Promise<string> {
    const metadata = await this.collectMetadata(maxSessions);

    if (metadata.length === 0) {
      return 'No session data found to analyze. Start using Gemini CLI to get insights!';
    }

    const metadataStr = JSON.stringify(metadata, null, 2);
    const prompt = INSIGHTS_PROMPT.replace('{metadata}', metadataStr);

    try {
      const response = await baseLlmClient.generateContent({
        modelConfigKey: { model: 'summarizer-default' },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        promptId: 'insights-generation',
        abortSignal: new AbortController().signal,
      });

      return (
        getResponseText(response) ??
        'Failed to generate insights report content.'
      );
    } catch (error) {
      debugLogger.error('Error generating insights report:', error);
      throw new Error('Failed to generate insights report.');
    }
  }

  private async collectMetadata(
    maxSessions: number,
  ): Promise<SessionMetadata[]> {
    const allMetadata: SessionMetadata[] = [];
    const globalGeminiDir = Storage.getGlobalGeminiDir();
    const projectsFile = path.join(globalGeminiDir, 'projects.json');

    let projects: Record<string, string> = {};
    try {
      const content = await fs.readFile(projectsFile, 'utf-8');
      projects = JSON.parse(content).projects || {};
    } catch (_e) {
      debugLogger.debug('Failed to read projects.json:', _e);
      // Fallback to current project if registry is missing
      projects[this.config.getProjectRoot()] = 'current';
    }

    const sessionFiles: Array<{
      filePath: string;
      projectPath: string;
      mtime: number;
    }> = [];

    for (const [projectPath, shortId] of Object.entries(projects)) {
      const chatsDir = path.join(Storage.getGlobalTempDir(), shortId, 'chats');
      try {
        const files = await fs.readdir(chatsDir);
        for (const file of files) {
          if (file.startsWith(SESSION_FILE_PREFIX) && file.endsWith('.json')) {
            const filePath = path.join(chatsDir, file);
            const stats = await fs.stat(filePath);
            sessionFiles.push({
              filePath,
              projectPath,
              mtime: stats.mtime.getTime(),
            });
          }
        }
      } catch (_e) {
        // Skip projects with no chats or inaccessible chats
      }
    }

    // Sort by most recent first
    sessionFiles.sort((a, b) => b.mtime - a.mtime);

    // Take top N sessions
    const selectedSessions = sessionFiles.slice(0, maxSessions);

    for (const session of selectedSessions) {
      try {
        const content = await fs.readFile(session.filePath, 'utf-8');
        const conversation: ConversationRecord = JSON.parse(content);
        allMetadata.push(
          this.extractSessionMetadata(conversation, session.projectPath),
        );
      } catch (_e) {
        debugLogger.debug(
          `Failed to parse session file ${session.filePath}:`,
          _e,
        );
      }
    }

    return allMetadata;
  }

  private extractSessionMetadata(
    conversation: ConversationRecord,
    projectPath: string,
  ): SessionMetadata {
    const toolCalls: Array<{ name: string; status: string }> = [];
    const errors: string[] = [];

    for (const msg of conversation.messages) {
      if (msg.type === 'gemini' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          toolCalls.push({
            name: tc.name,
            status: tc.status,
          });
        }
      }
      if (msg.type === 'error') {
        const errorText =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
        errors.push(errorText.slice(0, 200)); // Limit error length
      }
    }

    return {
      projectPath,
      projectName: path.basename(projectPath),
      startTime: conversation.startTime,
      summary: conversation.summary,
      messageCount: conversation.messages.length,
      toolCalls,
      errors: errors.slice(0, 5), // Limit number of errors
    };
  }
}
