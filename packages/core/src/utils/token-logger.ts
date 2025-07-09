/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fsp } from 'fs';
import path from 'path';

const TOKEN_LOG_FILE = 'token_usage.log';

export interface TokenUsageData {
  timestamp: string;
  model: string;
  input_token_count: number;
  output_token_count: number;
  cached_content_token_count: number;
  thoughts_token_count: number;
  tool_token_count: number;
  total_token_count: number;
}

export async function logTokenUsage(data: TokenUsageData): Promise<void> {
  const logDir = path.join(process.cwd(), '.gemini');
  const logFile = path.join(logDir, TOKEN_LOG_FILE);

  try {
    await fsp.mkdir(logDir, { recursive: true });
    const logEntry = JSON.stringify(data) + '\n';
    await fsp.appendFile(logFile, logEntry, 'utf-8');
  } catch (error) {
    // In a CLI environment, we might not want to bother the user with logging errors.
    // We can log to the console if in debug mode, but otherwise fail silently.
    if (process.env.DEBUG || process.env.DEBUG_MODE) {
      console.error('Failed to write token usage log:', error);
    }
  }
}
