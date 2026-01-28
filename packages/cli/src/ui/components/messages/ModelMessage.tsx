/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';

interface ModelMessageProps {
  model: string;
}

export const ModelMessage: React.FC<ModelMessageProps> = ({ model }) => {
  const { t } = useTranslation('messages');
  return (
    <Box marginLeft={2}>
      <Text color={theme.ui.comment} italic>
        {t('model.respondingWith', { model })}
      </Text>
    </Box>
  );
};
