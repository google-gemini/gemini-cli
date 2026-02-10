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
          <Text color="dim">Default (100% width, Pending status):</Text>
          <Card title="Full Width Card" status={ToolCallStatus.Pending}>
            <Text>
              This is a standard card that takes up the full width of the
              terminal container by default.
            </Text>
          </Card>

          <Text color="dim">Fixed Width (40 characters, Success status):</Text>
          <Card
            title="Fixed Width"
            status={ToolCallStatus.Success}
            width={40}
            suffix="v1.0.0"
          >
            <Text>This card has a fixed width of 40 characters.</Text>
          </Card>

          <Text color="dim">Error Status with Prefix:</Text>
          <Card
            title="Database Error"
            status={ToolCallStatus.Error}
            width={80}
            showStatusIndicator={true}
            suffix="Connection Timeout"
          >
            <Text>
              Failed to connect to the production database after 3 attempts.
            </Text>
          </Card>

          <Text color="dim">Canceled Status without Prefix:</Text>
          <Card
            title="Operation Aborted"
            status={ToolCallStatus.Canceled}
            width={80}
            showStatusIndicator={false}
          >
            <Text>The user canceled the long-running task.</Text>
          </Card>

          <Text color="dim">Executing Status:</Text>
          <Card
            title="Applying Changes"
            status={ToolCallStatus.Executing}
            width={70}
          >
            <Text>
              Refactoring the codebase to use the new Card component...
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
