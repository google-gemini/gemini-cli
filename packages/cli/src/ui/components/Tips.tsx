/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type Config } from '@google/gemini-cli-core';
import { t } from '../utils/i18n.js';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column">
      <Text color={theme.text.primary}>{t('tips.header')}</Text>
      <Text color={theme.text.primary}>{t('tips.step1')}</Text>
      <Text color={theme.text.primary}>{t('tips.step2')}</Text>
      {geminiMdFileCount === 0 && (
        <Text color={theme.text.primary}>
          {t('tips.step3.custom', { file: 'GEMINI.md' })}
        </Text>
      )}
      <Text color={theme.text.primary}>
        {t('tips.help', {
          num: geminiMdFileCount === 0 ? '4.' : '3.',
          help: '/help',
        })}
      </Text>
    </Box>
  );
};
