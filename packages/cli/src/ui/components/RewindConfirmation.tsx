/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import type { FileChangeStats } from '../utils/rewindFileOps.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { formatTimeAgo } from '../utils/formatters.js';
import { keyMatchers, Command } from '../keyMatchers.js';

export enum RewindOutcome {
  RewindAndRevert = 'rewind_and_revert',
  RewindOnly = 'rewind_only',
  RevertOnly = 'revert_only',
  Cancel = 'cancel',
}

interface RewindConfirmationProps {
  stats: FileChangeStats | null;
  onConfirm: (outcome: RewindOutcome) => void;
  terminalWidth: number;
  timestamp?: string;
}

export const RewindConfirmation: React.FC<RewindConfirmationProps> = ({
  stats,
  onConfirm,
  terminalWidth,
  timestamp,
}) => {
  const { t } = useTranslation('dialogs');

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onConfirm(RewindOutcome.Cancel);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const handleSelect = (outcome: RewindOutcome) => {
    onConfirm(outcome);
  };

  const options = useMemo(() => {
    const allOptions: Array<RadioSelectItem<RewindOutcome>> = [
      {
        label: t('rewindConfirmation.rewindAndRevert'),
        value: RewindOutcome.RewindAndRevert,
        key: 'rewindAndRevert',
      },
      {
        label: t('rewindConfirmation.rewindOnly'),
        value: RewindOutcome.RewindOnly,
        key: 'rewindOnly',
      },
      {
        label: t('rewindConfirmation.revertOnly'),
        value: RewindOutcome.RevertOnly,
        key: 'revertOnly',
      },
      {
        label: t('rewindConfirmation.doNothing'),
        value: RewindOutcome.Cancel,
        key: 'doNothing',
      },
    ];

    if (stats) {
      return allOptions;
    }
    return allOptions.filter(
      (option) =>
        option.value !== RewindOutcome.RewindAndRevert &&
        option.value !== RewindOutcome.RevertOnly,
    );
  }, [stats, t]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      padding={1}
      width={terminalWidth}
    >
      <Box marginBottom={1}>
        <Text bold>{t('rewindConfirmation.title')}</Text>
      </Box>

      {stats && (
        <Box
          flexDirection="column"
          marginBottom={1}
          borderStyle="single"
          borderColor={theme.border.default}
          paddingX={1}
        >
          <Text color={theme.text.primary}>
            {stats.fileCount === 1
              ? t('rewindConfirmation.singleFile', {
                  fileName: stats.details?.at(0)?.fileName,
                })
              : t('rewindConfirmation.filesAffected', {
                  count: stats.fileCount,
                })}
          </Text>
          <Box flexDirection="row">
            <Text color={theme.status.success}>
              {t('rewindConfirmation.linesAdded', {
                count: stats.addedLines,
              })}{' '}
            </Text>
            <Text color={theme.status.error}>
              {t('rewindConfirmation.linesRemoved', {
                count: stats.removedLines,
              })}
            </Text>
            {timestamp && (
              <Text color={theme.text.secondary}>
                {' '}
                ({formatTimeAgo(timestamp)})
              </Text>
            )}
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.warning}>
              ℹ {t('rewindConfirmation.infoText')}
            </Text>
          </Box>
        </Box>
      )}

      {!stats && (
        <Box marginBottom={1}>
          <Text color={theme.text.secondary}>
            {t('rewindConfirmation.noChanges')}
          </Text>
          {timestamp && (
            <Text color={theme.text.secondary}>
              {' '}
              ({formatTimeAgo(timestamp)})
            </Text>
          )}
        </Box>
      )}

      <Box marginBottom={1}>
        <Text>{t('rewindConfirmation.selectAction')}</Text>
      </Box>

      <RadioButtonSelect
        items={options}
        onSelect={handleSelect}
        isFocused={true}
      />
    </Box>
  );
};
