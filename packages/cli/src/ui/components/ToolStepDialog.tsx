/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useStepThrough } from '../hooks/useStepThrough.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useCallback } from 'react';
import type { Config } from '@google/gemini-cli-core';
import { KeypressPriority } from '../contexts/KeypressContext.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface ToolStepDialogProps {
  config: Config;
}

export function ToolStepDialog({ config }: ToolStepDialogProps) {
  const { activeRequest, onAction } = useStepThrough(config);
  const { mainAreaWidth } = useUIState();

  const handleKeypress = useCallback(
    (key: Key) => {
      if (!activeRequest) return false;
      const { name, sequence } = key;

      if (name === 'return') {
        onAction('run');
        return true;
      } else if (name === 'escape' || sequence === 'q') {
        onAction('cancel');
        return true;
      } else if (sequence === 's') {
        onAction('skip');
        return true;
      } else if (sequence === 'c') {
        onAction('continue');
        return true;
      }
      return true; // absorb all other keys while dialog is active
    },
    [activeRequest, onAction],
  );

  // Grab focus strongly when active
  useKeypress(handleKeypress, {
    isActive: !!activeRequest,
    priority: KeypressPriority.High,
  });

  if (!activeRequest) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      width={mainAreaWidth}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text color="yellow" bold>
          ⏸ Paused before {activeRequest.toolName}
        </Text>
        {activeRequest.currentStep && (
          <Text dimColor>
            Step {activeRequest.currentStep} of ~{activeRequest.totalSteps}
          </Text>
        )}
      </Box>
      <Box marginY={1}>
        <Text dimColor>{activeRequest.input}</Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        <Text color="green">[Enter] run</Text>
        <Text color="blue">[s] skip</Text>
        <Text color="magenta">[c] continue</Text>
        <Text color="red">[q/Esc] cancel</Text>
      </Box>
    </Box>
  );
}
