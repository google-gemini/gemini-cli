/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { CliSpinner } from '../components/CliSpinner.js';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface AuthInProgressProps {
  onTimeout: () => void;
}

export function AuthInProgress({
  onTimeout,
}: AuthInProgressProps): React.JSX.Element {
  const { t } = useTranslation('auth');
  const [timedOut, setTimedOut] = useState(false);

  useKeypress(
    (key) => {
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        onTimeout();
      }
    },
    { isActive: true },
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      onTimeout();
    }, 180000);

    return () => clearTimeout(timer);
  }, [onTimeout]);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {timedOut ? (
        <Text color={theme.status.error}>{t('authInProgress.timedOut')}</Text>
      ) : (
        <Box>
          <Text>
            <CliSpinner type="dots" /> {t('authInProgress.waiting')}
          </Text>
        </Box>
      )}
    </Box>
  );
}
