/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type Config } from '@google/gemini-cli-core';
import { useSettings } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  const settings = useSettings();
  const hasIncrementedRef = useRef(false);

  useEffect(() => {
    // Only execute once
    if (hasIncrementedRef.current) return;

    // Only execute if we are currently showing tips (which is implied by this component being rendered)
    if (settings.merged.ui.hideTips) return;

    hasIncrementedRef.current = true;
    const currentCount = settings.merged.internal?.tipsShownCount ?? 0;

    // If the count is already above the threshold, the user must have manually
    // re-enabled tips (since we auto-hid them at 11). We respect that choice
    // and stop tracking/auto-hiding.
    if (currentCount > 10) {
      return;
    }

    const newCount = currentCount + 1;

    // We increment the count first.
    settings.setValue(SettingScope.User, 'internal.tipsShownCount', newCount);

    // Then, if we just crossed the threshold, we auto-hide.
    // Using > 10 means we show it for the 10th time, then hide it for the next run.
    if (newCount > 10) {
      settings.setValue(SettingScope.User, 'ui.hideTips', true);
    }
  }, [settings]);

  return (
    <Box flexDirection="column">
      <Text color={theme.text.primary}>Tips for getting started:</Text>
      <Text color={theme.text.primary}>
        1. Ask questions, edit files, or run commands.
      </Text>
      <Text color={theme.text.primary}>
        2. Be specific for the best results.
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={theme.text.primary}>
          3. Create{' '}
          <Text bold color={theme.text.accent}>
            GEMINI.md
          </Text>{' '}
          files to customize your interactions with Gemini.
        </Text>
      )}
      <Text color={theme.text.primary}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={theme.text.accent}>
          /help
        </Text>{' '}
        for more information.
      </Text>
    </Box>
  );
};
