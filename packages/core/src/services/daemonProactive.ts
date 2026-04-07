/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Proactive action engine for the daemon. Analyzes project state
 * and suggests/executes proactive actions like detecting TODOs, failing tests,
 * and outdated dependencies.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '../utils/debugLogger.js';
import type { DaemonAction, ProactiveActionType } from './daemonService.js';

/** Interface for a detected proactive action. */
export interface DetectedAction {
  type: ProactiveActionType;
  description: string;
  details: Record<string, unknown>;
  reversible: boolean;
  undoData?: Record<string, unknown>;
}

/** Pattern for TODO comments in code. */
const TODO_PATTERNS = [
  /\/\/\s*TODO[:\s](.+)/gi,
  /\/\/\s*FIXME[:\s](.+)/gi,
  /\/\/\s*HACK[:\s](.+)/gi,
  /\/\/\s*XXX[:\s](.+)/gi,
  /#\s*TODO[:\s](.+)/gi,
  /#\s*FIXME[:\s](.+)/gi,
  /\/\*\s*TODO[:\s](.+)\*\//gi,
  /<!--\s*TODO[:\s](.+)-->/gi,
];

/** File patterns to scan for TODOs. */
const TODO_FILE_PATTERNS = [
  /\.ts$/,
  /\.tsx$/,
  /\.js$/,
  /\.jsx$/,
  /\.py$/,
  /\.go$/,
  /\.rs$/,
  /\.java$/,
  /\.rb$/,
  /\.php$/,
  /\.vue$/,
  /\.svelte$/,
  /\.astro$/,
  /\.md$/,
  /\.html$/,
  /\.css$/,
  /\.scss$/,
];

/**
 * Engine that detects and executes proactive actions on a project.
 */
export class ProactiveActionEngine {
  private readonly projectRoot: string;
  private readonly stateFile: string;
  private lastScanTime: number = 0;
  private knownTODOs: Map<string, string> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.stateFile = path.join(os.homedir(), '.gemini', 'daemon-state.json');
  }

  /**
   * Performs a periodic tick and returns any detected actions.
   */
  async performTick(): Promise<DaemonAction[]> {
    const actions: DaemonAction[] = [];

    try {
      // Scan for new TODOs
      const todoActions = await this.scanForTODOs();
      actions.push(...todoActions);

      // Check for failing tests
      const testActions = await this.checkForFailingTests();
      actions.push(...testActions);

      // Check for outdated dependencies
      const depActions = await this.checkOutdatedDependencies();
      actions.push(...depActions);

      this.lastScanTime = Date.now();
      await this.saveState();
    } catch (error) {
      debugLogger.error('[ProactiveEngine] Tick failed:', error);
    }

    return actions;
  }

  /**
   * Analyzes a file change event and returns any detected actions.
   */
  async analyzeFileChange(event: {
    type: string;
    path: string;
    timestamp: string;
  }): Promise<DaemonAction[]> {
    const actions: DaemonAction[] = [];

    // Check if the changed file has TODOs
    if (event.type === 'change' || event.type === 'add') {
      const fileTODOs = await this.extractTODOsFromFile(event.path);
      if (fileTODOs.length > 0) {
        for (const todo of fileTODOs) {
          actions.push(this.createAction('todo_detected', todo.description, {
            file: event.path,
            line: todo.line,
            text: todo.text,
          }, false));
        }
      }
    }

    return actions;
  }

  /**
   * Undoes a reversible action if possible.
   */
  async undoAction(action: DaemonAction): Promise<boolean> {
    if (!action.reversible || !action.undoData) {
      return false;
    }

    try {
      switch (action.type) {
        case 'file_changed':
          // Restore file from backup if available
          if (action.undoData.backupPath) {
            await fs.copyFile(
              action.undoData.backupPath as string,
              action.details.targetPath as string
            );
            return true;
          }
          break;
        // Add more undo cases as needed
      }
      return false;
    } catch (error) {
      debugLogger.error('[ProactiveEngine] Undo failed:', error);
      return false;
    }
  }

  // --- Private methods ---

  private async scanForTODOs(): Promise<DaemonAction[]> {
    const actions: DaemonAction[] = [];
    const newTODOs: Array<{ file: string; line: number; text: string }> = [];

    try {
      const files = await this.findFilesToScan();

      for (const file of files) {
        const fileTODOs = await this.extractTODOsFromFile(file);

        for (const todo of fileTODOs) {
          const key = `${file}:${todo.line}`;
          if (!this.knownTODOs.has(key)) {
            newTODOs.push({ file, ...todo });
            this.knownTODOs.set(key, todo.text);
          }
        }
      }

      // Create action for new TODOs found
      if (newTODOs.length > 0) {
        actions.push(this.createAction(
          'todo_detected',
          `Found ${newTODOs.length} new TODO(s) in project`,
          { todos: newTODOs },
          false
        ));
      }
    } catch (error) {
      debugLogger.error('[ProactiveEngine] TODO scan failed:', error);
    }

    return actions;
  }

  private async checkForFailingTests(): Promise<DaemonAction[]> {
    const actions: DaemonAction[] = [];

    try {
      // Check if package.json has test scripts
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      let hasTests = false;

      try {
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        hasTests = !!pkg.scripts?.test && pkg.scripts.test !== 'echo "No tests"';
      } catch {
        // No package.json or invalid JSON
        return actions;
      }

      if (!hasTests) return actions;

      // Run tests and capture results
      // Note: We don't automatically run tests here to avoid side effects
      // The daemon should just report potential issues

      // For now, just check if test files exist and are recently modified
      const testDirs = ['__tests__', 'test', 'tests', 'spec'];
      const testFiles: string[] = [];

      for (const dir of testDirs) {
        const testDirPath = path.join(this.projectRoot, dir);
        try {
          const entries = await fs.readdir(testDirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
              testFiles.push(path.join(testDirPath, entry.name));
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }

      // Check for .test.ts files in src directories
      const srcDirs = ['src', 'lib'];
      for (const dir of srcDirs) {
        const srcPath = path.join(this.projectRoot, dir);
        try {
          const entries = await fs.readdir(srcPath, { recursive: true, withFileTypes: true });
          for (const entry of entries as fs.Dirent[]) {
            if (entry.isFile() && /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
              testFiles.push(path.join(srcPath, entry.name));
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }

      if (testFiles.length > 0) {
        actions.push(this.createAction(
          'test_failure',
          `Detected ${testFiles.length} test file(s). Consider running tests.`,
          { testFiles, testCommand: 'npm test' },
          false
        ));
      }
    } catch (error) {
      debugLogger.error('[ProactiveEngine] Test check failed:', error);
    }

    return actions;
  }

  private async checkOutdatedDependencies(): Promise<DaemonAction[]> {
    const actions: DaemonAction[] = [];

    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json');

      try {
        await fs.access(packageJsonPath);
      } catch {
        // No package.json
        return actions;
      }

      // Check package.json modification time
      const stats = await fs.stat(packageJsonPath);
      const modifiedTime = stats.mtime.getTime();
      const daysSinceModified = (Date.now() - modifiedTime) / (1000 * 60 * 60 * 24);

      // Only suggest if package.json hasn't been modified in 7+ days
      if (daysSinceModified > 7) {
        actions.push(this.createAction(
          'dependency_outdated',
          `package.json unchanged for ${Math.floor(daysSinceModified)} days. Consider checking for outdated dependencies.`,
          { lastModified: stats.mtime.toISOString(), checkCommand: 'npm outdated' },
          false
        ));
      }
    } catch (error) {
      debugLogger.error('[ProactiveEngine] Dependency check failed:', error);
    }

    return actions;
  }

  private async findFilesToScan(): Promise<string[]> {
    const files: string[] = [];
    const maxFiles = 500; // Limit to prevent overwhelming

    async function scan(dir: string, root: string): Promise<void> {
      if (files.length >= maxFiles) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= maxFiles) break;

          const fullPath = path.join(dir, entry.name);
          const relative = path.relative(root, fullPath);

          // Skip common non-source directories
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage'].includes(entry.name)) {
              continue;
            }
            await scan(fullPath, root);
          } else if (entry.isFile()) {
            // Check if file matches TODO patterns
            if (TODO_FILE_PATTERNS.some(p => p.test(entry.name))) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    await scan(this.projectRoot, this.projectRoot);
    return files;
  }

  private async extractTODOsFromFile(
    filePath: string
  ): Promise<Array<{ line: number; text: string; description: string }>> {
    const todos: Array<{ line: number; text: string; description: string }> = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of TODO_PATTERNS) {
          pattern.lastIndex = 0; // Reset regex state
          const match = pattern.exec(line);
          if (match && match[1]) {
            const todoText = match[1].trim();
            todos.push({
              line: i + 1,
              text: todoText,
              description: `TODO in ${path.basename(filePath)}:${i + 1}: ${todoText.slice(0, 50)}${todoText.length > 50 ? '...' : ''}`,
            });
            break;
          }
        }
      }
    } catch {
      // Skip files that can't be read
    }

    return todos;
  }

  private createAction(
    type: ProactiveActionType,
    description: string,
    details: Record<string, unknown>,
    reversible: boolean,
    undoData?: Record<string, unknown>
  ): DaemonAction {
    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      description,
      details,
      reversible,
      undoData,
    };
  }

  private async saveState(): Promise<void> {
    try {
      const state = {
        lastScanTime: this.lastScanTime,
        knownTODOs: Object.fromEntries(this.knownTODOs),
      };
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      debugLogger.warn('[ProactiveEngine] Failed to save state:', error);
    }
  }

  async loadState(): Promise<void> {
    try {
      const content = await fs.readFile(this.stateFile, 'utf-8');
      const state = JSON.parse(content);
      this.lastScanTime = state.lastScanTime ?? 0;
      this.knownTODOs = new Map(Object.entries(state.knownTODOs ?? {}));
    } catch {
      // State file doesn't exist or is invalid - start fresh
    }
  }
}