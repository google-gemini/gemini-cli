/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { WorkspaceContext, Unsubscribe } from './workspaceContext.js';
import { getEnvironmentContext } from './environmentContext.js';
import type { Part } from '@google/genai';
import path from 'node:path';
import fs from 'node:fs';

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
  private static instance: WorkspaceManager | null = null;
  private readonly config: Config;
  private readonly workspaceContext: WorkspaceContext;
  private readonly changeListeners = new Set<WorkspaceChangeListener>();
  private environmentContext: Part[] = [];
  private contextUpdatePromise: Promise<void> | null = null;
  private workspaceUnsubscribe: Unsubscribe;
  private readonly persistenceFilePath: string;
  private initializationPromise: Promise<void> | null = null;

  private constructor(config: Config) {
    this.config = config;
    this.workspaceContext = config.getWorkspaceContext();
    
    // Setup persistence file path in project temp directory
    const tempDir = this.config.storage.getProjectTempDir();
    this.persistenceFilePath = path.join(tempDir, 'active-workspace-directories.json');
    
    this.workspaceUnsubscribe = this.workspaceContext.onDirectoriesChanged(() => {
      this.scheduleContextUpdate();
      this.persistDirectories(); // Auto-save when directories change
    });

    this.scheduleContextUpdate();
    
    // Start async initialization
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadPersistedDirectories(); // Load persisted directories on startup
  }

  static getInstance(config?: Config): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      if (!config) {
        throw new Error('WorkspaceManager not initialized. Call with config first.');
      }
      WorkspaceManager.instance = new WorkspaceManager(config);
    }
    return WorkspaceManager.instance;
  }

  /**
   * Ensures the WorkspaceManager is fully initialized, including loading persisted directories.
   * @returns Promise that resolves when initialization is complete
   */
  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
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
  async addWorkspaceDirectory(directory: string, basePath?: string): Promise<void> {
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

  /**
   * Persists the current active workspace directories to disk.
   * This is called automatically when directories change.
   */
  private async persistDirectories(): Promise<void> {
    try {
      const directories = this.getDirectories();
      const data = {
        activeWorkspaceDirectories: directories,
        savedAt: new Date().toISOString()
      };
      
      // Ensure the temp directory exists
      const tempDir = path.dirname(this.persistenceFilePath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      await fs.promises.writeFile(this.persistenceFilePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`Persisted ${directories.length} active workspace directories`);
    } catch (error) {
      console.error('Failed to persist workspace directories:', error);
    }
  }

  /**
   * Loads persisted workspace directories from disk and applies them.
   * This is called automatically during initialization.
   */
  private async loadPersistedDirectories(): Promise<void> {
    try {
      if (!fs.existsSync(this.persistenceFilePath)) {
        console.log('No persisted workspace directories found');
        return;
      }
      
      const data = await fs.promises.readFile(this.persistenceFilePath, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.activeWorkspaceDirectories && Array.isArray(parsed.activeWorkspaceDirectories)) {
        const directories = parsed.activeWorkspaceDirectories as string[];
        
        // Validate that directories still exist before restoring
        const validDirectories = [];
        for (const dir of directories) {
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            validDirectories.push(dir);
          } else {
            console.warn(`Skipping restored directory (no longer exists): ${dir}`);
          }
        }
        
        if (validDirectories.length > 0) {
          // Don't trigger change notifications during initial load
          this.workspaceContext.setDirectories(validDirectories);
          console.log(`Restored ${validDirectories.length} active workspace directories from disk`);
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted workspace directories:', error);
    }
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