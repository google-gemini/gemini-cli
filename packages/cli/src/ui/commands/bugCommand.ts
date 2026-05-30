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
import { formatBytes } from '../utils/formatters.js';
import {
  IdeClient,
  getVersion,
  INITIAL_HISTORY_LENGTH,
  debugLogger,
} from '@google/gemini-cli-core';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import { exportHistoryToFile } from '../utils/historyExportUtils.js';
import {
  captureHeapSnapshot,
  MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES,
} from '../utils/memorySnapshot.js';
import { mkdtempSync } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BUG_REPORT_URL_TEMPLATE =
  'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';
const SHORT_BUG_REPORT_URL_TEMPLATE =
  'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}';
const MAX_BUG_REPORT_URL_LENGTH = 8000;

export const bugCommand: SlashCommand = {
  name: 'bug',
  description: 'Submit a bug report',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const bugDescription = (args || '').trim();
    const agentContext = context.services.agentContext;
    const config = agentContext?.config;
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
    const memoryUsage = formatBytes(process.memoryUsage().rss);
    const ideClient = await getIdeClientName(context);
    const terminalName =
      terminalCapabilityManager.getTerminalName() || 'Unknown';
    const terminalBgColor =
      terminalCapabilityManager.getTerminalBackgroundColor() || 'Unknown';
    const kittyProtocol = terminalCapabilityManager.isKittyProtocolEnabled()
      ? 'Supported'
      : 'Unsupported';
    const authType = config?.getContentGeneratorConfig()?.authType || 'Unknown';

    let info = `
* **CLI Version:** ${cliVersion}
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Session ID:** ${config?.getSessionId() || 'Unknown'}
* **Operating System:** ${osVersion}
* **Sandbox Environment:** ${sandboxEnv}
* **Model Version:** ${modelVersion}
* **Auth Type:** ${authType}
* **Memory Usage:** ${memoryUsage}
* **Terminal Name:** ${terminalName}
* **Terminal Background:** ${terminalBgColor}
* **Kitty Keyboard Protocol:** ${kittyProtocol}
`;
    if (ideClient) {
      info += `* **IDE Client:** ${ideClient}\n`;
    }

    const chat = agentContext?.geminiClient?.getChat();
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

    const bugCommandSettings = config?.getBugCommand();
    const bugReportUrlTemplate =
      bugCommandSettings?.urlTemplate ?? DEFAULT_BUG_REPORT_URL_TEMPLATE;
    let bugReportUrl = buildBugReportUrl(
      bugReportUrlTemplate,
      bugDescription,
      info,
      problemValue,
    );
    let longUrlFallbackMessage = '';

    if (bugReportUrl.length > MAX_BUG_REPORT_URL_LENGTH) {
      const tempDir = config?.storage?.getProjectTempDir();
      if (tempDir) {
        try {
          const bugReportDir = mkdtempSync(path.join(tempDir, 'bug-report-'));
          const bugReportFilePath = path.join(bugReportDir, 'report.md');
          await writeFile(
            bugReportFilePath,
            formatBugReportFile(bugDescription, info, problemValue),
            'utf8',
          );
          const fallbackProblem = `The full bug report was too large to place in a browser URL. It was saved locally at:\n${bugReportFilePath}\n\nPlease paste the file contents into this issue before submitting.`;
          const fallbackTitle = shortenBugTitle(bugDescription);
          bugReportUrl = bugCommandSettings?.urlTemplate
            ? buildBugReportUrl(
                bugReportUrlTemplate,
                fallbackTitle,
                '',
                fallbackProblem,
              )
            : buildBugReportUrl(
                SHORT_BUG_REPORT_URL_TEMPLATE,
                fallbackTitle,
                '',
                '',
              );
          longUrlFallbackMessage = `\n\n--------------------------------------------------------------------------------\n\nFull bug report saved to:\n${bugReportFilePath}\n\nThe generated report was too large for a browser URL. Paste the saved markdown into the GitHub issue before submitting.`;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          debugLogger.error(
            `Failed to write oversized bug report: ${errorMessage}`,
          );
        }
      }
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `To submit your bug report, please open the following URL in your browser:\n${bugReportUrl}${historyFileMessage}${longUrlFallbackMessage}`,
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

    const rss = process.memoryUsage().rss;
    const tempDir = config?.storage?.getProjectTempDir();
    if (rss >= MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES && tempDir) {
      const snapshotPath = path.join(
        tempDir,
        `bug-memory-${Date.now()}.heapsnapshot`,
      );
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `High memory usage detected (${formatBytes(rss)}). Capturing V8 heap snapshot to ${snapshotPath}.\nThis can take 20+ seconds and the CLI may be temporarily unresponsive; please do not exit.`,
        },
        Date.now(),
      );
      try {
        const startedAt = Date.now();
        await captureHeapSnapshot(snapshotPath);
        const durationMs = Date.now() - startedAt;
        let sizeText = '';
        try {
          const { size } = await stat(snapshotPath);
          sizeText = ` (${formatBytes(size)})`;
        } catch {
          // Size reporting is best-effort; the snapshot itself was captured successfully.
        }
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Heap snapshot saved${sizeText} in ${durationMs}ms:\n${snapshotPath}\n\nConsider attaching it to your bug report only if it does not contain sensitive information.`,
          },
          Date.now(),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        debugLogger.error(
          `Failed to capture heap snapshot for bug report: ${errorMessage}`,
        );
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to capture heap snapshot: ${errorMessage}`,
          },
          Date.now(),
        );
      }
    }
  },
};

async function getIdeClientName(context: CommandContext) {
  if (!context.services.agentContext?.config.getIdeMode()) {
    return '';
  }
  const ideClient = await IdeClient.getInstance();
  return ideClient.getDetectedIdeDisplayName() ?? '';
}

function buildBugReportUrl(
  template: string,
  title: string,
  info: string,
  problem: string,
) {
  return template
    .replace('{title}', encodeURIComponent(title))
    .replace('{info}', encodeURIComponent(info))
    .replace('{problem}', encodeURIComponent(problem));
}

function formatBugReportFile(title: string, info: string, problem: string) {
  return `# ${title || 'Bug report'}

## Client information

${info.trim()}

## Problem

${problem || '_No description provided._'}
`;
}

function shortenBugTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return 'Bug report';
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}
