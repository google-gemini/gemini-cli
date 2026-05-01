/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type {
  MultiAgentSnapshot,
  MultiAgentState,
} from '../../multiAgent/MultiAgentController.js';

interface MultiAgentStatusProps {
  snapshot: MultiAgentSnapshot;
}

const STATE_LABELS: Record<MultiAgentState, string> = {
  idle: 'Idle',
  planning: 'Planning',
  researching: 'Researching',
  coding: 'Coding',
  testing: 'Testing',
  reviewing: 'Reviewing',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
};

/**
 * Inline status view for interactive multi-agent orchestration.
 *
 * This component is intentionally presentation-only. It does not execute tools,
 * mutate files, or alter policy decisions. It is safe to render from the TUI
 * once a MultiAgentController is wired into AppContainer or a future provider.
 */
export function MultiAgentStatus({ snapshot }: MultiAgentStatusProps) {
  if (snapshot.state === 'idle' && snapshot.completedRoles.length === 0) {
    return null;
  }

  const activeRole = snapshot.currentRole ?? 'none';
  const completed = snapshot.completedRoles.length;
  const total = snapshot.roles.length;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginY={1}>
      <Text bold>Multi-agent</Text>
      <Text>
        State: {STATE_LABELS[snapshot.state]} | Active: {activeRole} | Progress:{' '}
        {completed}/{total}
      </Text>
      {snapshot.roles.length > 0 && (
        <Text dimColor>
          Roles:{' '}
          {snapshot.roles
            .map((role) => {
              if (snapshot.completedRoles.includes(role)) return `✓ ${role}`;
              if (snapshot.skippedRoles.includes(role)) return `- ${role}`;
              if (snapshot.currentRole === role) return `› ${role}`;
              return `· ${role}`;
            })
            .join('  ')}
        </Text>
      )}
      {snapshot.blockedReason && (
        <Text color="yellow">Blocked: {snapshot.blockedReason}</Text>
      )}
      {snapshot.isCancellationRequested && (
        <Text color="yellow">Cancellation requested</Text>
      )}
    </Box>
  );
}
