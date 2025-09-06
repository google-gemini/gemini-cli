/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';
import type { SlashCommand } from '../commands/types.js';

interface Help {
  commands: readonly SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={semanticTheme.border.default}
    borderStyle="round"
    padding={1}
  >
    {/* Basics */}
    <Text bold color={semanticTheme.text.primary}>
      Basics:
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Add context
      </Text>
      : Use{' '}
      <Text bold color={semanticTheme.text.accent}>
        @
      </Text>{' '}
      to specify files for context (e.g.,{' '}
      <Text bold color={semanticTheme.text.accent}>
        @src/myFile.ts
      </Text>
      ) to target specific files or folders.
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Shell mode
      </Text>
      : Execute shell commands via{' '}
      <Text bold color={semanticTheme.text.accent}>
        !
      </Text>{' '}
      (e.g.,{' '}
      <Text bold color={semanticTheme.text.accent}>
        !npm run start
      </Text>
      ) or use natural language (e.g.{' '}
      <Text bold color={semanticTheme.text.accent}>
        start server
      </Text>
      ).
    </Text>

    <Box height={1} />

    {/* Commands */}
    <Text bold color={semanticTheme.text.primary}>
      Commands:
    </Text>
    {commands
      .filter((command) => command.description)
      .map((command: SlashCommand) => (
        <Box key={command.name} flexDirection="column">
          <Text color={semanticTheme.text.primary}>
            <Text bold color={semanticTheme.text.accent}>
              {' '}
              /{command.name}
            </Text>
            {command.description && ' - ' + command.description}
          </Text>
          {command.subCommands &&
            command.subCommands.map((subCommand) => (
              <Text key={subCommand.name} color={semanticTheme.text.primary}>
                <Text bold color={semanticTheme.text.accent}>
                  {'   '}
                  {subCommand.name}
                </Text>
                {subCommand.description && ' - ' + subCommand.description}
              </Text>
            ))}
        </Box>
      ))}
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        {' '}
        !{' '}
      </Text>
      - shell command
    </Text>

    <Box height={1} />

    {/* Shortcuts */}
    <Text bold color={semanticTheme.text.primary}>
      Keyboard Shortcuts:
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Alt+Left/Right
      </Text>{' '}
      - Jump through words in the input
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Ctrl+C
      </Text>{' '}
      - Quit application
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        {process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J'}
      </Text>{' '}
      {process.platform === 'linux'
        ? '- New line (Alt+Enter works for certain linux distros)'
        : '- New line'}
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Ctrl+L
      </Text>{' '}
      - Clear the screen
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        {process.platform === 'darwin' ? 'Ctrl+X / Meta+Enter' : 'Ctrl+X'}
      </Text>{' '}
      - Open input in external editor
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Ctrl+Y
      </Text>{' '}
      - Toggle YOLO mode
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Enter
      </Text>{' '}
      - Send message
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Esc
      </Text>{' '}
      - Cancel operation / Clear input (double press)
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Shift+Tab
      </Text>{' '}
      - Toggle auto-accepting edits
    </Text>
    <Text color={semanticTheme.text.primary}>
      <Text bold color={semanticTheme.text.accent}>
        Up/Down
      </Text>{' '}
      - Cycle through your prompt history
    </Text>
    <Box height={1} />
    <Text color={semanticTheme.text.primary}>
      For a full list of shortcuts, see{' '}
      <Text bold color={semanticTheme.text.accent}>
        docs/keyboard-shortcuts.md
      </Text>
    </Text>
  </Box>
);
