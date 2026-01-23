/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import process from 'node:process';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import {
  IdeClient,
  sessionId,
  getVersion,
  INITIAL_HISTORY_LENGTH,
  debugLogger,
} from '@google/gemini-cli-core';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import { exportHistoryToFile } from '../utils/historyExportUtils.js';
import path from 'node:path';

export const bugCommand: SlashCommand = {
  name: 'bug',
  description: 'Submit a bug report',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const bugDescription = (args || '').trim();
    const { config } = context.services;

    const osVersion = `${process.platform} ${process.version}`;
    let sandboxEnv = 'no sandbox';
    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      sandboxEnv = process.env['SANDBOX'].replace(/^gemini-(?:code-)?/, '');
    } else if (process.env['SANDBOX'] === 'sandbox-exec') {
      sandboxEnv = `sandbox-exec (${
        process.env['SEATBELT_PROFILE'] || 'unknown'
      })`;
    }
    const modelVersion = config?.getModel() || 'Unknown';
    const cliVersion = await getVersion();
    const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);
    const ideClient = await getIdeClientName(context);
    const terminalName =
      terminalCapabilityManager.getTerminalName() || 'Unknown';
    const terminalBgColor =
      terminalCapabilityManager.getTerminalBackgroundColor() || 'Unknown';
    const kittyProtocol = terminalCapabilityManager.isKittyProtocolEnabled()
      ? 'Supported'
      : 'Unsupported';

    let info = `
* **CLI Version:** ${cliVersion}
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Session ID:** ${sessionId}
* **Operating System:** ${osVersion}
* **Sandbox Environment:** ${sandboxEnv}
* **Model Version:** ${modelVersion}
* **Memory Usage:** ${memoryUsage}
* **Terminal Name:** ${terminalName}
* **Terminal Background:** ${terminalBgColor}
* **Kitty Keyboard Protocol:** ${kittyProtocol}
`;
    if (ideClient) {
      info += `* **IDE Client:** ${ideClient}\n`;
    }

    const chat = config?.getGeminiClient()?.getChat();
    const history = chat?.getHistory() || [];
    let historyFileMessage = '';
    let problemValue = bugDescription;

    if (history.length > INITIAL_HISTORY_LENGTH) {
      const tempDir = config?.storage?.getProjectTempDir();
      if (tempDir) {
        const historyFileName = `bug-report-history-${Date.now()}.json`;
        const historyFilePath = path.join(tempDir, historyFileName);
        try {
          await exportHistoryToFile({ history, filePath: historyFilePath });
          historyFileMessage = `\n\n--------------------------------------------------------------------------------\n\n📄 **Chat History Exported**\nTo help us debug, we've exported your current chat history to:\n${historyFilePath}\n\nPlease consider attaching this file to your GitHub issue if you feel comfortable doing so.\n\n**Privacy Disclaimer:** Please do not upload any logs containing sensitive or private information that you are not comfortable sharing publicly.`;
          problemValue += `\n\n[ACTION REQUIRED] 📎 PLEASE ATTACH THE EXPORTED CHAT HISTORY JSON FILE TO THIS ISSUE IF YOU FEEL COMFORTABLE SHARING IT.`;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          debugLogger.error(
            `Failed to export chat history for bug report: ${errorMessage}`,
          );
        }
      }
    }

    let bugReportUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';

    const bugCommandSettings = config?.getBugCommand();
    if (bugCommandSettings?.urlTemplate) {
      bugReportUrl = bugCommandSettings.urlTemplate;
    }

    bugReportUrl = bugReportUrl
      .replace('{title}', encodeURIComponent(bugDescription))
      .replace('{info}', encodeURIComponent(info))
      .replace('{problem}', encodeURIComponent(problemValue));

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `To submit your bug report, please open the following URL in your browser:\n${bugReportUrl}${historyFileMessage}`,
      },
      Date.now(),
    );

    try {
      await open(bugReportUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Could not open URL in browser: ${errorMessage}`,
        },
        Date.now(),
      );
    }
  },
};

async function getIdeClientName(context: CommandContext) {
  if (!context.services.config?.getIdeMode()) {
    return '';
  }
  const ideClient = await IdeClient.getInstance();
  return ideClient.getDetectedIdeDisplayName() ?? '';
}
