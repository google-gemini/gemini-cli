/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../commands/types.js';

export function formatHelpContent(commands: readonly SlashCommand[]): string {
  const lines: string[] = [];

  // Basics
  lines.push('**Basics:**');
  lines.push(
    '**Add context**: Use **@** to specify files for context (e.g., **@src/myFile.ts**) to target specific files or folders.',
  );
  lines.push(
    '**Shell mode**: Execute shell commands via **!** (e.g., **!npm run start**) or use natural language (e.g. **start server**).',
  );
  lines.push('');

  // Commands
  lines.push('**Commands:**');
  commands.forEach((command: SlashCommand) => {
    const visibleSubCommands =
      command.subCommands?.filter((sc) => sc.description) ?? [];

    // Don't show command if it and its subcommands are undocumented.
    if (!command.description && visibleSubCommands.length === 0) {
      return;
    }

    lines.push(
      ` **/${command.name}**${command.description ? ` - ${command.description}` : ''}`,
    );

    visibleSubCommands.forEach((subCommand) => {
      lines.push(`   **${subCommand.name}** - ${subCommand.description}`);
    });
  });
  lines.push(' **!** - shell command');
  lines.push('');

  // Shortcuts
  lines.push('**Keyboard Shortcuts:**');
  lines.push('**Alt+Left/Right** - Jump through words in the input');
  lines.push('**Ctrl+C** - Quit application');

  if (process.platform === 'win32') {
    lines.push('**Ctrl+Enter** - New line');
  } else if (process.platform === 'linux') {
    lines.push(
      '**Ctrl+J** - New line (Alt+Enter works for certain linux distros)',
    );
  } else {
    lines.push('**Ctrl+J** - New line');
  }

  lines.push('**Ctrl+L** - Clear the screen');

  if (process.platform === 'darwin') {
    lines.push('**Ctrl+X / Meta+Enter** - Open input in external editor');
  } else {
    lines.push('**Ctrl+X** - Open input in external editor');
  }

  lines.push('**Ctrl+Y** - Toggle YOLO mode');
  lines.push('**Enter** - Send message');
  lines.push('**Esc** - Cancel operation');
  lines.push('**Shift+Tab** - Toggle auto-accepting edits');
  lines.push('**Up/Down** - Cycle through your prompt history');
  lines.push('');
  lines.push(
    'For a full list of shortcuts, see **docs/keyboard-shortcuts.md**',
  );

  return lines.join('\n');
}
