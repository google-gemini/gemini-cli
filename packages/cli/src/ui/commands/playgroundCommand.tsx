/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, Box, Text, useApp } from 'ink';
import { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

import { SettingsContext } from '../contexts/SettingsContext.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import { loadSettings } from '../../config/settings.js';
import { loadCliConfig } from '../../config/config.js';

import { ConsolePatcher } from '../utils/ConsolePatcher.js';
import { 
  createWorkingStdio
} from '@google/gemini-cli-core';

const EVAL_CASES = [
  "Missing dependency lodash",
  "Fix failing unit tests in Router",
  "Refactor utils.ts to remove circular dependency"
];

function selectedIndexReducer(state: number, action: 'UP' | 'DOWN'): number {
  if (action === 'UP') return Math.max(0, state - 1);
  if (action === 'DOWN') return Math.min(EVAL_CASES.length - 1, state + 1);
  return state;
}

export const PlaygroundApp = () => {
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const [promptContent, setPromptContent] = useState<string>('Loading prompt...');
  const [executionStream, setExecutionStream] = useState<string[]>([]);
  const [selectedIndex, dispatchIndex] = useReducer(selectedIndexReducer, 0);
  const [activeCase, setActiveCase] = useState<string | null>(null);

  const selectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const handleKeypress = useCallback((key: any) => {
    if (key.name === 'escape' || (key.name === 'c' && key.ctrl)) {
      exit();
      return true;
    }
    if (key.name === 'up') {
      dispatchIndex('UP');
      return true;
    }
    if (key.name === 'down') {
      dispatchIndex('DOWN');
      return true;
    }
    if (key.name === 'enter') {
      const active = EVAL_CASES[selectedIndexRef.current];
      setActiveCase(active);
      setExecutionStream([`> Initializing Eval Case: '${active}'`]);
      return true;
    }
    return false;
  }, [exit]);

  useKeypress(handleKeypress, { isActive: true });

  useEffect(() => {
    const fileToWatch = path.resolve(process.cwd(), 'packages/core/src/prompts/snippets.ts');
    try {
      if (fs.existsSync(fileToWatch)) {
        setPromptContent(fs.readFileSync(fileToWatch, 'utf8'));
      } else {
        setPromptContent(`File not found: ${fileToWatch}`);
      }
    } catch (e) {
      setPromptContent(`Error reading file: ${e}`);
    }

    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(fileToWatch, (eventType) => {
        if (eventType === 'change') {
          setPromptContent(fs.readFileSync(fileToWatch, 'utf8'));
        }
      });
    } catch (e) {}

    return () => {
      if (watcher) watcher.close();
    };
  }, []);

  useEffect(() => {
    if (!activeCase) return;

    const script = [
      `> Analyzing the eval case: '${activeCase}'`,
      "> Reading packages/cli/package.json...",
      "...",
      "> Tool Call: run_command {'CommandLine': 'npm install'}",
      "> Wait! Hot-Reload detected a new system prompt.",
      "> Agent behavior updated: Context Efficiency maximized.",
      "> Tool Call executing automatically...",
      "> Success! Eval case passed."
    ];
    
    let currentLine = 1;
    const interval = setInterval(() => {
      if (currentLine >= script.length) {
        clearInterval(interval);
        return;
      }
      
      const line = script[currentLine];
      setExecutionStream((prev) => [...prev, line]);
      currentLine++;
    }, 800);
    
    return () => clearInterval(interval);
  }, [activeCase]);

  // Dynamically calculate visible vertical space with a 1-row safety margin
  // to prevent bottom-edge overprinting and PowerShell reflow distortion.
  const maxLines = Math.max(3, rows - 13);
  const promptLines = promptContent.split('\n');
  const truncatedPrompt = promptLines.slice(0, maxLines).join('\n') + (promptLines.length > maxLines ? '\n...(Truncated for display)' : '');

  return (
    <Box flexDirection="column" width="100%" height={rows - 1} borderStyle="single" padding={0}>
      <Box paddingX={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true}>
        <Text bold color="cyan">Gemini CLI - Local Prompt Playground</Text>
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Box width="50%" paddingX={1} paddingY={0} flexDirection="column" borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderRight={true}>
          <Text bold color="green">System Prompt Definition</Text>
          <Box marginTop={0}>
            <Text dimColor>{truncatedPrompt}</Text>
          </Box>
        </Box>
        <Box width="50%" paddingX={1} paddingY={0} flexDirection="column">
          <Text bold color="yellow">Live Execution Stream</Text>
          <Box marginTop={0} flexDirection="column">
            {executionStream.length === 0 ? (
              <Text dimColor>Please select an eval case to begin...</Text>
            ) : (
              executionStream.slice(-maxLines).map((line, i) => (
                <Text key={i} dimColor>{line}</Text>
              ))
            )}
          </Box>
        </Box>
      </Box>
      <Box paddingX={1} flexDirection="column" borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false}>
        <Text bold color="magenta">Eval Cases (Up/Down Arrows, Enter to Run, ESC to Quit):</Text>
        <Box flexDirection="column" marginTop={0}>
          {EVAL_CASES.map((evalCase, index) => (
            <Text key={evalCase} color={index === selectedIndex ? 'cyan' : undefined}>
              {index === selectedIndex ? '> ' : '  '}
              {evalCase}
              {activeCase === evalCase ? ' (Running)' : ''}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};



export async function startPlayground() {
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);
  const config = await loadCliConfig(
    settings.merged,
    'playground-session',
    {} as any,
    { cwd: workspaceDir }
  );

  const consolePatcher = new ConsolePatcher({
    onNewMessage: (msg: any) => {
      // Background logs are ignored in playground or could be routed to stream
    },
    debugMode: config.getDebugMode(),
  });
  consolePatcher.patch();

  const { stdout: inkStdout, stderr: inkStderr } = createWorkingStdio();

  // Enter alternate screen and clear. We use raw stdout flushes to ensure
  // consistent TTY behavior on Windows Terminal.
  process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H'); 

  // Stabilization window to prevent flicker during buffer swap.
  await new Promise(resolve => setTimeout(resolve, 200));

  let inkInstance: any;

  try {
    inkInstance = render(
      <SettingsContext.Provider value={settings}>
        <KeypressProvider config={config}>
          <PlaygroundApp />
        </KeypressProvider>
      </SettingsContext.Provider>,
      {
        stdout: inkStdout,
        stderr: inkStderr,
        stdin: process.stdin,
        exitOnCtrlC: false,
        alternateBuffer: false, // We've already swapped buffers above
      }
    );

    await inkInstance.waitUntilExit();
    inkInstance.unmount();
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (e) {
    // Ignore unmount errors if already closed
  } finally {
    consolePatcher.cleanup();

    // Restore TTY state: drain stdin, exit alternate screen, and reset cursor.
    if (process.stdin.isTTY) {
      process.stdin.resume().removeAllListeners('data').on('data', () => {});
      process.stdin.setRawMode(false);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    process.stdout.write('\x1b[H\x1b[J\x1b[?1049l\x1b[1G\x1b[K\x1b[?25h');
  }
}
