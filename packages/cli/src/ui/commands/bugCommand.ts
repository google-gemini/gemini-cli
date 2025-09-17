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
import { getCliVersion } from '../../utils/version.js';
import { IdeClient, sessionId } from '@google/gemini-cli-core';

export const bugCommand: SlashCommand = {
  name: 'bug',
  description: 'submit a bug report',
  kind: CommandKind.BUILT_IN,
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
    const cliVersion = await getCliVersion();
    const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);
    const ideClient = await getIdeClientName(context);

    // Attempt to include last prompt and response (if available)
    let lastPrompt = '';
    let lastResponse = '';
    try {
      const history = context.services.config?.getGeminiClient()?.getHistory();
      if (history && history.length > 0) {
        const last = history[history.length - 1];
        const prev = history.length > 1 ? history[history.length - 2] : null;
        const extractText = (parts?: { text?: string }[]) =>
          (parts || [])
            .map((p) => (typeof p?.text === 'string' ? p.text : ''))
            .join('');
        if (last?.role === 'model') {
          lastResponse = extractText(last.parts as unknown as { text?: string }[]);
          if (prev?.role === 'user') lastPrompt = extractText(prev.parts as unknown as { text?: string }[]);
        } else if (last?.role === 'user') {
          lastPrompt = extractText(last.parts as unknown as { text?: string }[]);
        }
      }
    } catch (_) {
      // best-effort only
    }

    let info = `
* **CLI Version:** ${cliVersion}
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Session ID:** ${sessionId}
* **Operating System:** ${osVersion}
* **Sandbox Environment:** ${sandboxEnv}
* **Model Version:** ${modelVersion}
* **Memory Usage:** ${memoryUsage}
`;
    if (ideClient) {
      info += `* **IDE Client:** ${ideClient}\n`;
    }
    if (lastPrompt) {
      info += `* **Last Prompt:**\n\n${lastPrompt}\n\n`;
    }
    if (lastResponse) {
      info += `* **Last Response:**\n\n${lastResponse}\n`;
    }

    let bugReportUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}';

    const bugCommandSettings = config?.getBugCommand();
    if (bugCommandSettings?.urlTemplate) {
      bugReportUrl = bugCommandSettings.urlTemplate;
    }

    bugReportUrl = bugReportUrl
      .replace('{title}', encodeURIComponent(bugDescription))
      .replace('{info}', encodeURIComponent(info));

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `To submit your bug report, please open the following URL in your browser:\n${bugReportUrl}`,
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
