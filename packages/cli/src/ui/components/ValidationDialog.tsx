/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';
import { CliSpinner } from './CliSpinner.js';
import {
  openBrowserSecurely,
  shouldLaunchBrowser,
  type ValidationIntent,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';

interface ValidationDialogProps {
  validationLink?: string;
  validationDescription?: string;
  learnMoreUrl?: string;
  onChoice: (choice: ValidationIntent) => void;
}

type DialogState = 'choosing' | 'waiting' | 'complete' | 'error';

export function ValidationDialog({
  validationLink,
  learnMoreUrl,
  onChoice,
}: ValidationDialogProps): React.JSX.Element {
  const [state, setState] = useState<DialogState>('choosing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const items = [
    {
      label: 'Verify your account',
      value: 'verify' as const,
      key: 'verify',
    },
    {
      label: 'Change authentication',
      value: 'change_auth' as const,
      key: 'change_auth',
    },
  ];

  // Handle keypresses globally for cancellation, and specific logic for waiting state
  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key) || keyMatchers[Command.QUIT](key)) {
        onChoice('cancel');
        return true;
      } else if (state === 'waiting' && keyMatchers[Command.RETURN](key)) {
        // User confirmed verification is complete - transition to 'complete' state
        setState('complete');
        return true;
      }
      return false;
    },
    { isActive: state !== 'complete' },
  );

  // When state becomes 'complete', show success message briefly then proceed
  useEffect(() => {
    if (state === 'complete') {
      const timer = setTimeout(() => {
        onChoice('verify');
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state, onChoice]);

  const handleSelect = useCallback(
    async (choice: ValidationIntent) => {
      if (choice === 'verify') {
        if (validationLink) {
          // Check if we're in an environment where we can launch a browser
          if (!shouldLaunchBrowser()) {
            // In headless mode, show the link and wait for user to manually verify
            setErrorMessage(
              `Please open this URL in a browser: ${validationLink}`,
            );
            setState('waiting');
            return;
          }

          try {
            await openBrowserSecurely(validationLink);
            setState('waiting');
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : 'Failed to open browser',
            );
            setState('error');
          }
        } else {
          // No validation link, just retry
          onChoice('verify');
        }
      } else {
        // 'change_auth' or 'cancel'
        onChoice(choice);
      }
    },
    [validationLink, onChoice],
  );

  if (state === 'error') {
    return (
      <Box borderStyle="round" flexDirection="column" padding={1}>
        <Text color={theme.status.error}>
          {errorMessage ||
            'Failed to open verification link. Please try again or change authentication.'}
        </Text>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={items}
            onSelect={(choice) => void handleSelect(choice as ValidationIntent)}
          />
        </Box>
      </Box>
    );
  }

  if (state === 'waiting') {
    return (
      <Box borderStyle="round" flexDirection="column" padding={1}>
        <Box>
          <CliSpinner />
          <Text>
            {' '}
            Waiting for verification... (Press ESC or CTRL+C to cancel)
          </Text>
        </Box>
        {errorMessage && (
          <Box marginTop={1}>
            <Text>{errorMessage}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Press Enter when verification is complete.</Text>
        </Box>
      </Box>
    );
  }

  if (state === 'complete') {
    return (
      <Box borderStyle="round" flexDirection="column" padding={1}>
        <Text color={theme.status.success}>Verification complete</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Further action is required to use this service.</Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect
          items={items}
          onSelect={(choice) => void handleSelect(choice as ValidationIntent)}
        />
      </Box>
      {learnMoreUrl && (
        <Box marginTop={1}>
          <Text dimColor>
            Learn more: <Text color={theme.text.accent}>{learnMoreUrl}</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
