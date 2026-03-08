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

function parseGraphicRows(
  protocol: 'kitty' | 'iterm2' | 'sixel' | 'ascii',
  output: string,
): number {
  if (protocol === 'iterm2') {
    const match = output.match(/height=(\d+)(?:;|:)/);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  if (protocol === 'kitty') {
    const match = output.match(/(?:^|[,;])r=(\d+)(?:[,;])/);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  if (protocol === 'sixel') {
    return 12;
  }

  return 0;
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
    const graphicRows = Math.max(0, parseGraphicRows(protocol, output));
    const leadingLines = protocol === 'iterm2' ? 2 : 1;
    const reservedRows =
      protocol === 'iterm2'
        ? 1
        : Math.max(1, Math.min(36, graphicRows));
    const spacer = '\n'.repeat(reservedRows);
    // Emit the graphic and advance enough lines so the prompt/input is not
    // painted on top of the image in iTerm/Kitty.
    stdout.write(`${'\n'.repeat(leadingLines)}${output}${spacer}`);
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
