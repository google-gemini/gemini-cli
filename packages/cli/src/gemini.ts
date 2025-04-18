import React from 'react';
import { render } from 'ink';
import App from './ui/App.js';
import { toolRegistry } from './tools/tool-registry.js';
import { LSTool } from './tools/ls.tool.js';
import { ReadFileTool } from './tools/read-file.tool.js';
import { GrepTool } from './tools/grep.tool.js';
import { GlobTool } from './tools/glob.tool.js';
import { EditTool } from './tools/edit.tool.js';
import { TerminalTool } from './tools/terminal.tool.js';
import { WriteFileTool } from './tools/write-file.tool.js';
import { WebFetchTool } from './tools/web-fetch.tool.js';
import { globalConfig } from './config/config.js';

async function main() {
  // Configure tools
  registerTools(globalConfig.getTargetDir());

  // Render UI
  render(
    React.createElement(App, {
      directory: globalConfig.getTargetDir(),
    }),
  );
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _) => {
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
  const lsTool = new LSTool(targetDir);
  const readFileTool = new ReadFileTool(targetDir);
  const grepTool = new GrepTool(targetDir);
  const globTool = new GlobTool(targetDir);
  const editTool = new EditTool(targetDir);
  const terminalTool = new TerminalTool(targetDir);
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
