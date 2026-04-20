/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import { SandboxMethod } from './types.js';

interface SandboxMethodSelectorProps {
  onSelect: (method: SandboxMethod) => void;
}

const getMethodOptions = (): Array<RadioSelectItem<SandboxMethod>> => {
  const platform = process.platform;
  const options: Array<RadioSelectItem<SandboxMethod>> = [
    {
      label: 'None (Policy Only)',
      sublabel: 'Use policy rules without OS-level sandboxing',
      value: SandboxMethod.NONE,
      key: 'none',
    },
    {
      label: 'Docker',
      sublabel: 'Run in an isolated Docker container',
      value: SandboxMethod.DOCKER,
      key: 'docker',
    },
  ];

  if (platform === 'darwin') {
    options.push({
      label: 'macOS Seatbelt',
      sublabel: 'Use macOS sandbox-exec for lightweight isolation',
      value: SandboxMethod.SEATBELT,
      key: 'seatbelt',
    });
  }

  if (platform === 'linux') {
    options.push({
      label: 'gVisor (runsc)',
      sublabel: 'Use Google gVisor for secure container runtime',
      value: SandboxMethod.GVISOR,
      key: 'gvisor',
    });
  }

  return options;
};

export const SandboxMethodSelector: React.FC<SandboxMethodSelectorProps> = ({
  onSelect,
}) => {
  const options = getMethodOptions();

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.text.primary}>
          Select a sandbox isolation method:
        </Text>
      </Box>
      <RadioButtonSelect
        items={options}
        onSelect={onSelect}
        isFocused={true}
        showNumbers={true}
      />
    </Box>
  );
};
