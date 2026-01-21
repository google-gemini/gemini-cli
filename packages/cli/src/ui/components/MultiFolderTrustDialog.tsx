/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { loadTrustedFolders, TrustLevel } from '../../config/trustedFolders.js';
import { expandHomeDir } from '../utils/directoryUtils.js';
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
  const [submitted, setSubmitted] = useState(false);

  const handleCancel = async () => {
    setSubmitted(true);
    const errors = [...initialErrors];
    errors.push(
      `Operation cancelled. The following directories were not added:\n- ${folders.join(
        '\n- ',
      )}`,
    );
    await finishAddingDirectories(config, addItem, trustedDirs, errors);
    onComplete();
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleCancel();
      }
    },
    { isActive: !submitted },
  );

  const options: Array<RadioSelectItem<MultiFolderTrustChoice>> = [
    {
      label: 'Yes',
      value: MultiFolderTrustChoice.YES,
      key: 'yes',
    },
    {
      label: 'Yes, and remember the directories as trusted',
      value: MultiFolderTrustChoice.YES_AND_REMEMBER,
      key: 'yes-and-remember',
    },
    {
      label: 'No',
      value: MultiFolderTrustChoice.NO,
      key: 'no',
    },
  ];

  const handleSelect = async (choice: MultiFolderTrustChoice) => {
    setSubmitted(true);

    if (!config) {
      addItem({
        type: MessageType.ERROR,
        text: 'Configuration is not available.',
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
        `The following directories were not added because they were not trusted:\n- ${folders.join(
          '\n- ',
        )}`,
      );
    } else {
      for (const dir of folders) {
        try {
          const expandedPath = expandHomeDir(dir);
          if (choice === MultiFolderTrustChoice.YES_AND_REMEMBER) {
            trustedFolders.setValue(expandedPath, TrustLevel.TRUST_FOLDER);
          }
          workspaceContext.addDirectory(expandedPath);
          added.push(dir);
        } catch (e) {
          const error = e as Error;
          errors.push(`Error adding '${dir}': ${error.message}`);
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
            Do you trust the following folders being added to this workspace?
          </Text>
          <Text color={theme.text.secondary}>
            {folders.map((f) => `- ${f}`).join('\n')}
          </Text>
          <Text color={theme.text.primary}>
            Trusting a folder allows Gemini to read and perform auto-edits when
            in auto-approval mode. This is a security feature to prevent
            accidental execution in untrusted directories.
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
          <Text color={theme.text.primary}>Applying trust settings...</Text>
        </Box>
      )}
    </Box>
  );
};
