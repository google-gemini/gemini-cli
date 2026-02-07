/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import * as process from 'node:process';
import * as path from 'node:path';
import { relaunchApp } from '../../utils/processUtils.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { ExitCodes } from '@google/gemini-cli-core';
import { t } from '../utils/i18n.js';

export enum FolderTrustChoice {
  TRUST_FOLDER = 'trust_folder',
  TRUST_PARENT = 'trust_parent',
  DO_NOT_TRUST = 'do_not_trust',
}

interface FolderTrustDialogProps {
  onSelect: (choice: FolderTrustChoice) => void;
  isRestarting?: boolean;
}

export const FolderTrustDialog: React.FC<FolderTrustDialogProps> = ({
  onSelect,
  isRestarting,
}) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isRestarting) {
      timer = setTimeout(async () => {
        await relaunchApp();
      }, 250);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isRestarting]);

  const handleExit = useCallback(() => {
    setExiting(true);
    // Give time for the UI to render the exiting message
    setTimeout(async () => {
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_CANCELLATION_ERROR);
    }, 100);
  }, []);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleExit();
        return true;
      }
      return false;
    },
    { isActive: !isRestarting },
  );

  const dirName = path.basename(process.cwd());
  const parentFolder = path.basename(path.dirname(process.cwd()));

  const options: Array<RadioSelectItem<FolderTrustChoice>> = [
    {
      label: t('trust.option.folder', { name: dirName }),
      value: FolderTrustChoice.TRUST_FOLDER,
      key: `Trust folder (${dirName})`,
    },
    {
      label: t('trust.option.parent', { name: parentFolder }),
      value: FolderTrustChoice.TRUST_PARENT,
      key: `Trust parent folder (${parentFolder})`,
    },
    {
      label: t('trust.option.none'),
      value: FolderTrustChoice.DO_NOT_TRUST,
      key: "Don't trust",
    },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.warning}
        padding={1}
        marginLeft={1}
        marginRight={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            {t('trust.title')}
          </Text>
          <Text color={theme.text.primary}>{t('trust.description')}</Text>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={onSelect}
          isFocused={!isRestarting}
        />
      </Box>
      {isRestarting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.status.warning}>{t('trust.restarting')}</Text>
        </Box>
      )}
      {exiting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.status.warning}>{t('trust.exiting')}</Text>
        </Box>
      )}
    </Box>
  );
};
