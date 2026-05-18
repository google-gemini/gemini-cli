/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';

interface AgentDialogProps {
  onClose: () => void;
  onSelect: (agentName: string) => void;
}

export function AgentDialog({ onClose, onSelect }: AgentDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const [persistMode, setPersistMode] = useState(false);

  const preferredAgent = config?.getAgent() || 'gemini-cli';

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return true;
      }
      if (key.name === 'tab') {
        setPersistMode((prev) => !prev);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const options = useMemo(() => {
    return [
      {
        value: 'gemini-cli',
        title: 'Gemini CLI (Standard)',
        description: 'Standard model conversational chat with local tools execution.',
        key: 'gemini-cli',
      },
      {
        value: 'gemini-enterprise',
        title: 'Gemini Enterprise',
        description: 'Connected assistant grounded by your business data.',
        key: 'gemini-enterprise',
      },
    ];
  }, []);

  const initialIndex = useMemo(() => {
    const idx = options.findIndex((option) => option.value === preferredAgent);
    return idx !== -1 ? idx : 0;
  }, [preferredAgent, options]);

  const handleSelect = useCallback(
    (agentName: string) => {
      if (config) {
        config.setAgent(agentName, persistMode ? false : true);
      }
      onSelect(agentName);
      onClose();
    },
    [config, onSelect, onClose, persistMode],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Agent</Text>

      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold color={theme.text.primary}>
            Remember agent for future sessions:{' '}
          </Text>
          <Text color={theme.status.success}>
            {persistMode ? 'true' : 'false'}
          </Text>
          <Text color={theme.text.secondary}> (Press Tab to toggle)</Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text color={theme.text.secondary}>
          {'> To use a specific agent on startup, use the --agent flag.'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
