/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { HistoryItem } from '../types.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';

/**
 * Comprehensive export data interface for conversation export
 */
export interface ExportData {
  metadata: {
    exportInfo: {
      exportTime: string;
      cliVersion: string;
      gitCommit: string;
      osVersion: string;
      modelVersion: string;
      selectedAuthType: string;
      gcpProject: string;
      sessionId: string;
      memoryUsage: string;
      sandboxEnv: string;
    };
    sessionStats: {
      sessionStartTime: string;
      wallDuration: string;
      metrics: SessionMetrics;
    };
    conversationLength: number;
    coreHistoryLength: number;
  };
  uiHistory: HistoryItem[];
  coreHistory: Content[];
}

/**
 * Generates comprehensive markdown export from conversation data.
 * Creates a structured markdown document containing session metadata,
 * statistics, and complete conversation history.
 *
 * @param exportData The complete export data containing metadata and conversation history.
 * @returns A formatted markdown string ready for file output.
 */
export const generateComprehensiveMarkdown = (
  exportData: ExportData,
): string => {
  const { metadata, uiHistory, coreHistory } = exportData;
  const { exportInfo, sessionStats, conversationLength, coreHistoryLength } =
    metadata;

  let markdown = `# Gemini CLI Conversation Export\n\n`;

  // === METADATA SECTION ===
  markdown += `## 📋 Session Information\n\n`;
  markdown += `| Property | Value |\n`;
  markdown += `|----------|-------|\n`;
  markdown += `| **Export Time** | ${exportInfo.exportTime} |\n`;
  markdown += `| **CLI Version** | ${exportInfo.cliVersion} |\n`;
  markdown += `| **Git Commit** | ${exportInfo.gitCommit} |\n`;
  markdown += `| **OS Version** | ${exportInfo.osVersion} |\n`;
  markdown += `| **Model Version** | ${exportInfo.modelVersion} |\n`;
  markdown += `| **Auth Type** | ${exportInfo.selectedAuthType} |\n`;
  markdown += `| **GCP Project** | ${exportInfo.gcpProject || 'N/A'} |\n`;
  markdown += `| **Sandbox Environment** | ${exportInfo.sandboxEnv} |\n`;
  markdown += `| **Session ID** | ${exportInfo.sessionId} |\n`;
  markdown += `| **Memory Usage** | ${exportInfo.memoryUsage} |\n`;
  markdown += `\n`;

  // === SESSION STATISTICS ===
  markdown += `## 📊 Session Statistics\n\n`;
  markdown += `| Metric | Value |\n`;
  markdown += `|--------|-------|\n`;
  markdown += `| **Session Start** | ${sessionStats.sessionStartTime} |\n`;
  markdown += `| **Total Duration** | ${sessionStats.wallDuration} |\n`;
  // Calculate totals from all models
  const totalRequests = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.api.totalRequests,
    0,
  );
  const totalTokens = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.tokens.total,
    0,
  );
  const totalPromptTokens = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.tokens.prompt,
    0,
  );
  const totalCandidateTokens = Object.values(
    sessionStats.metrics.models,
  ).reduce((sum, model) => sum + model.tokens.candidates, 0);
  const totalCachedTokens = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.tokens.cached,
    0,
  );
  const totalThoughtsTokens = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.tokens.thoughts,
    0,
  );
  const totalToolTokens = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.tokens.tool,
    0,
  );
  const totalApiTime = Object.values(sessionStats.metrics.models).reduce(
    (sum, model) => sum + model.api.totalLatencyMs,
    0,
  );

  markdown += `| **Total API Requests** | ${totalRequests.toLocaleString()} |\n`;
  markdown += `| **Total Tokens** | ${totalTokens.toLocaleString()} |\n`;
  markdown += `| **Prompt Tokens** | ${totalPromptTokens.toLocaleString()} |\n`;
  markdown += `| **Response Tokens** | ${totalCandidateTokens.toLocaleString()} |\n`;
  markdown += `| **Cached Tokens** | ${totalCachedTokens.toLocaleString()} |\n`;
  markdown += `| **Tool Tokens** | ${totalToolTokens.toLocaleString()} |\n`;
  markdown += `| **Thoughts Tokens** | ${totalThoughtsTokens.toLocaleString()} |\n`;
  markdown += `| **Total API Time** | ${totalApiTime.toLocaleString()} ms |\n`;
  markdown += `| **Tool Calls** | ${sessionStats.metrics.tools.totalCalls.toLocaleString()} |\n`;
  markdown += `| **Tool Success Rate** | ${
    sessionStats.metrics.tools.totalCalls > 0
      ? (
          (sessionStats.metrics.tools.totalSuccess /
            sessionStats.metrics.tools.totalCalls) *
          100
        ).toFixed(1) + '%'
      : 'N/A'
  } |\n`;
  markdown += `| **UI History Items** | ${conversationLength} |\n`;
  markdown += `| **Core History Items** | ${coreHistoryLength} |\n`;
  markdown += `\n`;

  // === CONVERSATION CONTENT ===
  markdown += `## 💬 Conversation History\n\n`;
  markdown += `---\n\n`;

  // Process UI History (rich formatted data)
  for (let i = 0; i < uiHistory.length; i++) {
    const item = uiHistory[i];
    markdown += `### Item ${i + 1} (ID: ${item.id}) - Type: \`${item.type}\`\n\n`;

    switch (item.type) {
      case 'user':
        markdown += `**👤 User Input:**\n\n`;
        markdown += `${item.text}\n\n`;
        break;

      case 'user_shell':
        markdown += `**💻 Shell Command:**\n\n`;
        markdown += `\`\`\`bash\n${item.text}\n\`\`\`\n\n`;
        break;

      case 'gemini':
      case 'gemini_content':
        markdown += `**🤖 Assistant Response:**\n\n`;
        markdown += `${item.text}\n\n`;
        break;

      case 'tool_group':
        markdown += `**🔧 Tool Execution Group:**\n\n`;
        for (let j = 0; j < item.tools.length; j++) {
          const tool = item.tools[j];
          markdown += `#### Tool ${j + 1}: \`${tool.name}\`\n\n`;
          markdown += `| Property | Value |\n`;
          markdown += `|----------|-------|\n`;
          markdown += `| **Call ID** | ${tool.callId} |\n`;
          markdown += `| **Name** | ${tool.name} |\n`;
          markdown += `| **Description** | ${tool.description} |\n`;
          markdown += `| **Status** | ${tool.status} |\n`;
          markdown += `| **Render as Markdown** | ${tool.renderOutputAsMarkdown || false} |\n`;

          if (tool.confirmationDetails) {
            markdown += `\n**Confirmation Details:**\n`;
            markdown += `- Title: ${tool.confirmationDetails.title}\n`;
            markdown += `- Type: ${tool.confirmationDetails.type}\n`;
            if (
              tool.confirmationDetails.type === 'edit' &&
              'fileDiff' in tool.confirmationDetails
            ) {
              markdown += `- File: ${tool.confirmationDetails.fileName}\n`;
              markdown += `- Diff:\n\`\`\`diff\n${tool.confirmationDetails.fileDiff}\n\`\`\`\n`;
            } else if (
              tool.confirmationDetails.type === 'exec' &&
              'command' in tool.confirmationDetails
            ) {
              markdown += `- Command: \`${tool.confirmationDetails.command}\`\n`;
            }
          }

          if (tool.resultDisplay) {
            markdown += `\n**Tool Result:**\n`;
            if (typeof tool.resultDisplay === 'string') {
              markdown += `\`\`\`\n${tool.resultDisplay}\n\`\`\`\n`;
            } else if (
              typeof tool.resultDisplay === 'object' &&
              'fileDiff' in tool.resultDisplay
            ) {
              markdown += `**File:** ${tool.resultDisplay.fileName}\n`;
              markdown += `**Diff:**\n\`\`\`diff\n${tool.resultDisplay.fileDiff}\n\`\`\`\n`;
            }
          }
          markdown += `\n`;
        }
        break;

      case 'info':
        markdown += `**ℹ️ System Info:**\n\n`;
        markdown += `> ${item.text}\n\n`;
        break;

      case 'error':
        markdown += `**❌ Error:**\n\n`;
        markdown += `> ⚠️ ${item.text}\n\n`;
        break;

      case 'about':
        markdown += `**📋 About Information:**\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| **CLI Version** | ${item.cliVersion} |\n`;
        markdown += `| **OS Version** | ${item.osVersion} |\n`;
        markdown += `| **Sandbox Environment** | ${item.sandboxEnv} |\n`;
        markdown += `| **Model Version** | ${item.modelVersion} |\n`;
        markdown += `| **Auth Type** | ${item.selectedAuthType} |\n`;
        markdown += `| **GCP Project** | ${item.gcpProject || 'N/A'} |\n`;
        markdown += `\n`;
        break;

      case 'stats':
        markdown += `**📊 Session Statistics:**\n\n`;
        markdown += `**Duration:** ${item.duration}\n\n`;
        break;

      case 'quit':
        markdown += `**👋 Session End:**\n\n`;
        markdown += `**Session Duration:** ${item.duration}\n\n`;
        break;

      case 'compression':
        markdown += `**🗜️ Chat Compression:**\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| **Is Pending** | ${item.compression.isPending} |\n`;
        markdown += `| **Original Tokens** | ${item.compression.originalTokenCount?.toLocaleString() || 'N/A'} |\n`;
        markdown += `| **Compressed Tokens** | ${item.compression.newTokenCount?.toLocaleString() || 'N/A'} |\n`;
        if (
          item.compression.originalTokenCount &&
          item.compression.newTokenCount
        ) {
          const compressionRatio = (
            ((item.compression.originalTokenCount -
              item.compression.newTokenCount) /
              item.compression.originalTokenCount) *
            100
          ).toFixed(1);
          markdown += `| **Compression Ratio** | ${compressionRatio}% |\n`;
        }
        markdown += `\n`;
        break;

      default:
        markdown += `**🔍 Unknown Item Type:**\n\n`;
        markdown += `\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\n`;
        break;
    }

    markdown += `---\n\n`;
  }

  // === RAW CORE HISTORY (APPENDIX) ===
  if (coreHistory.length > 0) {
    markdown += `## 🔧 Raw Core Conversation History\n\n`;
    markdown += `<details>\n<summary>Click to expand raw API conversation data (${coreHistory.length} items)</summary>\n\n`;
    markdown += `\`\`\`json\n${JSON.stringify(coreHistory, null, 2)}\n\`\`\`\n\n`;
    markdown += `</details>\n\n`;
  }

  // === FOOTER ===
  markdown += `---\n\n`;
  markdown += `*Generated by Gemini CLI v${exportInfo.cliVersion} on ${exportInfo.exportTime}*\n`;
  markdown += `*Export includes ${conversationLength} UI history items and ${coreHistoryLength} core history items*\n`;

  return markdown;
};
