/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { SlashCommand, MessageActionReturn } from '../../types.js';
import { CommandKind } from '../../types.js';
import { getExplainMode } from '@google/gemini-cli-core';
import type { VerbosityLevel } from '@google/gemini-cli-core';

export const explainCommand: SlashCommand = {
  name: 'explain',
  description: 'Toggle explain mode for tool transparency',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'toggle';

    switch (subcommand) {
      case 'on':
      case 'enable':
        return enableExplain();
      case 'off':
      case 'disable':
        return disableExplain();
      case 'toggle':
        return toggleExplain();
      case 'status':
        return showStatus();
      case 'brief':
      case 'normal':
      case 'detailed':
        return setVerbosity(subcommand as VerbosityLevel);
      case 'history':
        return showHistory(parseInt(parts[1]) || 10);
      default:
        return toggleExplain();
    }
  },
};

function enableExplain(): MessageActionReturn {
  const explainMode = getExplainMode();
  explainMode.enable();

  return {
    type: 'message',
    messageType: 'info',
    content:
      '✅ **Explain Mode Enabled**\n\nGemini will now explain tool usage and provide educational tips.\n\nCommands:\n- /explain off - Disable\n- /explain brief - Minimal explanations\n- /explain normal - Standard explanations (default)\n- /explain detailed - Comprehensive explanations',
  };
}

function disableExplain(): MessageActionReturn {
  const explainMode = getExplainMode();
  explainMode.disable();

  return {
    type: 'message',
    messageType: 'info',
    content: '❌ **Explain Mode Disabled**\n\nRun /explain on to re-enable.',
  };
}

function toggleExplain(): MessageActionReturn {
  const explainMode = getExplainMode();
  const enabled = explainMode.toggle();

  return {
    type: 'message',
    messageType: 'info',
    content: enabled
      ? '✅ Explain mode enabled'
      : '❌ Explain mode disabled',
  };
}

function showStatus(): MessageActionReturn {
  const explainMode = getExplainMode();
  const config = explainMode.getConfig();
  const stats = explainMode.getStats();

  const lines: string[] = [
    '📖 **Explain Mode Status**\n',
    `Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`,
    `Verbosity: ${config.verbosity}`,
    `Show tips: ${config.showTips ? '✅' : '❌'}`,
    `Show reasoning: ${config.showReasoning ? '✅' : '❌'}`,
    `Show tools: ${config.showTools ? '✅' : '❌'}\n`,
    '**Statistics**',
    `Total explanations: ${stats.totalExplanations}`,
    `Tips shown: ${stats.tipsShown}`,
  ];

  if (Object.keys(stats.byTool).length > 0) {
    lines.push('\n**Most Used Tools:**');
    const sorted = Object.entries(stats.byTool)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    for (const [tool, count] of sorted) {
      lines.push(`- ${tool}: ${count} times`);
    }
  }

  return {
    type: 'message',
    messageType: 'info',
    content: lines.join('\n'),
  };
}

function setVerbosity(level: VerbosityLevel): MessageActionReturn {
  const explainMode = getExplainMode();
  explainMode.setVerbosity(level);

  const descriptions = {
    brief: 'Brief - One-sentence explanations',
    normal: 'Normal - Balanced detail level (recommended)',
    detailed: 'Detailed - Comprehensive explanations with examples',
  };

  return {
    type: 'message',
    messageType: 'info',
    content: `📖 Verbosity set to **${level}**\n\n${descriptions[level]}`,
  };
}

function showHistory(limit: number): MessageActionReturn {
  const explainMode = getExplainMode();
  const recent = explainMode.getRecentExplanations(limit);

  if (recent.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No explanations in history yet.',
    };
  }

  const lines: string[] = [`📚 **Recent Explanations** (${recent.length})\n`];

  for (const exp of recent.reverse()) {
    lines.push(`**${exp.request}**`);
    lines.push(`Tools: ${exp.tools.map((t) => t.toolName).join(', ')}`);
    lines.push('');
  }

  return {
    type: 'message',
    messageType: 'info',
    content: lines.join('\n'),
  };
}
