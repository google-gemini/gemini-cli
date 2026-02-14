/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

export enum PolicyUpdateChoice {
  ACCEPT = 'accept',
  IGNORE = 'ignore',
}

interface PolicyUpdateDialogProps {
  onSelect: (choice: PolicyUpdateChoice) => void;
  scope: string;
  identifier: string;
  isRestarting?: boolean;
}

export const PolicyUpdateDialog: React.FC<PolicyUpdateDialogProps> = ({
  onSelect,
  scope,
  identifier,
  isRestarting,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(PolicyUpdateChoice.IGNORE);
        return true;
      }
      return false;
    },
    { isActive: !isRestarting },
  );

  const options: Array<RadioSelectItem<PolicyUpdateChoice>> = [
    {
      label: 'Accept and Load (Requires Restart)',
      value: PolicyUpdateChoice.ACCEPT,
      key: 'accept',
    },
    {
      label: 'Ignore (Use Default Policies)',
      value: PolicyUpdateChoice.IGNORE,
      key: 'ignore',
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
            New or changed {scope} policies detected
          </Text>
          <Text color={theme.text.primary}>Location: {identifier}</Text>
          <Text color={theme.text.primary}>
            Do you want to accept and load these policies?
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
          <Text color={theme.status.warning}>
            Gemini CLI is restarting to apply the policy changes...
          </Text>
        </Box>
      )}
    </Box>
  );
};
