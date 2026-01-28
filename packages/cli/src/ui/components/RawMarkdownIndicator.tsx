/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';

export const RawMarkdownIndicator: React.FC = () => {
  const { t } = useTranslation('ui');
  const modKey = process.platform === 'darwin' ? 'option+m' : 'alt+m';
  return (
    <Box>
      <Text>
        {t('rawMarkdown.mode')}
        <Text color={theme.text.secondary}>
          {t('rawMarkdown.toggleHint', { modKey })}
        </Text>
      </Text>
    </Box>
  );
};
