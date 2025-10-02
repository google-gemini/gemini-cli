/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type SlashCommand, CommandKind } from '../commands/types.js';

interface Help {
  commands: readonly SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={theme.border.default}
    borderStyle="round"
    padding={1}
  >
    {/* Basics */}
    <Text bold color={theme.text.primary}>
      Basics:
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Add context
      </Text>
      : Use{' '}
      <Text bold color={theme.text.accent}>
        @
      </Text>{' '}
      to specify files for context (e.g.,{' '}
      <Text bold color={theme.text.accent}>
        @src/myFile.ts
      </Text>
      ) to target specific files or folders.
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Shell mode
      </Text>
      : Execute shell commands via{' '}
      <Text bold color={theme.text.accent}>
        !
      </Text>{' '}
      (e.g.,{' '}
      <Text bold color={theme.text.accent}>
        !npm run start
      </Text>
      ) or use natural language (e.g.{' '}
      <Text bold color={theme.text.accent}>
        start server
      </Text>
      ).
    </Text>

    <Box height={1} />

    {/* Commands */}
    <Text bold color={theme.text.primary}>
      Commands:
    </Text>
    {commands
      .filter((command) => command.description && !command.hidden)
      .map((command: SlashCommand) => (
        <Box key={command.name} flexDirection="column">
          <Text color={theme.text.primary}>
            <Text bold color={theme.text.accent}>
              {' '}
              /{command.name}
            </Text>
            {command.kind === CommandKind.MCP_PROMPT && (
              <Text color={theme.text.secondary}> [MCP]</Text>
            )}
            {command.description && ' - ' + command.description}
          </Text>
          {command.subCommands &&
            command.subCommands
              .filter((subCommand) => !subCommand.hidden)
              .map((subCommand) => (
                <Text key={subCommand.name} color={theme.text.primary}>
                  <Text bold color={theme.text.accent}>
                    {'   '}
                    {subCommand.name}
                  </Text>
                  {subCommand.description && ' - ' + subCommand.description}
                </Text>
              ))}
        </Box>
      ))}
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        {' '}
        !{' '}
      </Text>
      - shell command
    </Text>
    <Text color={theme.text.primary}>
      <Text color={theme.text.secondary}>[MCP]</Text> - Model Context Protocol
      command (from external servers)
    </Text>

    <Box height={1} />

    {/* Shortcuts */}
    <Text bold color={theme.text.primary}>
      Keyboard Shortcuts:
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Alt+Left/Right
      </Text>{' '}
      - Jump through words in the input
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Ctrl+C
      </Text>{' '}
      - Quit application
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        {process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J'}
      </Text>{' '}
      {process.platform === 'linux'
        ? '- New line (Alt+Enter works for certain linux distros)'
        : '- New line'}
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Ctrl+L
      </Text>{' '}
      - Clear the screen
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        {process.platform === 'darwin' ? 'Ctrl+X / Meta+Enter' : 'Ctrl+X'}
      </Text>{' '}
      - Open input in external editor
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Ctrl+Y
      </Text>{' '}
      - Toggle YOLO mode
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Enter
      </Text>{' '}
      - Send message
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Esc
      </Text>{' '}
      - Cancel operation / Clear input (double press)
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Shift+Tab
      </Text>{' '}
      - Toggle auto-accepting edits
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Up/Down
      </Text>{' '}
      - Cycle through your prompt history
    </Text>
    <Box height={1} />
    <Text color={theme.text.primary}>
      For a full list of shortcuts, see{' '}
      <Text bold color={theme.text.accent}>
        docs/cli/keyboard-shortcuts.md
      </Text>
    </Text>
  </Box>
);
