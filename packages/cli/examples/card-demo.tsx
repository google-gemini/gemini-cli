/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, Box, Text } from 'ink';
import { Card } from '../src/ui/components/shared/Card.js';
import { ToolCallStatus, StreamingState } from '../src/ui/types.js';
import { StreamingContext } from '../src/ui/contexts/StreamingContext.js';

const CardDemo = () => {
  return (
    <StreamingContext.Provider value={StreamingState.Idle}>
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>Card Component Demo</Text>

        <Box flexDirection="column" gap={1}>
          <Card
            title="FindFiles"
            suffix="**/*.ts"
            status={ToolCallStatus.Success}
          >
            <Text>Found 37 files</Text>
          </Card>
          <Card
            title="SearchText"
            suffix="nano-banana"
            status={ToolCallStatus.Canceled}
          >
            <Text>No matches found</Text>
          </Card>
          <Card
            title="ReadFile"
            suffix='{"file_path":"this_file_does_not_exist.txt"}'
            status={ToolCallStatus.Error}
          >
            <Text>
              {
                'File not found:\n/users/root/src/gemini/this_file_does_not_exist.txt'
              }
            </Text>
          </Card>
          <Card
            title="Shell"
            suffix="npm test -w @google/gemini-cli"
            status={ToolCallStatus.Confirming}
          >
            <Text>Apply this change?</Text>
          </Card>
          <Card
            title="Executing"
            suffix="Lorem ipsum dolor sit amet"
            status={ToolCallStatus.Executing}
          >
            <Text>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
              enim ad minim veniam, quis nostrud exercitation ullamco laboris
              nisi ut aliquip ex ea commodo consequat.
            </Text>
          </Card>
          <Card
            title="Executing"
            suffix="Lorem ipsum dolor sit amet"
            status={ToolCallStatus.Executing}
            width={60}
          >
            <Text>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
              enim ad minim veniam, quis nostrud exercitation ullamco laboris
              nisi ut aliquip ex ea commodo consequat.
            </Text>
          </Card>
        </Box>

        <Box marginTop={1}>
          <Text color="dim">Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};

render(<CardDemo />);
