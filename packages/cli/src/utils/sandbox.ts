/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChildProcess } from 'node:child_process';
import {
  type SandboxConfig,
  SandboxManager,
  ConsolePatcher,
  debugLogger,
  coreEvents,
} from '@google/gemini-cli-core';

/**
 * Orchestrates the re-launch of the CLI into a sandbox environment using the driver architecture.
 */
export async function start_sandbox(
  config: SandboxConfig,
  nodeArgs: string[] = [],
  cliConfig?: any, // Config is complex to type here, using any for now or imported from core
  cliArgs: string[] = [],
): Promise<number> {
  const patcher = new ConsolePatcher({
    debugMode: cliConfig?.getDebugMode() || !!process.env['DEBUG'],
    stderr: true,
  });
  patcher.patch();

  try {
    const sandboxManager = SandboxManager.getInstance();
    const driver = await sandboxManager.discoverBestDriver(config.command);

    if (!driver) {
      coreEvents.emitFeedback('error', `No suitable sandbox driver found for command: ${config.command}`);
      return 1;
    }

    debugLogger.log(`Using sandbox driver: ${driver.name}`);
    
    // Prepare the sandbox (e.g., pull image)
    await driver.prepare(config);

    // Spawn the process
    const sandboxProcess: ChildProcess = await driver.spawn(config, nodeArgs, cliArgs);

    return await new Promise<number>((resolve, reject) => {
      sandboxProcess.on('error', (err) => {
        coreEvents.emitFeedback('error', `Sandbox process error (${driver.name})`, err);
        reject(err);
      });

      sandboxProcess.on('close', (code) => {
        process.stdin.resume();
        if (code !== 0 && code !== null) {
          debugLogger.log(`Sandbox process (${driver.name}) exited with code: ${code}`);
        }
        resolve(code ?? 1);
      });
    });
  } catch (error) {
    coreEvents.emitFeedback('error', 'Failed to start sandbox', error);
    return 1;
  } finally {
    patcher.cleanup();
  }
}
