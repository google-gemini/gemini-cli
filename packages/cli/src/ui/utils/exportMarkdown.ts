/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { CumulativeStats } from '../contexts/SessionContext.js';
import type { HistoryItem } from '../types.js';

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
      cumulative: CumulativeStats;
      currentTurn: CumulativeStats;
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
  markdown += `| **Total Turns** | ${sessionStats.cumulative.turnCount} |\n`;
  markdown += `| **Total Tokens** | ${sessionStats.cumulative.totalTokenCount.toLocaleString()} |\n`;
  markdown += `| **Prompt Tokens** | ${sessionStats.cumulative.promptTokenCount.toLocaleString()} |\n`;
  markdown += `| **Response Tokens** | ${sessionStats.cumulative.candidatesTokenCount.toLocaleString()} |\n`;
  markdown += `| **Cached Tokens** | ${sessionStats.cumulative.cachedContentTokenCount.toLocaleString()} |\n`;
  markdown += `| **Tool Use Tokens** | ${sessionStats.cumulative.toolUsePromptTokenCount.toLocaleString()} |\n`;
  markdown += `| **Thoughts Tokens** | ${sessionStats.cumulative.thoughtsTokenCount.toLocaleString()} |\n`;
  markdown += `| **Total API Time** | ${sessionStats.cumulative.apiTimeMs.toLocaleString()} ms |\n`;
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

          /*
          if (tool.confirmationDetails) {
            markdown += `\n**Confirmation Details:**\n`;
            markdown += `- Message: ${tool.confirmationDetails}\n`;
            if (tool.confirmationDetails) {
              markdown += `- Details:\n\`\`\`\n${tool.confirmationDetails}\n\`\`\`\n`;
            }
          }

          if (tool.resultDisplay) {
            markdown += `\n**Tool Result:**\n`;
            if (tool.resultDisplay.output) {
              markdown += `\`\`\`\n${tool.resultDisplay.output}\n\`\`\`\n`;
            }
            if (tool.resultDisplay.error) {
              markdown += `**Error:** ${tool.resultDisplay.error}\n`;
            }
          }
          */

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
        markdown += `| Metric | Cumulative | Last Turn |\n`;
        markdown += `|--------|------------|----------|\n`;
        markdown += `| **Turns** | ${item.stats.turnCount} | ${item.lastTurnStats.turnCount} |\n`;
        markdown += `| **Total Tokens** | ${item.stats.totalTokenCount.toLocaleString()} | ${item.lastTurnStats.totalTokenCount.toLocaleString()} |\n`;
        markdown += `| **Prompt Tokens** | ${item.stats.promptTokenCount.toLocaleString()} | ${item.lastTurnStats.promptTokenCount.toLocaleString()} |\n`;
        markdown += `| **Response Tokens** | ${item.stats.candidatesTokenCount.toLocaleString()} | ${item.lastTurnStats.candidatesTokenCount.toLocaleString()} |\n`;
        markdown += `| **API Time (ms)** | ${item.stats.apiTimeMs.toLocaleString()} | ${item.lastTurnStats.apiTimeMs.toLocaleString()} |\n`;
        markdown += `\n**Duration:** ${item.duration}\n\n`;
        break;

      case 'quit':
        markdown += `**👋 Session End:**\n\n`;
        markdown += `**Final Statistics:**\n`;
        markdown += `| Metric | Value |\n`;
        markdown += `|--------|-------|\n`;
        markdown += `| **Total Turns** | ${item.stats.turnCount} |\n`;
        markdown += `| **Total Tokens** | ${item.stats.totalTokenCount.toLocaleString()} |\n`;
        markdown += `| **Session Duration** | ${item.duration} |\n`;
        markdown += `\n`;
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
