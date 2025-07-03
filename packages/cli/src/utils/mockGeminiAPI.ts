/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// src/utils/mockGeminiAPI.ts
// Simulates Gemini API for code assistance in Termux with Pyrmethus's arcane flair

import chalk from 'chalk';

export class MockGeminiAPI {
  static async getSuggestion(prompt: string): Promise<string | null> {
    console.log(chalk.cyan('// Consulting the ether’s wisdom...'));
    if (prompt.includes('generate'))
      return 'Craft a clear prompt and parse response for code blocks using regex.';
    if (prompt.includes('debug'))
      return 'Analyze code for syntax errors and check error messages for clues.';
    if (prompt.includes('explain'))
      return 'Break down code into components and describe functionality clearly.';
    if (prompt.includes('list'))
      return 'Use fs-extra.readdir for listing directory contents with type filtering.';
    if (prompt.includes('delete'))
      return 'Use fs-extra.remove with confirmation for safe deletion.';
    if (prompt.includes('search'))
      return 'Use recursive fs.readdir and content search for file matching.';
    if (prompt.includes('info'))
      return 'Use fs.lstat for file metadata like size and permissions.';
    if (prompt.includes('Debug'))
      return 'Check file paths, permissions, and existence with fs.existsSync.';
    return 'No specific suggestion available. Provide detailed prompt.';
  }
}
