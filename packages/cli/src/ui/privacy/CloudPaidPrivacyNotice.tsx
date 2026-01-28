/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface CloudPaidPrivacyNoticeProps {
  onExit: () => void;
}

export const CloudPaidPrivacyNotice = ({
  onExit,
}: CloudPaidPrivacyNoticeProps) => {
  const { t } = useTranslation('privacy');
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.text.accent}>
        {t('cloudPaid.title')}
      </Text>
      <Newline />
      <Text color={theme.text.primary}>{t('cloudPaid.body')}</Text>
      <Newline />
      <Text color={theme.text.primary}>
        <Text color={theme.text.link}>[1]</Text>{' '}
        https://cloud.google.com/terms/service-terms
      </Text>
      <Text color={theme.text.primary}>
        <Text color={theme.status.success}>[2]</Text>{' '}
        https://cloud.google.com/terms/services
      </Text>
      <Newline />
      <Text color={theme.text.secondary}>{t('cloudPaid.exitHint')}</Text>
    </Box>
  );
};
