/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCurrentGeminiMdFilename } from '@google/gemini-cli-core';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates a tailored DevX.md file.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.config.getTargetDir();
    const contextFileName = getCurrentGeminiMdFilename();
    const geminiMdPath = path.join(targetDir, contextFileName);

    if (fs.existsSync(geminiMdPath)) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          `A ${contextFileName} file already exists in this directory. No changes were made.`,
      };
    }

    // Create an empty DevX.md file
    fs.writeFileSync(geminiMdPath, '', 'utf8');

    context.ui.addItem(
      {
        type: 'info',
        text: `Empty ${contextFileName} created. Now analyzing the project to populate it.`,
      },
      Date.now(),
    );

    return {
      type: 'submit_prompt',
      content: `
You are an AI agent that brings the power of Gemini directly into the terminal. Your task is to analyze the current directory and generate a comprehensive ${contextFileName} file to be used as instructional context for future interactions with the AI assistant.

**CRITICAL INSTRUCTION:** After analyzing the project, you MUST use the write_file tool to save the generated content. The tool call should have:
- file_path: "${geminiMdPath}"
- content: The complete ${contextFileName} content you generate

**Analysis Process:**

1.  **Initial Exploration:**
    *   Start by listing the files and directories to get a high-level overview of the structure.
    *   Read the README file (e.g., \`README.md\`, \`README.txt\`) if it exists. This is often the best place to start.
    *   Check for configuration files (\`package.json\`, \`tsconfig.json\`, \`.eslintrc\`, etc.) to understand the tech stack.

2.  **Iterative Deep Dive (up to 10 files):**
    *   Based on your initial findings, select files that reveal the most about the project:
        - Configuration files (package.json, tsconfig.json, vite.config.js, etc.)
        - Main entry points (index.ts, main.py, app.js, etc.)
        - Test files to understand testing patterns
        - CI/CD configurations (.github/workflows, .gitlab-ci.yml)
        - Build configurations (Makefile, webpack.config.js, etc.)
    *   Let your discoveries guide your exploration - adapt based on what you find.

3.  **Identify Project Characteristics:**
    *   **Language & Framework:** TypeScript/JavaScript, Python, Go, Java, etc.
    *   **Project Type:** Web app, CLI tool, library, API service, etc.
    *   **Architecture:** Monorepo, microservices, single package, etc.
    *   **Testing Framework:** Jest, Vitest, Pytest, Go test, etc.
    *   **Build Tools:** Webpack, Vite, Rollup, Make, Gradle, etc.

**${contextFileName} Content Generation:**

Generate a comprehensive guide with the following structure:

# ${contextFileName}

## Project Overview
- Clear, concise summary of what this project does
- Main technologies and frameworks used
- High-level architecture description
- Key dependencies and their purposes

## Essential Commands

### Development
- Commands to start development mode
- Hot reload/watch mode commands
- Local environment setup

### Build & Deployment  
- Build commands for production
- Deployment procedures
- Environment-specific builds

### Testing & Quality
- Unit test commands
- Integration/E2E test commands
- Linting and formatting commands
- Type checking commands
- Coverage reports

## Architecture

### Project Structure
- Describe the directory layout
- Explain the purpose of key directories
- Note any unconventional structures

### Key Components
- List and describe main modules/packages
- Explain their relationships and dependencies
- Highlight important files and their roles

### Design Patterns
- Architectural patterns used (MVC, microservices, etc.)
- Code organization principles
- State management approach (if applicable)

## Development Guidelines

### Code Standards
- Language-specific best practices
- Naming conventions
- File organization rules
- Import/export patterns

### Testing Strategy
- Testing philosophy and coverage goals
- Test file locations and naming
- Mocking strategies
- Test data management

### Git Workflow
- Branch naming conventions
- Commit message format
- PR/MR process
- Code review guidelines

## Configuration

### Environment Variables
- List key environment variables
- Explain their purposes
- Note any required secrets

### Build Configuration
- Build tool configuration
- Bundle optimization settings
- Development vs production differences

## Troubleshooting

### Common Issues
- List known issues and solutions
- Dependency conflicts
- Build problems
- Runtime errors

### Development Tips
- Performance optimization tips
- Debugging strategies
- Useful development tools

## Additional Resources
- Link to documentation
- Related repositories
- External dependencies documentation
- Team contacts or support channels

**Special Instructions:**
- If you cannot determine certain information, add a TODO comment like: \`<!-- TODO: Add deployment procedures -->\`
- Be specific and accurate based on what you discover
- Include actual command examples from package.json scripts or Makefiles
- Adapt the sections based on the project type (some sections may not apply to all projects)

**Final Output:**
YOU MUST use the write_file tool to save the complete ${contextFileName} content. DO NOT just display the content - you MUST call the write_file tool with:
- file_path: "${geminiMdPath}"
- content: The complete well-formatted Markdown content with all sections filled in

The output must be well-formatted Markdown with clear sections and actionable information. Remember: The file has been created but is empty - you MUST write the content using the write_file tool.
`,
    };
  },
};
