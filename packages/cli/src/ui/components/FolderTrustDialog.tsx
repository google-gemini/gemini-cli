/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import React from 'react';
import { Colors } from '../colors.js';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import * as process from 'process';

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
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(FolderTrustChoice.DO_NOT_TRUST);
      }
    },
    { isActive: !isRestarting },
  );

  useKeypress(
    (key) => {
      if (key.name === 'r') {
        process.exit(0);
      }
    },
    { isActive: !!isRestarting },
  );

  const options: Array<RadioSelectItem<FolderTrustChoice>> = [
    {
      label: 'Trust folder',
      value: FolderTrustChoice.TRUST_FOLDER,
    },
    {
      label: 'Trust parent folder',
      value: FolderTrustChoice.TRUST_PARENT,
    },
    {
      label: "Don't trust (esc)",
      value: FolderTrustChoice.DO_NOT_TRUST,
    },
  ];

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Colors.AccentYellow}
        padding={1}
        width="100%"
        marginLeft={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Do you trust this folder?</Text>
          <Text>
            Trusting a folder allows Gemini to execute commands it suggests.
            This is a security feature to prevent accidental execution in
            untrusted directories.
          </Text>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={onSelect}
          isFocused={!isRestarting}
        />
      </Box>
      {isRestarting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={Colors.AccentYellow}>
            To see changes, Gemini CLI must be restarted. Press r to exit and
            apply changes now.
          </Text>
        </Box>
      )}
    </Box>
  );
};
