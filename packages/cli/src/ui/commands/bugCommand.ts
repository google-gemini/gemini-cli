/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import process from 'node:process';
import stripAnsi from 'strip-ansi';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { HistoryItem, MessageType } from '../types.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import { getCliVersion } from '../../utils/version.js';

function formatCliResponses(items: HistoryItem[]): string {
  return items
    .reduce((acc, item) => {
      let responseText = '';
      switch (item.type) {
        case 'gemini':
        case 'gemini_content':
          responseText = `✦ ${stripAnsi(item.text)}`;
          break;
        case 'tool_group':
          responseText = item.tools
            .map((tool) => {
              let output = `Tool Call: ${tool.name}, Status: ${
                tool.status
              }, Description: ${tool.description || 'N/A'}`;
              if (
                tool.resultDisplay &&
                typeof tool.resultDisplay === 'object' &&
                'fileDiff' in tool.resultDisplay &&
                tool.resultDisplay.fileDiff
              ) {
                output += `\nTool Response: ${tool.resultDisplay.fileDiff}`;
              } else if (
                tool.resultDisplay &&
                typeof tool.resultDisplay === 'string' &&
                tool.resultDisplay
              ) {
                output += `\nTool Response: ${tool.resultDisplay}`;
              }
              return output;
            })
            .join('\n');
          break;
        case 'error':
          responseText = `✕ ${stripAnsi(item.text)}`;
          break;
        case 'info':
          if (item.text.startsWith('To submit your bug report')) {
            return acc;
          }
          responseText = `ℹ ${stripAnsi(item.text)}`;
          break;
        default:
          return acc;
      }
      acc.push(responseText);
      return acc;
    }, [] as string[])
    .join('\n---\n');
}

export const bugCommand: SlashCommand = {
  name: 'bug',
  description: 'submit a bug report',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const bugDescription = (args || '').trim();
    const { config } = context.services;

    const osVersion = `${process.platform} ${process.version}`;
    let sandboxEnv = 'no sandbox';
    if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
      sandboxEnv = process.env.SANDBOX.replace(/^gemini-(?:code-)?/, '');
    } else if (process.env.SANDBOX === 'sandbox-exec') {
      sandboxEnv = `sandbox-exec (${
        process.env.SEATBELT_PROFILE || 'unknown'
      })`;
    }
    const modelVersion = config?.getModel() || 'Unknown';
    const cliVersion = await getCliVersion();
    const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);

    const lastUserPromptIndex = context.ui.history.findLastIndex(
      (item) => item.type === 'user' && !item.text.startsWith('/bug'),
    );

    const lastUserPrompt =
      lastUserPromptIndex === -1
        ? undefined
        : context.ui.history[lastUserPromptIndex];

    const subsequentItems =
      lastUserPromptIndex === -1
        ? context.ui.history
        : context.ui.history.slice(lastUserPromptIndex + 1);

    const cliResponses = formatCliResponses(subsequentItems);

    const lastCliResponse = cliResponses.length ? cliResponses : 'N/A';

    const problem = [
      '**Last User Prompt**',
      '```',
      lastUserPrompt?.text || 'N/A',
      '```',
      '',
      '**Last Gemini CLI Response**',
      '```',
      lastCliResponse || 'N/A',
      '```',
    ].join('\n');

    const info = `
* **CLI Version:** ${cliVersion}
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Operating System:** ${osVersion}
* **Sandbox Environment:** ${sandboxEnv}
* **Model Version:** ${modelVersion}
* **Memory Usage:** ${memoryUsage}
`;

    let bugReportUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';

    const bugCommandSettings = config?.getBugCommand();
    if (bugCommandSettings?.urlTemplate) {
      bugReportUrl = bugCommandSettings.urlTemplate;
    }

    let url = bugReportUrl
      .replace('{title}', encodeURIComponent(bugDescription))
      .replace('{info}', encodeURIComponent(info))
      .replace('{problem}', encodeURIComponent(problem));

    let wasTruncated = false;
    while (url.length > 8000 && subsequentItems.length > 0) {
      wasTruncated = true;
      subsequentItems.shift();
      const truncatedCliResponses = formatCliResponses(subsequentItems);
      const truncatedLastCliResponse = truncatedCliResponses.length
        ? truncatedCliResponses
        : '... truncated response due to character limit ...';

      const problemText =
        truncatedCliResponses.length > 0 && wasTruncated
          ? `... truncated response due to character limit ...\n${truncatedLastCliResponse}`
          : truncatedLastCliResponse;

      const truncatedProblem = [
        '**Last User Prompt**',
        '```',
        lastUserPrompt?.text || 'N/A',
        '```',
        '',
        '**Last Gemini CLI Response**',
        '```',
        problemText,
        '```',
      ].join('\n');
      url = bugReportUrl
        .replace('{title}', encodeURIComponent(bugDescription))
        .replace('{info}', encodeURIComponent(info))
        .replace('{problem}', encodeURIComponent(truncatedProblem));
    }

    bugReportUrl = url;

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
