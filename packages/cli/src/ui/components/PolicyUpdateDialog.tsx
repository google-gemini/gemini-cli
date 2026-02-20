/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useCallback, useRef } from 'react';
import type React from 'react';
import {
  type Config,
  type PolicyUpdateConfirmationRequest,
  PolicyIntegrityManager,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';

export enum PolicyUpdateChoice {
  ACCEPT = 'accept',
  IGNORE = 'ignore',
}

interface PolicyUpdateDialogProps {
  config: Config;
  request: PolicyUpdateConfirmationRequest;
  onClose: () => void;
}

export const PolicyUpdateDialog: React.FC<PolicyUpdateDialogProps> = ({
  config,
  request,
  onClose,
}) => {
  const isProcessing = useRef(false);

  const handleSelect = useCallback(
    async (choice: PolicyUpdateChoice) => {
      if (isProcessing.current) {
        return;
      }

      isProcessing.current = true;
      try {
        if (choice === PolicyUpdateChoice.ACCEPT) {
          const integrityManager = new PolicyIntegrityManager();
          await integrityManager.acceptIntegrity(
            request.scope,
            request.identifier,
            request.newHash,
          );
          await config.loadWorkspacePolicies(request.policyDir);
        }
        onClose();
      } finally {
        isProcessing.current = false;
      }
    },
    [config, request, onClose],
  );

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<PolicyUpdateChoice>> = [
    {
      label: 'Accept and Load',
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
            New or changed {request.scope} policies detected
          </Text>
          <Text color={theme.text.primary}>Location: {request.identifier}</Text>
          <Text color={theme.text.primary}>
            Do you want to accept and load these policies?
          </Text>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={handleSelect}
          isFocused={true}
        />
      </Box>
    </Box>
  );
};
