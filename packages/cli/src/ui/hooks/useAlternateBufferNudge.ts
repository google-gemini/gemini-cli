/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { persistentState } from '../../utils/persistentState.js';
import { coreEvents } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import {
  isJetBrainsTerminal,
  shouldDisableAlternateBufferByDefault,
} from '../../utils/terminalEnvironment.js';

const MAX_NUDGE_COUNT = 3;

export function useAlternateBufferNudge(settings: LoadedSettings) {
  const useAlt = settings.merged.ui?.useAlternateBuffer;
  const forceAlt = settings.merged.ui?.forceAlternateBuffer;

  useEffect(() => {
    const isUnsupportedEnv = shouldDisableAlternateBufferByDefault();
    // Only show the nudge if the feature is enabled by the user (or by default)
    // but is being automatically disabled by the environment detection.
    const isAutoDisabled = useAlt !== false && isUnsupportedEnv && !forceAlt;

    if (isAutoDisabled) {
      const currentCount =
        persistentState.get('alternateBufferNudgeCount') || 0;

      if (currentCount < MAX_NUDGE_COUNT) {
        let message: string;
        if (isJetBrainsTerminal()) {
          message =
            'Alternate buffer is disabled in JetBrains terminal. Enable "Force Alternate Screen Buffer" in /settings to override. See https://github.com/google-gemini/gemini-cli/issues/13614 for details.';
        } else {
          message =
            'Alternate buffer is disabled by default in this environment. Enable "Force Alternate Screen Buffer" in /settings to override.';
        }

        coreEvents.emitFeedback('info', message);

        persistentState.set('alternateBufferNudgeCount', currentCount + 1);
      }
    }
  }, [useAlt, forceAlt]);
}
