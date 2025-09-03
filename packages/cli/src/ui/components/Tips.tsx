/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from '@google/gemini-cli-core';
import { useTranslation } from '../../i18n/useTranslation.js';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  const { t } = useTranslation('ui');
  return (
    <Box flexDirection="column">
      <Text color={Colors.Foreground}>{t('ui:tips.title')}</Text>
      <Text color={Colors.Foreground}>1. {t('ui:tips.tip1')}</Text>
      <Text color={Colors.Foreground}>2. {t('ui:tips.tip2')}</Text>
      {geminiMdFileCount === 0 && (
        <Text color={Colors.Foreground}>
          3. {t('ui:tips.tip3Before')}{' '}
          <Text bold color={Colors.AccentPurple}>
            GEMINI.md
          </Text>{' '}
          {t('ui:tips.tip3After')}
        </Text>
      )}
      <Text color={Colors.Foreground}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        {t('ui:tips.tip4')}
      </Text>
    </Box>
  );
};
