/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type { SamplingMessage } from '@modelcontextprotocol/sdk/types.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

export function McpSamplingDialog({
  serverName,
  prompt,
  onConfirm,
  onReject,
}: {
  serverName: string;
  prompt: SamplingMessage[];
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box>
        <Text>
          MCP server <Text bold>{serverName}</Text> wants to run a prompt:
        </Text>
      </Box>
      <Box marginTop={1} borderStyle="round" padding={1}>
        <Text>{JSON.stringify(prompt, null, 2)}</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={[
            { label: 'Approve', value: true, key: 'Approve' },
            { label: 'Reject', value: false, key: 'Reject' },
          ]}
          onSelect={(value) => {
            if (value) {
              onConfirm();
            } else {
              onReject();
            }
          }}
        />
      </Box>
    </Box>
  );
}
