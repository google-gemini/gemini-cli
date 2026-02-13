/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { useKeypress } from '../hooks/useKeypress.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

export type CrashResumeChoice = 'resume' | 'dismiss' | 'browse';

interface CrashResumeDialogProps {
  sessionName: string;
  projectRoot: string;
  updatedAt: string;
  onSelect: (choice: CrashResumeChoice) => void;
}

export const CrashResumeDialog: React.FC<CrashResumeDialogProps> = ({
  sessionName,
  projectRoot,
  updatedAt,
  onSelect,
}) => {
  const [submitting, setSubmitting] = useState(false);

  useKeypress(
    (key) => {
      if (key.name === 'escape' && !submitting) {
        setSubmitting(true);
        onSelect('dismiss');
        return true;
      }
      return false;
    },
    { isActive: !submitting },
  );

  const options: Array<RadioSelectItem<CrashResumeChoice>> = [
    { label: 'Yes, resume last session', value: 'resume', key: 'resume' },
    { label: 'No, start fresh', value: 'dismiss', key: 'dismiss' },
    { label: 'View session list', value: 'browse', key: 'browse' },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.warning}
        padding={1}
        marginLeft={1}
        marginRight={1}
      >
        <Text bold color={theme.text.primary}>
          Gemini CLI did not exit cleanly last time.
        </Text>
        <Text color={theme.text.secondary}>Resume your previous chat session?</Text>
        <Text color={theme.text.primary}>
          Session: <Text>{sessionName}</Text>
        </Text>
        <Text color={theme.text.primary}>
          Project: <Text>{projectRoot}</Text>
        </Text>
        <Text color={theme.text.secondary}>Last update: {updatedAt}</Text>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={options}
            onSelect={(choice) => {
              setSubmitting(true);
              onSelect(choice);
            }}
            isFocused={!submitting}
          />
        </Box>
      </Box>
    </Box>
  );
};
