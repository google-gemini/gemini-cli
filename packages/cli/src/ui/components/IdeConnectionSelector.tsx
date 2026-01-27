/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { type ConnectionConfig, type IdeInfo } from '@google/gemini-cli-core';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';

interface IdeConnectionSelectorProps {
  connections: Array<
    ConnectionConfig & { workspacePath?: string; ideInfo?: IdeInfo }
  >;
  onSelect: (
    connection: ConnectionConfig & {
      workspacePath?: string;
      ideInfo?: IdeInfo;
    },
  ) => void;
  onCancel: () => void;
}

export const IdeConnectionSelector = ({
  connections,
  onSelect,
  onCancel,
}: IdeConnectionSelectorProps) => {
  const items: Array<RadioSelectItem<number>> = connections.map(
    (conn, index) => {
      const label = `${conn.ideInfo?.displayName || 'Unknown IDE'} (${conn.workspacePath || 'No workspace'})`;
      return {
        label,
        value: index,
        key: index.toString(),
      };
    },
  );

  // Add an option to skip/cancel
  items.push({
    label: 'Do not connect to an IDE',
    value: -1,
    key: 'cancel',
  });

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor="cyan"
    >
      <Text bold color="cyan">
        Multiple IDE connections found. Please select one:
      </Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          onSelect={(value: number) => {
            if (value === -1) {
              onCancel();
            } else {
              onSelect(connections[value]);
            }
          }}
        />
      </Box>
    </Box>
  );
};
