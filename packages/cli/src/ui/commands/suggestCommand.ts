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
import {
  getContextDetector,
  getSuggestionEngine,
} from '@google/gemini-cli-core';

export const suggestCommand: SlashCommand = {
  name: 'suggest',
  description: 'Show context-aware suggestions',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'show';

    switch (subcommand) {
      case 'show':
        return showSuggestions();
      case 'enable':
        return toggleSuggestions(true);
      case 'disable':
        return toggleSuggestions(false);
      case 'settings':
        return showSettings();
      default:
        return showSuggestions();
    }
  },
};

async function showSuggestions(): Promise<MessageActionReturn> {
  const detector = getContextDetector();
  const engine = getSuggestionEngine();

  const context = await detector.detect();
  const suggestions = await engine.generateSuggestions(context);

  if (suggestions.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No suggestions available for current context.',
    };
  }

  const lines: string[] = ['💡 **Smart Suggestions**\n'];

  for (const suggestion of suggestions) {
    lines.push(`**${suggestion.text}**`);
    lines.push(`${suggestion.description}`);
    if (suggestion.reason) {
      lines.push(`_${suggestion.reason}_`);
    }
    if (suggestion.example) {
      lines.push(`Example: \`${suggestion.example}\``);
    }
    lines.push('');
  }

  return {
    type: 'message',
    messageType: 'info',
    content: lines.join('\n'),
  };
}

function toggleSuggestions(enabled: boolean): MessageActionReturn {
  const engine = getSuggestionEngine();
  engine.setPreferences({ enabled });

  return {
    type: 'message',
    messageType: 'info',
    content: enabled
      ? '✅ Smart suggestions enabled'
      : '❌ Smart suggestions disabled',
  };
}

function showSettings(): MessageActionReturn {
  const engine = getSuggestionEngine();
  const prefs = engine.getPreferences();
  const stats = engine.getStats();

  const lines: string[] = [
    '⚙️ **Suggestion Settings**\n',
    `Enabled: ${prefs.enabled ? '✅' : '❌'}`,
    `Autocomplete: ${prefs.autocompleteEnabled ? '✅' : '❌'}`,
    `Max suggestions: ${prefs.maxSuggestions}`,
    `Min score: ${prefs.minScore}`,
    `Show inline: ${prefs.showInline ? '✅' : '❌'}\n`,
    '**Statistics**',
    `Acceptance rate: ${(stats.acceptanceRate * 100).toFixed(1)}%`,
    `Total accepted: ${stats.totalAccepted}`,
    `Total dismissed: ${stats.totalDismissed}`,
  ];

  return {
    type: 'message',
    messageType: 'info',
    content: lines.join('\n'),
  };
}
