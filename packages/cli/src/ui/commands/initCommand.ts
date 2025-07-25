/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandKind } from './types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'create GEMINI.md project guide',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const { config } = context.services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const projectRoot = config.getProjectRoot();
    const geminiMdPath = path.join(projectRoot, 'GEMINI.md');

    // Check if GEMINI.md already exists
    let fileExists = false;
    try {
      await fs.access(geminiMdPath);
      fileExists = true;
    } catch (e) {
      // If the file doesn't exist, that's fine. For any other error (e.g. permissions),
      // we should stop and inform the user.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          type: 'message',
          messageType: 'error',
          content: `Error checking for GEMINI.md: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // Parse arguments properly to avoid matching partial strings
    const argsArray = args.trim().split(/\s+/);
    const forceFlag = argsArray.includes('--force');
    
    if (fileExists && !forceFlag) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'GEMINI.md already exists. Use "/init --force" to overwrite it.',
      };
    }

    // Return a query action that will automatically send the prompt
    return {
      type: 'query',
      query: `Please analyze the project structure and create a comprehensive GEMINI.md file that provides guidance for AI assistants working with this project.

You have access to these tools:
- **list_directory**: List files and folders in a directory
- **glob**: Find files matching patterns (e.g., "**/*.json", "packages/*/src/**/*.ts")
- **search_file_content**: Search for text patterns in files (grep)
- **read_file**: Read the contents of a file
- **read_many_files**: Read multiple files at once
- **run_shell_command**: Execute shell commands like find, ls, etc.
- **write_file**: Create or overwrite a file with content

IMPORTANT: Follow these steps in order:

1. **First, discover the project structure:**
   - Use 'list_directory' to explore the root directory
   - Use 'run_shell_command' with commands like 'find . -type f -name "*.json" | head -20' to find configuration files
   - Use 'search_file_content' to search for key patterns like "build", "test", "lint" in package.json files
   - Use 'glob' to find all package.json files, README files, and documentation (e.g., "**/*.md", "**/package.json")

2. **Then, analyze what you found:**
   - Use 'read_file' on README.md and any other documentation files
   - Use 'read_many_files' to read all package.json files at once
   - Look for configuration files (tsconfig.json, eslint configs, prettier configs)
   - Check if CLAUDE.md exists and read it to understand the expected format

3. **Explore the codebase architecture:**
   - Use 'search_file_content' to find main entry points, exports, and key patterns
   - Use 'read_file' on the main source files you discovered
   - Use 'glob' to understand the folder structure (e.g., "packages/*/src/**/*.ts")

4. **Finally, create GEMINI.md with these sections:**
   - **Project Overview**: Brief description based on what you learned
   - **Architecture**: Key architectural patterns and structure
   - **Development Commands**: All npm scripts found in package.json files
   - **Code Style Guidelines**: Based on eslint/prettier configs and observed patterns
   - **Testing Requirements**: Based on test scripts and test file patterns
   - **Important Notes**: Any special considerations you discovered

Use 'write_file' to create GEMINI.md in the project root with all your findings.`,
    };
  },
};