/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Worker thread entry point for background memory consolidation.
 * Receives project root and log directory via workerData, runs the
 * consolidation pipeline, and exits. Never blocks the main CLI process.
 *
 * Usage from the main thread:
 *   new Worker('./memoryConsolidationWorker.js', {
 *     workerData: { projectRoot, logDir, geminiMdPath, apiKey, model }
 *   });
 */

import { isMainThread, workerData, parentPort } from 'node:worker_threads';
import { SessionLogger } from './sessionLogger.js';
import {
  MemoryConsolidator,
  type ConsolidationLlmClient,
} from './memoryConsolidator.js';

/** Shape of the data passed via workerData from the main thread. */
interface WorkerConfig {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Directory containing session log files. */
  logDir: string;
  /** Path to the GEMINI.md file to update. */
  geminiMdPath: string;
  /** Gemini API key for the consolidation LLM call. */
  apiKey: string;
  /** The model to use for consolidation (e.g., 'gemini-2.0-flash'). */
  model: string;
  /** Number of days of logs to consider. Defaults to 7. */
  lookbackDays?: number;
}

/**
 * A minimal LLM client that calls the Gemini REST API directly.
 * We avoid importing the full GeminiClient to keep the worker lightweight.
 */
class WorkerLlmClient implements ConsolidationLlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateContent(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: unknown = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const result = data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    return text;
  }
}

function isWorkerConfig(value: unknown): value is WorkerConfig {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'projectRoot' in value &&
    typeof (value as { projectRoot: unknown }).projectRoot === 'string' &&
    'logDir' in value &&
    typeof (value as { logDir: unknown }).logDir === 'string' &&
    'geminiMdPath' in value &&
    typeof (value as { geminiMdPath: unknown }).geminiMdPath === 'string' &&
    'apiKey' in value &&
    typeof (value as { apiKey: unknown }).apiKey === 'string' &&
    'model' in value &&
    typeof (value as { model: unknown }).model === 'string'
  );
}

/**
 * Main worker entry point.
 */
async function runConsolidation(): Promise<void> {
  if (isMainThread) {
    throw new Error(
      'memoryConsolidationWorker must be run in a worker thread',
    );
  }

  const config: unknown = workerData;
  if (!isWorkerConfig(config)) {
    throw new Error('Invalid workerData: missing required fields');
  }

  const lookbackDays = config.lookbackDays ?? 7;

  // 1. Read recent session logs
  const logger = SessionLogger.create(config.logDir);
  const recentEntries = await logger.readRecentEntries(lookbackDays);

  if (recentEntries.length === 0) {
    parentPort?.postMessage({ status: 'skipped', reason: 'no_recent_logs' });
    return;
  }

  // 2. Run consolidation
  const llmClient = new WorkerLlmClient(config.apiKey, config.model);
  const consolidator = new MemoryConsolidator(llmClient);
  const result = await consolidator.consolidate(
    config.geminiMdPath,
    recentEntries,
  );

  parentPort?.postMessage({
    status: result.modified ? 'completed' : 'no_changes',
    insightsCount: result.insightsCount,
    error: result.error,
  });
}

// Execute when loaded as a worker
if (!isMainThread) {
  runConsolidation().catch((error) => {
    parentPort?.postMessage({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
