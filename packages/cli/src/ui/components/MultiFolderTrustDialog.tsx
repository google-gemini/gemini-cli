/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { loadTrustedFolders, TrustLevel } from '../../config/trustedFolders.js';
import { expandHomeDir } from '../utils/directoryUtils.js';
import * as path from 'node:path';
import { MessageType, type HistoryItem } from '../types.js';
import type { Config } from '@google/gemini-cli-core';

export enum MultiFolderTrustChoice {
  YES,
  YES_AND_REMEMBER,
  NO,
}

export interface MultiFolderTrustDialogProps {
  folders: string[];
  onComplete: () => void;
  trustedDirs: string[];
  errors: string[];
  finishAddingDirectories: (
    config: Config,
    addItem: (
      itemData: Omit<HistoryItem, 'id'>,
      baseTimestamp?: number,
    ) => number,
    added: string[],
    errors: string[],
  ) => Promise<void>;
  config: Config;
  addItem: (
    itemData: Omit<HistoryItem, 'id'>,
    baseTimestamp?: number,
  ) => number;
}

export const MultiFolderTrustDialog: React.FC<MultiFolderTrustDialogProps> = ({
  folders,
  onComplete,
  trustedDirs,
  errors: initialErrors,
  finishAddingDirectories,
  config,
  addItem,
}) => {
  const { t } = useTranslation('dialogs');
  const [submitted, setSubmitted] = useState(false);

  const handleCancel = async () => {
    setSubmitted(true);
    const errors = [...initialErrors];
    errors.push(
      t('multiFolderTrust.cancelled', { folders: folders.join('\n- ') }),
    );
    await finishAddingDirectories(config, addItem, trustedDirs, errors);
    onComplete();
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleCancel();
        return true;
      }
      return false;
    },
    { isActive: !submitted },
  );

  const options: Array<RadioSelectItem<MultiFolderTrustChoice>> = useMemo(
    () => [
      {
        label: t('multiFolderTrust.yes'),
        value: MultiFolderTrustChoice.YES,
        key: 'yes',
      },
      {
        label: t('multiFolderTrust.yesAndRemember'),
        value: MultiFolderTrustChoice.YES_AND_REMEMBER,
        key: 'yes-and-remember',
      },
      {
        label: t('multiFolderTrust.no'),
        value: MultiFolderTrustChoice.NO,
        key: 'no',
      },
    ],
    [t],
  );

  const handleSelect = async (choice: MultiFolderTrustChoice) => {
    setSubmitted(true);

    if (!config) {
      addItem({
        type: MessageType.ERROR,
        text: t('multiFolderTrust.configUnavailable'),
      });
      onComplete();
      return;
    }

    const workspaceContext = config.getWorkspaceContext();
    const trustedFolders = loadTrustedFolders();
    const errors = [...initialErrors];
    const added = [...trustedDirs];

    if (choice === MultiFolderTrustChoice.NO) {
      errors.push(
        t('multiFolderTrust.notTrusted', { folders: folders.join('\n- ') }),
      );
    } else {
      for (const dir of folders) {
        try {
          const expandedPath = path.resolve(expandHomeDir(dir));
          if (choice === MultiFolderTrustChoice.YES_AND_REMEMBER) {
            trustedFolders.setValue(expandedPath, TrustLevel.TRUST_FOLDER);
          }
          workspaceContext.addDirectory(expandedPath);
          added.push(dir);
        } catch (e) {
          const error = e as Error;
          errors.push(
            t('multiFolderTrust.errorAdding', {
              dir,
              message: error.message,
            }),
          );
        }
      }
    }

    await finishAddingDirectories(config, addItem, added, errors);
    onComplete();
  };

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
            {t('multiFolderTrust.question')}
          </Text>
          <Text color={theme.text.secondary}>
            {folders.map((f) => `- ${f}`).join('\n')}
          </Text>
          <Text color={theme.text.primary}>
            {t('multiFolderTrust.description')}
          </Text>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={handleSelect}
          isFocused={!submitted}
        />
      </Box>
      {submitted && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.text.primary}>
            {t('multiFolderTrust.applying')}
          </Text>
        </Box>
      )}
    </Box>
  );
};
