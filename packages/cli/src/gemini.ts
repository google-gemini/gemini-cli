/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { toolRegistry } from './tools/tool-registry.js';
import { loadCliConfig } from './config/config.js';
import {
  LSTool,
  ReadFileTool,
  GrepTool,
  GlobTool,
  EditTool,
  TerminalTool,
  WriteFileTool,
  WebFetchTool,
} from '@gemini-code/server';

async function main() {
  // Load configuration
  const config = loadCliConfig();

  // Configure tools using the loaded config
  registerTools(config.getTargetDir());

  // Render UI, passing necessary config values
  render(
    React.createElement(App, {
      config,
    }),
  );
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _promise) => {
  // Check if this is the known 429 ClientError that sometimes escapes
  // this is a workaround for a specific issue with the way we are calling gemini
  // where a 429 error is thrown but not caught, causing an unhandled rejection
  // TODO(adh): Remove this when the race condition is fixed
  const isKnownEscaped429 =
    reason instanceof Error &&
    reason.name === 'ClientError' &&
    reason.message.includes('got status: 429');

  if (isKnownEscaped429) {
    // Log it differently and DON'T exit, as it's likely already handled visually
    console.warn('-----------------------------------------');
    console.warn(
      'WORKAROUND: Suppressed known escaped 429 Unhandled Rejection.',
    );
    console.warn('-----------------------------------------');
    console.warn('Reason:', reason);
    // No process.exit(1);
  } else {
    // Log other unexpected unhandled rejections as critical errors
    console.error('=========================================');
    console.error('CRITICAL: Unhandled Promise Rejection!');
    console.error('=========================================');
    console.error('Reason:', reason);
    console.error('Stack trace may follow:');
    if (!(reason instanceof Error)) {
      console.error(reason);
    }
    // Exit for genuinely unhandled errors
    process.exit(1);
  }
});

// --- Global Entry Point ---
main().catch((error) => {
  console.error('An unexpected critical error occurred:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});

function registerTools(targetDir: string) {
  const config = loadCliConfig();
  const lsTool = new LSTool(targetDir);
  const readFileTool = new ReadFileTool(targetDir);
  const grepTool = new GrepTool(targetDir);
  const globTool = new GlobTool(targetDir);
  const editTool = new EditTool(targetDir);
  const terminalTool = new TerminalTool(targetDir, config);
  const writeFileTool = new WriteFileTool(targetDir);
  const webFetchTool = new WebFetchTool();

  toolRegistry.registerTool(lsTool);
  toolRegistry.registerTool(readFileTool);
  toolRegistry.registerTool(grepTool);
  toolRegistry.registerTool(globTool);
  toolRegistry.registerTool(editTool);
  toolRegistry.registerTool(terminalTool);
  toolRegistry.registerTool(writeFileTool);
  toolRegistry.registerTool(webFetchTool);
}
