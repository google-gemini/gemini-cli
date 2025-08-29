/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { WorkspaceContext, Unsubscribe } from './workspaceContext.js';
import { getEnvironmentContext } from './environmentContext.js';
import type { Part } from '@google/genai';

export interface WorkspaceChangeEvent {
  readonly type: 'added' | 'removed' | 'set';
  readonly directories: readonly string[];
  readonly changedDirectory?: string;
}

export type WorkspaceChangeListener = (event: WorkspaceChangeEvent) => void;

/**
 * WorkspaceManager provides a high-level interface for managing workspace directories
 * and ensures environment context is properly updated when directories change.
 * This class bridges the gap between frontend workspace operations and backend data flow.
 */
export class WorkspaceManager {
  private readonly config: Config;
  private readonly workspaceContext: WorkspaceContext;
  private readonly changeListeners = new Set<WorkspaceChangeListener>();
  private environmentContext: Part[] = [];
  private contextUpdatePromise: Promise<void> | null = null;
  private workspaceUnsubscribe: Unsubscribe;

  constructor(config: Config) {
    this.config = config;
    this.workspaceContext = config.getWorkspaceContext();
    
    this.workspaceUnsubscribe = this.workspaceContext.onDirectoriesChanged(() => {
      this.scheduleContextUpdate();
    });

    this.scheduleContextUpdate();
  }

  /**
   * Registers a listener for workspace change events.
   * @param listener The listener to register
   * @returns Function to unsubscribe the listener
   */
  onWorkspaceChange(listener: WorkspaceChangeListener): Unsubscribe {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Adds a directory to the workspace and notifies listeners.
   * @param directory The directory path to add
   * @param basePath Optional base path for resolving relative paths
   */
  async addDirectory(directory: string, basePath?: string): Promise<void> {
    const previousDirectories = this.getDirectories();
    
    try {
      this.workspaceContext.addDirectory(directory, basePath);
      const newDirectories = this.getDirectories();
      
      if (newDirectories.length > previousDirectories.length) {
        const addedDirectory = newDirectories.find(d => !previousDirectories.includes(d));
        this.notifyChange({
          type: 'added',
          directories: newDirectories,
          changedDirectory: addedDirectory,
        });
      }
    } catch (error) {
      throw new Error(`Failed to add directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sets the workspace directories to the given list, replacing all existing ones.
   * @param directories Array of directory paths
   */
  async setDirectories(directories: readonly string[]): Promise<void> {
    const previousDirectories = this.getDirectories();
    
    try {
      this.workspaceContext.setDirectories(directories);
      const newDirectories = this.getDirectories();
      
      if (!this.arraysEqual(previousDirectories, newDirectories)) {
        this.notifyChange({
          type: 'set',
          directories: newDirectories,
        });
      }
    } catch (error) {
      throw new Error(`Failed to set directories: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets all current workspace directories.
   * @returns Array of absolute directory paths
   */
  getDirectories(): readonly string[] {
    return this.workspaceContext.getDirectories();
  }

  /**
   * Gets the initial workspace directories from when the context was created.
   * @returns Array of absolute directory paths
   */
  getInitialDirectories(): readonly string[] {
    return this.workspaceContext.getInitialDirectories();
  }

  /**
   * Checks if a path is within any workspace directory.
   * @param pathToCheck The path to validate
   * @returns True if path is within workspace
   */
  isPathWithinWorkspace(pathToCheck: string): boolean {
    return this.workspaceContext.isPathWithinWorkspace(pathToCheck);
  }

  /**
   * Gets the current environment context for LLM consumption.
   * This context is automatically updated when directories change.
   * @returns Promise resolving to array of Part objects containing environment info
   */
  async getEnvironmentContext(): Promise<Part[]> {
    if (this.contextUpdatePromise) {
      await this.contextUpdatePromise;
    }
    return [...this.environmentContext];
  }

  /**
   * Forces an immediate update of the environment context.
   * Normally this happens automatically when directories change.
   * @returns Promise that resolves when context is updated
   */
  async updateEnvironmentContext(): Promise<void> {
    await this.scheduleContextUpdate();
  }

  /**
   * Cleanup method to unsubscribe from workspace context changes.
   */
  dispose(): void {
    this.workspaceUnsubscribe();
    this.changeListeners.clear();
  }

  private scheduleContextUpdate(): Promise<void> {
    if (this.contextUpdatePromise) {
      return this.contextUpdatePromise;
    }

    this.contextUpdatePromise = this.doUpdateContext()
      .finally(() => {
        this.contextUpdatePromise = null;
      });

    return this.contextUpdatePromise;
  }

  private async doUpdateContext(): Promise<void> {
    try {
      this.environmentContext = await getEnvironmentContext(this.config);
    } catch (error) {
      console.error('Failed to update environment context:', error);
      this.environmentContext = [{
        text: 'Error: Failed to load workspace environment context',
      }];
    }
  }

  private notifyChange(event: WorkspaceChangeEvent): void {
    for (const listener of [...this.changeListeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in workspace change listener:', error);
      }
    }
  }

  private arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index]);
  }
}