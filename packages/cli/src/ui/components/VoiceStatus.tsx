/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { HistoryItemVoiceStatus } from '../types.js';

interface Props {
  item: HistoryItemVoiceStatus;
}

export const VoiceStatus: React.FC<Props> = ({ item }) => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={theme.border.default}
    borderStyle="round"
    padding={1}
  >
    <Text bold color={theme.text.primary}>
      Voice Input Settings:
    </Text>

    <Box height={1} />

    {[
      ['Enabled', item.enabled ? 'yes' : 'no'],
      ['Provider', item.provider],
      ['Sensitivity', item.sensitivityLabel],
      ['Whisper path', item.whisperPath],
    ].map(([label, value]) => (
      <Text key={label} color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          {' '}
          {label}
        </Text>
        {'  ' + value}
      </Text>
    ))}

    <Box height={1} />

    <Text color={theme.text.primary}>
      Shortcuts:{' '}
      <Text bold color={theme.text.accent}>
        Alt+R
      </Text>
      {' or '}
      <Text bold color={theme.text.accent}>
        Ctrl+Q
      </Text>
      {' to record · '}
      <Text bold color={theme.text.accent}>
        /voice help
      </Text>
      {' for all commands'}
    </Text>
  </Box>
);
