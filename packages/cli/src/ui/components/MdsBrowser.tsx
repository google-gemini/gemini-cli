/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Box, Text, useStdin } from 'ink';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import {
  type Config,
  type EditorType,
  getEditorCommand,
  isGuiEditor,
  coreEvents,
  CoreEvent,
} from '@google/gemini-cli-core';

export interface MdsBrowserProps {
  config: Config;
  onClose: () => void;
}

export const MdsBrowser: React.FC<MdsBrowserProps> = ({ config, onClose }) => {
  const { merged: settings } = useSettings();
  const { rows: terminalHeight } = useTerminalSize();
  const { setRawMode } = useStdin();
  const [activeIndex, setActiveIndex] = useState(0);

  const files = useMemo(() => {
    const memoryFiles = config.getGeminiMdFilePaths() || [];
    const agentPaths = new Set<string>();

    // Attempt to collect agent definitions
    const definitions = config.getAgentRegistry()?.getAllDefinitions() || [];
    for (const definition of definitions) {
      if (definition.metadata?.filePath) {
        agentPaths.add(definition.metadata.filePath);
      }
    }

    const allPaths = new Set([...memoryFiles, ...agentPaths]);

    return Array.from(allPaths)
      .map((p) => {
        const lower = p.toLowerCase();
        let type = 'Unknown';

        if (
          agentPaths.has(p) ||
          lower.endsWith('agents.md') ||
          lower.endsWith('.agents')
        ) {
          type = 'Agent';
        } else {
          type = 'Memory';
        }
        return { path: p, type };
      })
      .sort((a, b) => {
        // Sort Agents first, then Memory
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.path.localeCompare(b.path);
      });
  }, [config]);

  const openFileInEditor = useCallback(
    async (filePath: string) => {
      let command: string | undefined = undefined;
      const args = [filePath];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const preferredEditorType = settings.general.preferredEditor as
        | EditorType
        | undefined;
      if (!command && preferredEditorType) {
        command = getEditorCommand(preferredEditorType);
        if (isGuiEditor(preferredEditorType)) {
          args.unshift('--wait');
        }
      }

      if (!command) {
        command =
          process.env['VISUAL'] ??
          process.env['EDITOR'] ??
          (process.platform === 'win32' ? 'notepad' : 'vi');
      }

      try {
        setRawMode?.(false);
        const { status, error } = spawnSync(command, args, {
          stdio: 'inherit',
        });
        if (error) throw error;
        if (typeof status === 'number' && status !== 0 && status !== null) {
          throw new Error(`External editor exited with status ${status}`);
        }
      } catch (err) {
        coreEvents.emitFeedback(
          'error',
          '[MdsBrowser] external editor error',
          err,
        );
      } finally {
        coreEvents.emit(CoreEvent.ExternalEditorClosed);
      }
    },
    [settings.general.preferredEditor, setRawMode],
  );

  const openFolder = useCallback((filePath: string) => {
    const folderPath = dirname(filePath);
    let command = '';
    const args = [folderPath];

    if (process.platform === 'win32') {
      command = 'explorer';
    } else if (process.platform === 'darwin') {
      command = 'open';
    } else {
      command = 'xdg-open';
    }

    try {
      spawnSync(command, args, { stdio: 'ignore' });
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        '[MdsBrowser] error opening folder',
        error,
      );
    }
  }, []);

  useKeypress(
    (key) => {
      if (
        key.name === 'escape' ||
        key.name === 'return' ||
        key.name === 'enter'
      ) {
        onClose();
        return true;
      }
      if (
        keyMatchers[Command.MOVE_DOWN](key) ||
        keyMatchers[Command.HISTORY_DOWN](key)
      ) {
        setActiveIndex((prev) =>
          Math.min(prev + 1, Math.max(0, files.length - 1)),
        );
        return true;
      }
      if (
        keyMatchers[Command.MOVE_UP](key) ||
        keyMatchers[Command.HISTORY_UP](key)
      ) {
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return true;
      }
      if (keyMatchers[Command.OPEN_EXTERNAL_EDITOR](key)) {
        const activeFile = files[activeIndex];
        if (activeFile) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          openFileInEditor(activeFile.path);
        }
        return true;
      }
      if (keyMatchers[Command.OPEN_FILE_LOCATION](key)) {
        const activeFile = files[activeIndex];
        if (activeFile) {
          openFolder(activeFile.path);
        }
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  const availableHeight = Math.max(5, terminalHeight - 10);
  const startIdx = Math.max(
    0,
    Math.min(
      activeIndex - Math.floor(availableHeight / 2),
      files.length - availableHeight,
    ),
  );
  const endIdx = startIdx + availableHeight;
  const visibleFiles = files.slice(startIdx, endIdx);

  if (files.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} marginY={1}>
        <Text color={Colors.AccentPurple}>Markdown Files</Text>
        <Text color={Colors.Gray}>
          No .GEMINI or .AGENTS files found in use.
        </Text>
        <Text color={Colors.Gray}>Press Esc to close</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={Colors.AccentPurple}>
          Markdown Files ({files.length} total)
        </Text>
      </Box>
      <Box flexDirection="column" marginY={1}>
        {visibleFiles.map((file, idx) => {
          const absoluteIndex = startIdx + idx;
          const isActive = absoluteIndex === activeIndex;
          const prefix = isActive ? '❯ ' : '  ';
          const color = isActive ? Colors.AccentPurple : Colors.Foreground;

          return (
            <Box key={`${file.path}-${idx}`} flexDirection="row">
              <Box width={10} flexShrink={0} alignItems="flex-end">
                <Text color={color}>
                  {prefix}
                  {file.type}
                </Text>
              </Box>
              <Box marginX={1}>
                <Text color={Colors.Gray}>│</Text>
              </Box>
              <Box flexGrow={1} overflow="hidden">
                <Text
                  color={isActive ? color : Colors.Comment}
                  dimColor={!isActive}
                  wrap="truncate-middle"
                >
                  {file.path}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="column">
        <Text color={Colors.Gray}>
          ↑/↓: Navigate │ Enter/Esc: Close │ Ctrl+x: Open File │ Alt+o: Open
          Folder
        </Text>
      </Box>
    </Box>
  );
};
