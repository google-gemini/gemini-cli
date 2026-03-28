/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { PerformanceData } from '@google/gemini-cli-core';

interface SessionStatsProps {
  data: PerformanceData['session'];
}

export const SessionStats: React.FC<SessionStatsProps> = ({ data }) => {
  const { current, historical, summary } = data;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>
          Session Statistics
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Current Session:</Text>
        <Box>
          <Text>ID: </Text>
          <Text color="cyan">{current.sessionId}</Text>
        </Box>
        <Box>
          <Text>Duration: </Text>
          <Text color="cyan">{current.duration}s</Text>
        </Box>
        <Box>
          <Text>Tokens: </Text>
          <Text color="green">{current.tokens.prompt}</Text>
          <Text> prompt / </Text>
          <Text color="green">{current.tokens.completion}</Text>
          <Text> completion </Text>
          <Text color="cyan">(total: {current.tokens.total})</Text>
        </Box>
        <Box>
          <Text>API Calls: </Text>
          <Text color="cyan">{current.apiCalls}</Text>
          <Text> | Errors: </Text>
          <Text color={current.errors > 0 ? 'red' : 'green'}>
            {current.errors}
          </Text>
        </Box>
        <Box>
          <Text>Files Modified: </Text>
          <Text color="cyan">{current.filesModified}</Text>
        </Box>
      </Box>

      {current.toolsCalled.length > 0 && (
        <Box marginBottom={1}>
          <Text>Tools: </Text>
          {current.toolsCalled.map((t, i) => (
            <Box key={t.name} marginRight={1}>
              <Text>{t.name}</Text>
              <Text color="cyan">({t.count})</Text>
              {i < current.toolsCalled.length - 1 && <Text>,</Text>}
            </Box>
          ))}
        </Box>
      )}

      <Box
        borderStyle="single"
        padding={1}
        marginTop={1}
        flexDirection="column"
      >
        <Text bold>Summary (all time):</Text>
        <Box>
          <Text>Sessions: </Text>
          <Text color="cyan">{summary.totalSessions}</Text>
        </Box>
        <Box>
          <Text>Total Tokens: </Text>
          <Text color="cyan">{summary.totalTokens.toLocaleString()}</Text>
        </Box>
        <Box>
          <Text>Total Tools: </Text>
          <Text color="cyan">{summary.totalToolsCalled}</Text>
        </Box>
        <Box>
          <Text>Total Files: </Text>
          <Text color="cyan">{summary.totalFilesModified}</Text>
        </Box>
        <Box>
          <Text>Avg Session: </Text>
          <Text color="cyan">{summary.avgSessionDuration.toFixed(1)}s</Text>
          <Text> / </Text>
          <Text color="cyan">
            {summary.avgTokensPerSession.toFixed(0)} tokens
          </Text>
        </Box>
      </Box>

      {historical.length > 0 && (
        <Box marginTop={1}>
          <Text bold>Recent Sessions:</Text>
          <Box flexDirection="column">
            {historical.map((session, _index) => (
              <Box key={session.sessionId}>
                <Text color="cyan">
                  {new Date(session.date).toLocaleTimeString()}
                </Text>
                <Text> </Text>
                <Text>{session.duration.toFixed(0)}s</Text>
                <Text> </Text>
                <Text color="green">{session.tokens} tokens</Text>
                <Text> </Text>
                <Text color="yellow">{session.tools} tools</Text>
                <Text> </Text>
                <Text color="magenta">{session.files} files</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
