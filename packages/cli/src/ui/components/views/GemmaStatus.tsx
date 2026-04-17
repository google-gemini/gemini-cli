/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import type { HistoryItemGemmaStatus } from '../../types.js';

type GemmaStatusProps = Omit<HistoryItemGemmaStatus, 'id' | 'type'>;

const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
  <Text color={ok ? theme.status.success : theme.status.error}>
    {ok ? '\u25CF' : '\u25CB'}
  </Text>
);

export const GemmaStatus: React.FC<GemmaStatusProps> = ({
  binaryInstalled,
  binaryPath,
  modelName,
  modelDownloaded,
  serverRunning,
  serverPid,
  serverPort,
  settingsEnabled,
  allPassing,
}) => (
  <Box flexDirection="column">
    <Text bold>Gemma Local Model Routing</Text>
    <Box height={1} />

    <Box>
      <StatusDot ok={binaryInstalled} />
      <Text>
        {' '}
        <Text bold>Binary: </Text>
        {binaryInstalled ? (
          <Text color={theme.text.secondary}>{binaryPath}</Text>
        ) : (
          <Text color={theme.status.error}>Not installed</Text>
        )}
      </Text>
    </Box>

    <Box>
      <StatusDot ok={modelDownloaded} />
      <Text>
        {' '}
        <Text bold>Model: </Text>
        {modelDownloaded ? (
          <Text>{modelName}</Text>
        ) : (
          <Text color={theme.status.error}>{modelName} not found</Text>
        )}
      </Text>
    </Box>

    <Box>
      <StatusDot ok={serverRunning} />
      <Text>
        {' '}
        <Text bold>Server: </Text>
        {serverRunning ? (
          <Text>
            port {serverPort}
            {serverPid ? (
              <Text color={theme.text.secondary}> (PID {serverPid})</Text>
            ) : null}
          </Text>
        ) : (
          <Text color={theme.status.error}>
            not running on port {serverPort}
          </Text>
        )}
      </Text>
    </Box>

    <Box>
      <StatusDot ok={settingsEnabled} />
      <Text>
        {' '}
        <Text bold>Settings: </Text>
        {settingsEnabled ? (
          <Text>enabled</Text>
        ) : (
          <Text color={theme.status.error}>not enabled</Text>
        )}
      </Text>
    </Box>

    <Box marginTop={1}>
      <Text bold>Active for: </Text>
      {allPassing ? (
        <Text color={theme.status.success}>[routing]</Text>
      ) : (
        <Text color={theme.text.secondary}>none</Text>
      )}
    </Box>

    <Box marginTop={1}>
      {allPassing ? (
        <Box flexDirection="column">
          <Text color={theme.text.secondary}>
            Simple requests route to Flash, complex requests to Pro.
          </Text>
          <Text color={theme.text.secondary}>
            This happens automatically on every request.
          </Text>
        </Box>
      ) : (
        <Text color={theme.status.warning}>
          Run &quot;gemini gemma setup&quot; to install and configure.
        </Text>
      )}
    </Box>
  </Box>
);
