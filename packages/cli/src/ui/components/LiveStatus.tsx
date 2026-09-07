/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

export interface LiveStatusProps {
  statusText?: string;
  startTime?: number;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function LiveStatus({ statusText, startTime }: LiveStatusProps): React.JSX.Element {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState<string>(
    startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.0'
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
      if (startTime) {
        setElapsed(((Date.now() - startTime) / 1000).toFixed(1));
      }
    }, 80);

    return () => clearInterval(timer);
  }, [startTime]);

  const label = statusText?.trim() || 'Thinking...';

  return (
    <Box marginY={0}>
      <Text>
        <Text color="cyan">{SPINNER_FRAMES[frame]} </Text>
        <Text color="gray">{label}</Text>
        <Text color="gray" dimColor> ({elapsed}s)</Text>
      </Text>
    </Box>
  );
}

export function StreamingCursor(): React.JSX.Element {
  return <Text color="cyan">▋</Text>;
}
