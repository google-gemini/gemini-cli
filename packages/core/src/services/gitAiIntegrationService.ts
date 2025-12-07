/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookRegistry } from '../hooks/hookRegistry.js';
import { HookEventName, HookType } from '../hooks/types.js';
import { ConfigSource } from '../hooks/hookRegistry.js';
import { debugLogger } from '../utils/debugLogger.js';
import { exec } from 'node:child_process';

/**
 * Service for integrating git-ai hooks into the hook system.
 * Registers git-ai checkpoint hooks that run last for matching tool events.
 */
export class GitAiIntegrationService {
  private readonly enabled: boolean;
  private readonly commandPath: string;
  private registered = false;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.commandPath = 'git-ai';
  }

  /**
   * Initialize the git-ai integration by checking availability and registering hooks
   */
  async initialize(hookRegistry: HookRegistry): Promise<void> {
    if (!this.enabled) {
      debugLogger.debug('Git-AI integration is disabled');
      return;
    }

    if (this.registered) {
      debugLogger.debug('Git-AI hooks already registered');
      return;
    }

    // Check if git-ai command is available
    const isAvailable = await this.isGitAiAvailable();
    if (!isAvailable) {
      debugLogger.debug(
        'git-ai command not found in PATH, skipping git-ai integration',
      );
      return;
    }

    // Register hooks
    this.registerHooks(hookRegistry);
    this.registered = true;

    debugLogger.log('Git-AI integration initialized successfully');
  }

  /**
   * Check if git-ai is installed by running 'git-ai version'
   */
  private async isGitAiAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        exec('git-ai version', (error) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch {
        // Handle edge case where exec throws synchronously
        resolve(false);
      }
    });
  }

  /**
   * Register git-ai hooks for BeforeTool and AfterTool events
   */
  private registerHooks(hookRegistry: HookRegistry): void {
    const command = `${this.commandPath} checkpoint gemini --hook-input stdin`;
    const matcher = 'write_file|replace';

    // Register BeforeTool hook
    hookRegistry.addHookEntry({
      config: {
        type: HookType.Command,
        command: command,
      },
      source: ConfigSource.Extensions,
      eventName: HookEventName.BeforeTool,
      matcher: matcher,
      enabled: true,
    });

    // Register AfterTool hook
    hookRegistry.addHookEntry({
      config: {
        type: HookType.Command,
        command: command,
      },
      source: ConfigSource.Extensions,
      eventName: HookEventName.AfterTool,
      matcher: matcher,
      enabled: true,
    });

    debugLogger.debug(
      `Registered git-ai hooks for BeforeTool and AfterTool events (matcher: ${matcher})`,
    );
  }

  /**
   * Get the status of the git-ai integration
   */
  getStatus(): {
    enabled: boolean;
    registered: boolean;
  } {
    return {
      enabled: this.enabled,
      registered: this.registered,
    };
  }
}

