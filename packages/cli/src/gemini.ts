import React from 'react';
import { render } from 'ink';
import App from './ui/App.js';
import { parseArguments } from './config/args.js';
import { loadEnvironment } from './config/env.js';
import { getTargetDirectory } from './utils/paths.js';
import { toolRegistry } from './tools/tool-registry.js';
import { LSTool } from './tools/ls.tool.js';
import { ReadFileTool } from './tools/read-file.tool.js';
import { GrepTool } from './tools/grep.tool.js';
import { GlobTool } from './tools/glob.tool.js';
import { EditTool } from './tools/edit.tool.js';
import { TerminalTool } from './tools/terminal.tool.js';
import { WriteFileTool } from './tools/write-file.tool.js';

async function main() {
    // 1. Configuration
    loadEnvironment();
    const argv = await parseArguments(); // Ensure args.ts imports printWarning from ui/display
    const targetDir = getTargetDirectory(argv.target_dir);

    // 2. Configure tools
    registerTools(targetDir);

    // 3. Render UI
    render(React.createElement(App, { directory: targetDir }));
}

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

    toolRegistry.registerTool(lsTool);
    toolRegistry.registerTool(readFileTool);
    toolRegistry.registerTool(grepTool);
    toolRegistry.registerTool(globTool);
    toolRegistry.registerTool(editTool);
    toolRegistry.registerTool(terminalTool);
    toolRegistry.registerTool(writeFileTool);
}

