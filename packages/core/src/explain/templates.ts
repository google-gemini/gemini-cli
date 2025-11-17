/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Explanation Templates
 *
 * Pre-defined explanations for common tools and operations
 *
 * @module explain/templates
 */

import type { ExplanationTemplate } from './types.js';

export const EXPLANATION_TEMPLATES = new Map<string, ExplanationTemplate>([
  [
    'read-file',
    {
      toolName: 'read-file',
      brief: 'Reads file contents',
      normal:
        'The read-file tool loads the contents of a file from disk to analyze or process the information within it.',
      detailed:
        'The read-file tool opens and reads the specified file from the file system. This allows Gemini to examine code, configuration, documentation, or any other text-based files to answer your questions or perform requested operations. Files are read in memory and not modified unless explicitly requested.',
      useCases: [
        'Analyzing code structure and logic',
        'Reviewing configuration files',
        'Extracting information from documents',
      ],
      tips: [
        'Use @ syntax for quick file references (e.g., "Explain @src/app.ts")',
        'Gemini can read multiple files in a single request',
      ],
      examples: [
        {
          description: 'Read and explain a file',
          input: 'Explain what @src/index.ts does',
          output: 'File contents analyzed and explained',
          explanation:
            'Gemini reads the file and provides a summary of its purpose and functionality',
        },
      ],
    },
  ],

  [
    'write-file',
    {
      toolName: 'write-file',
      brief: 'Creates or updates files',
      normal:
        'The write-file tool creates new files or updates existing ones with the specified content.',
      detailed:
        'The write-file tool writes data to the file system. When creating new files, it ensures parent directories exist. When updating existing files, it replaces the entire content. This tool is used when you ask Gemini to create code files, configuration files, or any other text-based documents.',
      useCases: [
        'Creating new source code files',
        'Generating configuration files',
        'Writing documentation',
      ],
      tips: [
        'Always review generated files before using them',
        'Gemini will ask for confirmation before overwriting files',
      ],
    },
  ],

  [
    'shell',
    {
      toolName: 'shell',
      brief: 'Executes shell commands',
      normal:
        'The shell tool runs commands in your system shell to perform operations like running tests, building projects, or managing files.',
      detailed:
        'The shell tool executes commands in your operating system shell (bash, zsh, cmd, etc.). This enables Gemini to run tests, build your project, install dependencies, manage git repositories, and perform any other task that can be done via command-line. Commands run in your current working directory with your user permissions.',
      useCases: [
        'Running tests and builds',
        'Installing dependencies (npm install, pip install, etc.)',
        'Git operations (commit, push, pull, etc.)',
        'File system operations',
      ],
      tips: [
        'Shell commands run with your user permissions',
        'Review commands before they execute in sensitive contexts',
        'Use /dry-run to see what commands would be executed',
      ],
    },
  ],

  [
    'glob',
    {
      toolName: 'glob',
      brief: 'Finds files by pattern',
      normal:
        'The glob tool searches for files matching a pattern (e.g., "**/*.ts" finds all TypeScript files).',
      detailed:
        'The glob tool uses pattern matching to find files in your project. It supports wildcards (* for any characters, ** for any directories) and is useful for locating files without knowing exact paths. This is often the first step when Gemini needs to work with multiple related files.',
      useCases: [
        'Finding all files of a certain type',
        'Locating test files',
        'Discovering configuration files',
      ],
      tips: [
        'Use ** to search recursively',
        'Combine with other tools for powerful workflows',
      ],
      examples: [
        {
          description: 'Find all TypeScript files',
          input: 'Find all .ts files',
          output: 'List of matching files',
          explanation:
            'Gemini uses glob pattern "**/*.ts" to find all TypeScript files',
        },
      ],
    },
  ],

  [
    'grep',
    {
      toolName: 'grep',
      brief: 'Searches file contents',
      normal:
        'The grep tool searches for text patterns within files, useful for finding code references or specific content.',
      detailed:
        'The grep tool searches through file contents using pattern matching. It can find function definitions, variable references, specific strings, or complex regex patterns across your entire codebase. This is essential for understanding code structure and finding relevant code sections.',
      useCases: [
        'Finding function definitions',
        'Locating variable usages',
        'Searching for TODO comments',
        'Finding error messages',
      ],
      tips: [
        'Use regex for powerful pattern matching',
        'Combine with glob to search specific file types',
      ],
    },
  ],

  [
    'web-fetch',
    {
      toolName: 'web-fetch',
      brief: 'Fetches web content',
      normal:
        'The web-fetch tool retrieves content from URLs to access documentation, APIs, or web resources.',
      detailed:
        'The web-fetch tool makes HTTP requests to retrieve content from the internet. This allows Gemini to access online documentation, fetch data from APIs, or retrieve any publicly available web content to help answer your questions or complete tasks.',
      useCases: [
        'Reading online documentation',
        'Fetching API data',
        'Accessing web resources',
      ],
      tips: [
        'Works with any publicly accessible URL',
        'Useful for accessing latest documentation',
      ],
    },
  ],

  [
    'git',
    {
      toolName: 'git',
      brief: 'Manages version control',
      normal:
        'Git tools help manage your repository, including commits, branches, and remote operations.',
      detailed:
        'Git integration allows Gemini to interact with your version control system. This includes viewing status, creating commits, managing branches, and synchronizing with remote repositories. Git operations respect your existing configuration and credentials.',
      useCases: [
        'Committing changes',
        'Creating and switching branches',
        'Viewing repository history',
        'Managing remote repositories',
      ],
      tips: [
        'Gemini follows git best practices',
        'Review commit messages before they are created',
        'Use /git-status to see current repository state',
      ],
    },
  ],
]);
