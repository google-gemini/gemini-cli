/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from '@google/gemini-cli-core';
import { useI18n } from '../../i18n/hooks.js';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const { t } = useI18n();
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column">
      <Text color={Colors.Foreground}>{t('ui.tips.gettingStarted')}</Text>
      <Text color={Colors.Foreground}>
        {t('ui.tips.askQuestions')}
      </Text>
      <Text color={Colors.Foreground}>
        {t('ui.tips.beSpecific')}
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={Colors.Foreground}>
          3. {t('ui.tips.createFiles')}{' '}
          <Text bold color={Colors.AccentPurple}>
            GEMINI.md
          </Text>{' '}
          {t('ui.tips.filesForContext')}
        </Text>
      )}
      <Text color={Colors.Foreground}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        {t('ui.tips.helpCommand')}
      </Text>
    </Box>
  );
};
