/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface AuthInProgressProps {
  onTimeout: () => void;
}

export function AuthInProgress({
  onTimeout,
}: AuthInProgressProps): React.JSX.Element {
  const [timedOut, setTimedOut] = useState(false);

  useKeypress(
    (key) => {
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        onTimeout();
      }
    },
    { isActive: true },
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      onTimeout();
    }, 180000);

    return () => clearTimeout(timer);
  }, [onTimeout]);

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {timedOut ? (
        <Text color={Colors.AccentRed}>
          Authentication timed out. Please try again.
        </Text>
      ) : (
        <Box>
          <Text>
            <Spinner type="dots" /> Waiting for auth... (Press ESC or CTRL+C to
            cancel)
          </Text>
        </Box>
      )}
    </Box>
  );
}
