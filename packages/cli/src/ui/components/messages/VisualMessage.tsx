/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Box, useStdout } from 'ink';
import type { AnsiOutput } from '@google/gemini-cli-core';
import { AnsiOutputText } from '../AnsiOutput.js';

interface VisualMessageProps {
  protocol: 'kitty' | 'iterm2' | 'sixel' | 'ascii';
  output: string;
  terminalWidth: number;
}

function toPlainAnsiOutput(text: string): AnsiOutput {
  return text.split('\n').map((line) => [
    {
      text: line,
      bold: false,
      italic: false,
      underline: false,
      dim: false,
      inverse: false,
      fg: '',
      bg: '',
    },
  ]);
}

export const VisualMessage: React.FC<VisualMessageProps> = ({
  protocol,
  output,
  terminalWidth,
}) => {
  const { stdout } = useStdout();
  const hasWrittenGraphicRef = useRef(false);

  useLayoutEffect(() => {
    if (protocol === 'ascii' || hasWrittenGraphicRef.current) {
      return;
    }

    hasWrittenGraphicRef.current = true;
    stdout.write(`\n${output}\n`);
  }, [output, protocol, stdout]);

  const ansiOutput = useMemo(() => {
    if (protocol !== 'ascii') {
      return null;
    }
    return toPlainAnsiOutput(output.replace(/\n+$/g, ''));
  }, [output, protocol]);

  if (protocol !== 'ascii' || !ansiOutput) {
    return null;
  }

  return (
    <Box paddingLeft={2}>
      <AnsiOutputText
        data={ansiOutput}
        width={Math.max(terminalWidth - 2, 0)}
        disableTruncation={true}
      />
    </Box>
  );
};
