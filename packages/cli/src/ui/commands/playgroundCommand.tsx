/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, Box, Text } from 'ink';
import { useState, useEffect, useReducer } from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { useKeypress } from '../hooks/useKeypress.js';

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
  const [promptContent, setPromptContent] = useState<string>('Loading prompt...');
  const [executionStream, setExecutionStream] = useState<string[]>([]);
  const [selectedIndex, dispatchIndex] = useReducer(selectedIndexReducer, 0);
  const [activeCase, setActiveCase] = useState<string | null>(null);

  useKeypress((key) => {
    if (key.name === 'up') {
      dispatchIndex('UP');
    }
    if (key.name === 'down') {
      dispatchIndex('DOWN');
    }
    if (key.name === 'enter') {
      setActiveCase(EVAL_CASES[selectedIndex]);
      setExecutionStream([`> Initializing Eval Case: '${EVAL_CASES[selectedIndex]}'`]);
    }
  }, { isActive: true });

  useEffect(() => {
    const fileToWatch = path.resolve(process.cwd(), 'packages/core/src/prompts/snippets.ts');
    try {
      if (fs.existsSync(fileToWatch)) {
        const content = fs.readFileSync(fileToWatch, 'utf8');
        setPromptContent(content.substring(0, 1500) + '\\n\\n(Truncated for display)');
      }
    } catch (e) {
      setPromptContent(`Error reading file: ${e}`);
    }

    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(fileToWatch, (eventType) => {
        if (eventType === 'change') {
          const content = fs.readFileSync(fileToWatch, 'utf8');
          setPromptContent(content.substring(0, 1500) + '\\n\\n(Truncated for display)');
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
    
    let currentLine = 1; // skip initializing line
    
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

  return (
    <Box flexDirection="column" width="100%" height={30} borderStyle="round" padding={0}>
      <Box paddingX={2} paddingY={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true}>
        <Text bold color="cyan">Gemini CLI - Local Prompt Playground</Text>
      </Box>
      <Box flexGrow={1} flexDirection="row">
        <Box width="50%" padding={1} paddingX={2} flexDirection="column" borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderRight={true}>
          <Text bold color="green">System Prompt Definition</Text>
          <Box marginTop={1} overflowY="hidden">
            <Text dimColor>{promptContent}</Text>
          </Box>
        </Box>
        <Box width="50%" padding={1} paddingX={2} flexDirection="column">
          <Text bold color="yellow">Live Execution Stream</Text>
          <Box marginTop={1} overflowY="hidden" flexDirection="column">
            {executionStream.length === 0 ? (
              <Text dimColor>Please select an eval case to begin...</Text>
            ) : (
              executionStream.map((line, i) => (
                <Text key={i} dimColor>{line}</Text>
              ))
            )}
          </Box>
        </Box>
      </Box>
      <Box paddingX={2} paddingY={1} flexDirection="column" borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false}>
        <Text bold color="magenta">Eval Cases (Use Up/Down Arrows, press Enter to Run):</Text>
        <Box flexDirection="column" marginTop={1}>
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
  const { waitUntilExit } = render(<PlaygroundApp />);
  await waitUntilExit();
}
