/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { SettingScope } from '../../config/settings.js';

/**
 * Toggles speech-friendly output mode on/off.
 *
 * When enabled, model responses are post-processed through the speech
 * formatter which strips markdown, converts symbols to words, linearizes
 * tables, and numbers bullet points -- making the output more accessible
 * for screen readers and text-to-speech engines.
 *
 * The state is persisted via the `ui.accessibility.speechMode` setting.
 */
export const speechCommand: SlashCommand = {
  name: 'speech',
  altNames: ['tts'],
  description: 'Toggle speech-friendly output formatting for screen readers',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const settings = context.services.settings;
    const currentValue =
      settings.merged?.ui?.accessibility?.speechMode ?? false;
    const newValue = !currentValue;

    // Persist the toggle so it takes effect via the settings store.
    settings.setValue(
      SettingScope.User,
      'ui.accessibility.speechMode',
      newValue,
    );

    const message = newValue
      ? 'Speech-friendly output enabled. Responses will be formatted for screen readers. Run /speech again to disable.'
      : 'Speech-friendly output disabled. Responses will use standard markdown rendering.';

    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};
