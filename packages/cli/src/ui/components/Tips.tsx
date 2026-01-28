/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { type Config } from '@google/gemini-cli-core';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const { t } = useTranslation('ui');
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column">
      <Text color={theme.text.primary}>{t('tipsDisplay.title')}</Text>
      <Text color={theme.text.primary}>{t('tipsDisplay.tip1')}</Text>
      <Text color={theme.text.primary}>{t('tipsDisplay.tip2')}</Text>
      {geminiMdFileCount === 0 && (
        <Text color={theme.text.primary}>
          3.{' '}
          {t('tipsDisplay.tip3_geminiMd')
            .split('GEMINI.md')
            .map((part, i) => (
              <React.Fragment key={i}>
                {part}
                {i === 0 && (
                  <Text bold color={theme.text.accent}>
                    GEMINI.md
                  </Text>
                )}
              </React.Fragment>
            ))}
        </Text>
      )}
      <Text color={theme.text.primary}>
        {t('tipsDisplay.tip_help', {
          number: geminiMdFileCount === 0 ? '4' : '3',
        })
          .split('/help')
          .map((part, i) => (
            <React.Fragment key={i}>
              {part}
              {i === 0 && (
                <Text bold color={theme.text.accent}>
                  /help
                </Text>
              )}
            </React.Fragment>
          ))}
      </Text>
    </Box>
  );
};
