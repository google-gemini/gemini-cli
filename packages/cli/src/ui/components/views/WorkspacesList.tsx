/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { WorkspaceHubInfo } from '@google/gemini-cli-core';

interface WorkspacesListProps {
  workspaces: readonly WorkspaceHubInfo[];
}

export const WorkspacesList: React.FC<WorkspacesListProps> = ({ workspaces }) => {
  if (workspaces.length === 0) {
    return <Text>No active workspaces found.</Text>;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold underline>Active Remote Workspaces:</Text>
      <Box flexDirection="column" paddingLeft={2} marginTop={1}>
        {workspaces.map((ws) => {
          const isReady = ws.status === 'READY';
          const statusColor = isReady ? 'green' : 'yellow';

          return (
            <Box key={ws.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color="cyan" bold>{ws.name.padEnd(20)}</Text>
                <Text> | </Text>
                <Text color={statusColor}>{ws.status.padEnd(12)}</Text>
                <Text> | </Text>
                <Text dimColor>{ws.id}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor>Instance: {ws.instance_name} ({ws.zone})</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor>Project:  {ws.project_id}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor italic>Use `/wsr connect {'<name>'}` to teleport into a workspace.</Text>
      </Box>
    </Box>
  );
};
