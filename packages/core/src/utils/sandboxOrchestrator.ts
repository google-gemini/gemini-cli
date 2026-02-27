/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parse } from 'shell-quote';
import type { Config, SandboxConfig } from '../config/config.js';
import { coreEvents } from './events.js';
import { debugLogger } from './debugLogger.js';
import { LOCAL_DEV_SANDBOX_IMAGE_NAME } from './constants.js';
import { spawnAsync } from './shell-utils.js';

/**
 * Orchestrates sandbox image management and command construction.
 * This class contains non-UI logic for sandboxing.
 */
export class SandboxOrchestrator {
  /**
   * Constructs the arguments for the container engine 'run' command.
   */
  static async getContainerRunArgs(
    config: SandboxConfig,
    workdir: string,
    containerWorkdir: string,
    sandboxFlags?: string,
    isPipedInput: boolean = false,
  ): Promise<string[]> {
    const args = ['run', '-i', '--rm', '--init', '--workdir', containerWorkdir];

    // Priority: env var > settings
    const flagsToUse = sandboxFlags || config.flags;
    if (flagsToUse) {
      const parsedFlags = parse(flagsToUse, process.env).filter(
        (f): f is string => typeof f === 'string',
      );
      args.push(...parsedFlags);
    }

    if (!isPipedInput) {
      args.push('-t');
    }

    // allow access to host.docker.internal
    args.push('--add-host', 'host.docker.internal:host-gateway');

    // mount current directory as working directory in sandbox
    args.push('--volume', `${workdir}:${containerWorkdir}`);

    return args;
  }

  /**
   * Constructs macOS Seatbelt (sandbox-exec) arguments.
   */
  static getSeatbeltArgs(
    targetDir: string,
    tmpDir: string,
    homeDir: string,
    cacheDir: string,
    profileFile: string,
    includedDirs: string[],
    maxIncludeDirs: number = 5,
  ): string[] {
    const args = [
      '-D',
      `TARGET_DIR=${targetDir}`,
      '-D',
      `TMP_DIR=${tmpDir}`,
      '-D',
      `HOME_DIR=${homeDir}`,
      '-D',
      `CACHE_DIR=${cacheDir}`,
    ];

    for (let i = 0; i < maxIncludeDirs; i++) {
      const dirPath = i < includedDirs.length ? includedDirs[i] : '/dev/null';
      args.push('-D', `INCLUDE_DIR_${i}=${dirPath}`);
    }

    args.push('-f', profileFile);
    return args;
  }

  /**
   * Ensures the sandbox image is present locally or pulled from the registry.
   */
  static async ensureSandboxImageIsPresent(
    sandbox: string,
    image: string,
    cliConfig?: Config,
  ): Promise<boolean> {
    debugLogger.log(`Checking for sandbox image: ${image}`);
    if (await this.imageExists(sandbox, image)) {
      debugLogger.log(`Sandbox image ${image} found locally.`);
      return true;
    }

    debugLogger.log(`Sandbox image ${image} not found locally.`);
    if (image === LOCAL_DEV_SANDBOX_IMAGE_NAME) {
      // user needs to build the image themselves
      return false;
    }

    if (await this.pullImage(sandbox, image, cliConfig)) {
      // After attempting to pull, check again to be certain
      if (await this.imageExists(sandbox, image)) {
        debugLogger.log(
          `Sandbox image ${image} is now available after pulling.`,
        );
        return true;
      } else {
        debugLogger.warn(
          `Sandbox image ${image} still not found after a pull attempt. This might indicate an issue with the image name or registry, or the pull command reported success but failed to make the image available.`,
        );
        return false;
      }
    }

    coreEvents.emitFeedback(
      'error',
      `Failed to obtain sandbox image ${image} after check and pull attempt.`,
    );
    return false; // Pull command failed or image still not present
  }

  private static async imageExists(
    sandbox: string,
    image: string,
  ): Promise<boolean> {
    try {
      const { stdout } = await spawnAsync(sandbox, ['images', '-q', image]);
      return stdout.trim() !== '';
    } catch (err) {
      debugLogger.warn(
        `Failed to check image existence with '${sandbox}': ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private static async pullImage(
    sandbox: string,
    image: string,
    cliConfig?: Config,
  ): Promise<boolean> {
    debugLogger.debug(`Attempting to pull image ${image} using ${sandbox}...`);
    try {
      const { stdout } = await spawnAsync(sandbox, ['pull', image]);
      if (cliConfig?.getDebugMode() || process.env['DEBUG']) {
        debugLogger.log(stdout.trim());
      }
      debugLogger.log(`Successfully pulled image ${image}.`);
      return true;
    } catch (err) {
      debugLogger.warn(
        `Failed to pull image ${image}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
