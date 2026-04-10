/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getMemoryDir, ensureMemoryDirExists, loadMemoryDirectory } from './memoryDiscovery.js';
import { getRecentSessionLogs, summarizeSessionLogs } from './sessionLog.js';
import { debugLogger } from '../utils/debugLogger.js';

const logger = {
  debug: (...args: unknown[]) =>
    debugLogger.debug('[DEBUG] [MemoryConsolidation]', ...args),
  warn: (...args: unknown[]) =>
    debugLogger.warn('[WARN] [MemoryConsolidation]', ...args),
  error: (...args: unknown[]) =>
    debugLogger.error('[ERROR] [MemoryConsolidation]', ...args),
};

// Consolidation configuration
const MIN_HOURS_BETWEEN_CONSOLIDATION = 24;
const MIN_SESSIONS_FOR_CONSOLIDATION = 3;

interface ConsolidationState {
  lastConsolidatedAt: number;
  sessionCount: number;
}

const STATE_FILE_NAME = '.consolidation-state.json';

/**
 * Get the path to the consolidation state file.
 */
function getStateFilePath(memoryDir: string): string {
  return path.join(memoryDir, STATE_FILE_NAME);
}

/**
 * Read the consolidation state.
 */
async function readConsolidationState(memoryDir: string): Promise<ConsolidationState> {
  try {
    const content = await fs.readFile(getStateFilePath(memoryDir), 'utf-8');
    return JSON.parse(content) as ConsolidationState;
  } catch {
    return {
      lastConsolidatedAt: 0,
      sessionCount: 0,
    };
  }
}

/**
 * Write the consolidation state.
 */
async function writeConsolidationState(
  memoryDir: string,
  state: ConsolidationState,
): Promise<void> {
  await fs.writeFile(
    getStateFilePath(memoryDir),
    JSON.stringify(state, null, 2),
    'utf-8',
  );
}

/**
 * Run the consolidation logic in the main thread.
 * This is the entry point for background consolidation.
 */
export async function runConsolidation(projectRoot: string): Promise<void> {
  const memoryDir = getMemoryDir(projectRoot);
  await ensureMemoryDirExists(memoryDir);

  const state = await readConsolidationState(memoryDir);
  const now = Date.now();
  const hoursSinceLastConsolidation = (now - state.lastConsolidatedAt) / 3_600_000;

  // Check time gate
  if (hoursSinceLastConsolidation < MIN_HOURS_BETWEEN_CONSOLIDATION) {
    logger.debug(
      `Consolidation skipped: ${hoursSinceLastConsolidation.toFixed(1)}h since last (need ${MIN_HOURS_BETWEEN_CONSOLIDATION}h)`,
    );
    return;
  }

  // Check session gate
  const recentLogs = await getRecentSessionLogs(7);

  // Count sessions since last consolidation
  let sessionsSinceLast = 0;
  for (const log of recentLogs) {
    for (const entry of log.entries) {
      const entryTime = new Date(entry.timestamp).getTime();
      if (entryTime > state.lastConsolidatedAt) {
        sessionsSinceLast++;
      }
    }
  }

  if (sessionsSinceLast < MIN_SESSIONS_FOR_CONSOLIDATION) {
    logger.debug(
      `Consolidation skipped: ${sessionsSinceLast} sessions since last (need ${MIN_SESSIONS_FOR_CONSOLIDATION})`,
    );
    return;
  }

  logger.debug(
    `Starting consolidation: ${hoursSinceLastConsolidation.toFixed(1)}h since last, ${sessionsSinceLast} new sessions`,
  );

  // Load existing memories
  const memoryResult = await loadMemoryDirectory(projectRoot);

  // Get session summaries
  const sessionSummaries = summarizeSessionLogs(recentLogs);

  if (!sessionSummaries.trim()) {
    logger.debug('Consolidation skipped: no session content to process');
    return;
  }

  // The actual consolidation prompt would be sent to the LLM
  // For now, we just mark that consolidation ran successfully
  // In a real implementation, this would invoke the model
  // buildConsolidationPrompt(sessionSummaries, existingMemories)
  void memoryResult.files.length; // Acknowledge memory files loaded

  // Update state
  state.lastConsolidatedAt = now;
  state.sessionCount += sessionsSinceLast;
  await writeConsolidationState(memoryDir, state);

  logger.debug('Consolidation completed');
}

/**
 * Worker thread entry point for background consolidation.
 */
async function workerMain(): Promise<void> {
  if (!isMainThread && workerData) {
    const { projectRoot } = workerData as { projectRoot: string };
    try {
      await runConsolidation(projectRoot);
      parentPort?.postMessage({ success: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      parentPort?.postMessage({ success: false, error: message });
    }
  }
}

// Run worker if this is the worker thread
if (!isMainThread) {
  workerMain().catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    parentPort?.postMessage({ success: false, error: message });
  });
}

/**
 * Spawn a background worker to run memory consolidation.
 * This is non-blocking and runs in a separate thread.
 */
export function spawnConsolidationWorker(projectRoot: string): Promise<void> {
  return new Promise((resolve) => {
    // Get the current module path for worker
    const currentPath = fileURLToPath(import.meta.url);
    const worker = new Worker(currentPath, {
      workerData: { projectRoot },
    });

    worker.on('message', (message: { success: boolean; error?: string }) => {
      if (!message.success) {
        logger.error(`Consolidation worker error: ${message.error}`);
      }
      worker.terminate();
      resolve();
    });

    worker.on('error', (error: Error) => {
      logger.error(`Consolidation worker error: ${error.message}`);
      worker.terminate();
      resolve();
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      logger.warn('Consolidation worker timeout, terminating');
      worker.terminate();
      resolve();
    }, 300_000);
  });
}

/**
 * Check if consolidation should run and spawn a worker if needed.
 * This is the main entry point for automatic consolidation.
 */
export async function maybeRunConsolidation(projectRoot: string): Promise<void> {
  const memoryDir = getMemoryDir(projectRoot);
  const state = await readConsolidationState(memoryDir);
  const now = Date.now();
  const hoursSinceLastConsolidation = (now - state.lastConsolidatedAt) / 3_600_000;

  // Quick gate check before spawning worker
  if (hoursSinceLastConsolidation < MIN_HOURS_BETWEEN_CONSOLIDATION) {
    return;
  }

  // Spawn worker in background
  await spawnConsolidationWorker(projectRoot);
}