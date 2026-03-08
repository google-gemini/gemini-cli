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
  if (protocol === 'ascii') {
    return 0;
  }

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

  // Sixel does not carry a stable, parseable row count in the payload.
  return protocol === 'sixel' ? 14 : 12;
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

  const reservedGraphicRows = useMemo(() => {
    const rows = parseGraphicRows(protocol, output);
    // Keep one extra row to ensure subsequent content starts below the image.
    return Math.max(0, Math.min(120, rows + 1));
  }, [output, protocol]);

  if (protocol !== 'ascii' || !ansiOutput) {
    if (protocol === 'ascii') {
      return null;
    }
    return <Box width={terminalWidth} height={reservedGraphicRows} />;
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
