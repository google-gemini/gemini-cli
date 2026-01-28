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
import { t } from '../../i18n/index.js';
import { MessageType } from '../types.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatBytes } from '../utils/formatters.js';
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
    let sandboxEnv = t('commands:bug.responses.noSandbox');
    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      sandboxEnv = process.env['SANDBOX'].replace(/^gemini-(?:code-)?/, '');
    } else if (process.env['SANDBOX'] === 'sandbox-exec') {
      sandboxEnv = `sandbox-exec (${
        process.env['SEATBELT_PROFILE'] || t('commands:bug.responses.unknown')
      })`;
    }
    const modelVersion =
      config?.getModel() || t('commands:bug.responses.unknown');
    const cliVersion = await getVersion();
    const memoryUsage = formatBytes(process.memoryUsage().rss);
    const ideClient = await getIdeClientName(context);
    const terminalName =
      terminalCapabilityManager.getTerminalName() ||
      t('commands:bug.responses.unknown');
    const terminalBgColor =
      terminalCapabilityManager.getTerminalBackgroundColor() ||
      t('commands:bug.responses.unknown');
    const kittyProtocol = terminalCapabilityManager.isKittyProtocolEnabled()
      ? t('commands:bug.responses.supported')
      : t('commands:bug.responses.unsupported');
    const authType = config?.getContentGeneratorConfig()?.authType || 'Unknown';

    let info = t('commands:bug.responses.info', {
      cliVersion,
      gitCommit: GIT_COMMIT_INFO,
      sessionId,
      os: osVersion,
      sandbox: sandboxEnv,
      model: modelVersion,
      authType: authType,
      memory: memoryUsage,
      terminalName,
      terminalBg: terminalBgColor,
      kitty: kittyProtocol,
    });
    if (ideClient) {
      info += t('commands:bug.responses.ideClient', { client: ideClient });
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
          historyFileMessage =
            t('commands:bug.responses.historyHeader', {
              path: historyFilePath,
            }) + t('commands:bug.responses.historyFooter');
          problemValue += t('commands:bug.responses.actionRequired');
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
        text: t('commands:bug.responses.submitUrl', {
          url: bugReportUrl,
          message: historyFileMessage,
        }),
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
          text: t('commands:bug.responses.openFailed', { error: errorMessage }),
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
