/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventEmitter } from 'node:events';
import type { Config, GeminiCLIExtension } from '../config/config.js';
import { refreshServerHierarchicalMemory } from './memoryDiscovery.js';

export abstract class ExtensionLoader {
  // Assigned in `start`.
  protected config: Config | undefined;

  // Used to track the count of currently starting and stopping extensions and
  // fire appropriate events.
  protected startingCount: number = 0;
  protected startCompletedCount: number = 0;
  protected stoppingCount: number = 0;
  protected stopCompletedCount: number = 0;

  // Whether or not we are currently executing `start`
  private isStarting: boolean = false;

  constructor(private readonly eventEmitter?: EventEmitter<ExtensionEvents>) {}

  /**
   * All currently known extensions, both active and inactive.
   */
  abstract getExtensions(): GeminiCLIExtension[];

  /**
   * Fully initializes all active extensions.
   *
   * Called within `Config.initialize`, which must already have an
   * McpClientManager, PromptRegistry, and GeminiChat set up.
   */
  async start(config: Config): Promise<void> {
    this.isStarting = true;
    try {
      if (!this.config) {
        this.config = config;
      } else {
        throw new Error('Already started, you may only call `start` once.');
      }
      await Promise.all(
        this.getExtensions()
          .filter((e) => e.isActive)
          .map(this.startExtension.bind(this)),
      );
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Unconditionally starts an `extension` and loads all its MCP servers,
   * context, custom commands, etc. Assumes that `start` has already been called
   * and we have a Config object.
   *
   * This should typically only be called from `start`, most other calls should
   * go through `maybeStartExtension` which will only start the extension if
   * extension reloading is enabled and the `config` object is initialized.
   */
  protected async startExtension(extension: GeminiCLIExtension) {
    if (!this.config) {
      throw new Error('Cannot call `startExtension` prior to calling `start`.');
    }
    this.startingCount++;
    this.eventEmitter?.emit('extensionsStarting', {
      total: this.startingCount,
      completed: this.startCompletedCount,
    });
    try {
      await this.config.getMcpClientManager()!.startExtension(extension);
      await this.maybeRefreshGeminiTools(extension);

      // Note: Context files are loaded only once all extensions are done
      // loading/unloading to reduce churn, see the `maybeRefreshMemories` call
      // below.

      // TODO: Update custom command updating away from the event based system
      // and call directly into a custom command manager here. See the
      // useSlashCommandProcessor hook which responds to events fired here today.
    } finally {
      this.startCompletedCount++;
      this.eventEmitter?.emit('extensionsStarting', {
        total: this.startingCount,
        completed: this.startCompletedCount,
      });
      if (this.startingCount === this.startCompletedCount) {
        this.startingCount = 0;
        this.startCompletedCount = 0;
      }
      await this.maybeRefreshMemories();
    }
  }

  private async maybeRefreshMemories(): Promise<void> {
    if (!this.config) {
      throw new Error(
        'Cannot refresh gemini memories prior to calling `start`.',
      );
    }
    if (
      !this.isStarting && // Don't refresh memories on the first call to `start`.
      this.startingCount === this.startCompletedCount &&
      this.stoppingCount === this.stopCompletedCount
    ) {
      // Wait until all extensions are done starting and stopping before we
      // reload memory, this is somewhat expensive and also busts the context
      // cache, we want to only do it once.
      await refreshServerHierarchicalMemory(this.config);
    }
  }

  /**
   * Refreshes the gemini tools list if it is initialized and the extension has
   * any excludeTools settings.
   */
  private async maybeRefreshGeminiTools(
    extension: GeminiCLIExtension,
  ): Promise<void> {
    if (extension.excludeTools && extension.excludeTools.length > 0) {
      const geminiClient = this.config?.getGeminiClient();
      if (geminiClient?.isInitialized()) {
        await geminiClient.setTools();
      }
    }
  }

  /**
   * If extension reloading is enabled and `start` has already been called,
   * then calls `startExtension` to include all extension features into the
   * program.
   */
  protected maybeStartExtension(
    extension: GeminiCLIExtension,
  ): Promise<void> | undefined {
    if (this.config && this.config.getEnableExtensionReloading()) {
      return this.startExtension(extension);
    }
    return;
  }

  /**
   * Unconditionally stops an `extension` and unloads all its MCP servers,
   * context, custom commands, etc. Assumes that `start` has already been called
   * and we have a Config object.
   *
   * Most calls should go through `maybeStopExtension` which will only stop the
   * extension if extension reloading is enabled and the `config` object is
   * initialized.
   */
  protected async stopExtension(extension: GeminiCLIExtension) {
    if (!this.config) {
      throw new Error('Cannot call `stopExtension` prior to calling `start`.');
    }
    this.stoppingCount++;
    this.eventEmitter?.emit('extensionsStopping', {
      total: this.stoppingCount,
      completed: this.stopCompletedCount,
    });

    try {
      await this.config.getMcpClientManager()!.stopExtension(extension);
      await this.maybeRefreshGeminiTools(extension);

      // Note: Context files are loaded only once all extensions are done
      // loading/unloading to reduce churn, see the `maybeRefreshMemories` call
      // below.

      // TODO: Update custom command updating away from the event based system
      // and call directly into a custom command manager here. See the
      // useSlashCommandProcessor hook which responds to events fired here today.
    } finally {
      this.stopCompletedCount++;
      this.eventEmitter?.emit('extensionsStopping', {
        total: this.stoppingCount,
        completed: this.stopCompletedCount,
      });
      if (this.stoppingCount === this.stopCompletedCount) {
        this.stoppingCount = 0;
        this.stopCompletedCount = 0;
      }
      await this.maybeRefreshMemories();
    }
  }

  /**
   * If extension reloading is enabled and `start` has already been called,
   * then this also performs all necessary steps to remove all extension
   * features from the rest of the system.
   */
  protected maybeStopExtension(
    extension: GeminiCLIExtension,
  ): Promise<void> | undefined {
    if (this.config && this.config.getEnableExtensionReloading()) {
      return this.stopExtension(extension);
    }
    return;
  }

  async restartExtension(extension: GeminiCLIExtension): Promise<void> {
    await this.stopExtension(extension);
    await this.startExtension(extension);
  }
}

export interface ExtensionEvents {
  extensionsStarting: ExtensionsStartingEvent[];
  extensionsStopping: ExtensionsStoppingEvent[];
}

export interface ExtensionsStartingEvent {
  total: number;
  completed: number;
}

export interface ExtensionsStoppingEvent {
  total: number;
  completed: number;
}

export class SimpleExtensionLoader extends ExtensionLoader {
  constructor(
    protected readonly extensions: GeminiCLIExtension[],
    eventEmitter?: EventEmitter<ExtensionEvents>,
  ) {
    super(eventEmitter);
  }

  getExtensions(): GeminiCLIExtension[] {
    return this.extensions;
  }

  /// Adds `extension` to the list of extensions and calls
  /// `maybeStartExtension`.
  ///
  /// This is intended for dynamic loading of extensions after calling `start`.
  async loadExtension(extension: GeminiCLIExtension) {
    this.extensions.push(extension);
    await this.maybeStartExtension(extension);
  }

  /// Removes `extension` from the list of extensions and calls
  // `maybeStopExtension` if it was found.
  ///
  /// This is intended for dynamic unloading of extensions after calling `start`.
  async unloadExtension(extension: GeminiCLIExtension) {
    const index = this.extensions.indexOf(extension);
    if (index === -1) return;
    this.extensions.splice(index, 1);
    await this.maybeStopExtension(extension);
  }
}
