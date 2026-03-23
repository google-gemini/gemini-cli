/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { type ReactNode, useCallback, useState } from 'react';
import * as process from 'node:process';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface ResumeContextSwitchDialogProps {
  prompt: ReactNode;
  terminalWidth: number;
  onConfirm: () => void;
  onDecline: () => void;
  exitOnDecline?: boolean;
  declineExitMessage?: ReactNode;
  exitCode?: number;
}

export const ResumeContextSwitchDialog = ({
  prompt,
  terminalWidth,
  onConfirm,
  onDecline,
  exitOnDecline = false,
  declineExitMessage = 'Session resume was canceled. Exiting so you can switch to the original folder and rerun the resume command.',
  exitCode = 0,
}: ResumeContextSwitchDialogProps) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleSelect = useCallback(
    (confirmed: boolean) => {
      if (confirmed) {
        onConfirm();
        return;
      }

      onDecline();
      if (!exitOnDecline) {
        return;
      }

      setIsExiting(true);
      setTimeout(async () => {
        await runExitCleanup();
        process.exit(exitCode);
      }, 100);
    },
    [exitCode, exitOnDecline, onConfirm, onDecline],
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleSelect(false);
        return true;
      }
      return false;
    },
    { isActive: !isExiting },
  );

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={theme.status.warning}
        flexDirection="column"
        paddingTop={1}
        paddingX={2}
      >
        {typeof prompt === 'string' ? (
          <MarkdownDisplay
            isPending={true}
            text={prompt}
            terminalWidth={terminalWidth}
          />
        ) : (
          prompt
        )}
        {!isExiting && (
          <Box marginTop={1}>
            <RadioButtonSelect
              items={[
                { label: 'Yes', value: true, key: 'Yes' },
                { label: 'No', value: false, key: 'No' },
              ]}
              onSelect={handleSelect}
            />
          </Box>
        )}
      </Box>
      {isExiting && (
        <Box marginTop={1}>
          {typeof declineExitMessage === 'string' ? (
            <Text color={theme.status.warning}>{declineExitMessage}</Text>
          ) : (
            declineExitMessage
          )}
        </Box>
      )}
    </Box>
  );
};
