/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Context Detection System
 *
 * Detects git status, project type, and other contextual information
 * to power smart suggestions
 *
 * @module suggestions/context-detector
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type {
  SuggestionContext,
  GitContext,
  ProjectType,
} from './types.js';

/**
 * Detect current context for suggestions
 */
export class ContextDetector {
  private cwd: string;
  private recentFiles: string[] = [];
  private recentCommands: string[] = [];

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  /**
   * Get complete context
   */
  async detect(partialInput?: string): Promise<SuggestionContext> {
    return {
      cwd: this.cwd,
      git: await this.detectGit(),
      projectType: this.detectProjectType(),
      recentFiles: this.recentFiles,
      partialInput,
      recentCommands: this.recentCommands,
    };
  }

  /**
   * Detect git context
   */
  async detectGit(): Promise<GitContext | undefined> {
    try {
      // Check if we're in a git repo
      const isRepo = fs.existsSync(path.join(this.cwd, '.git'));
      if (!isRepo) {
        // Try parent directories
        const gitRoot = this.findGitRoot();
        if (!gitRoot) {
          return undefined;
        }
      }

      const context: GitContext = {
        isRepo: true,
      };

      // Get current branch
      try {
        const branch = execSync('git branch --show-current', {
          cwd: this.cwd,
          encoding: 'utf8',
        }).trim();
        context.branch = branch;
      } catch {
        // Might be detached HEAD
      }

      // Check for changes
      try {
        const status = execSync('git status --porcelain', {
          cwd: this.cwd,
          encoding: 'utf8',
        });
        context.hasChanges = status.length > 0;

        // Count untracked files
        const untracked = status
          .split('\n')
          .filter((line) => line.startsWith('??'));
        context.untrackedFiles = untracked.length;
      } catch {
        // No git or error
      }

      // Check for conflicts
      try {
        const conflicts = execSync('git diff --name-only --diff-filter=U', {
          cwd: this.cwd,
          encoding: 'utf8',
        });
        context.hasConflicts = conflicts.length > 0;
      } catch {
        // No conflicts or error
      }

      return context;
    } catch {
      return undefined;
    }
  }

  /**
   * Find git root directory
   */
  private findGitRoot(): string | null {
    let current = this.cwd;
    while (current !== path.parse(current).root) {
      if (fs.existsSync(path.join(current, '.git'))) {
        return current;
      }
      current = path.dirname(current);
    }
    return null;
  }

  /**
   * Detect project type
   */
  detectProjectType(): ProjectType {
    // Check for package.json (Node.js)
    if (fs.existsSync(path.join(this.cwd, 'package.json'))) {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(this.cwd, 'package.json'), 'utf8'),
        );

        // Check for specific frameworks
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if (deps?.react) return 'react';
        if (deps?.vue) return 'vue';
        if (deps?.['@angular/core']) return 'angular';
        if (deps?.typescript) return 'typescript';

        return 'nodejs';
      } catch {
        return 'nodejs';
      }
    }

    // Check for requirements.txt or setup.py (Python)
    if (
      fs.existsSync(path.join(this.cwd, 'requirements.txt')) ||
      fs.existsSync(path.join(this.cwd, 'setup.py')) ||
      fs.existsSync(path.join(this.cwd, 'pyproject.toml'))
    ) {
      return 'python';
    }

    // Check for pom.xml or build.gradle (Java)
    if (
      fs.existsSync(path.join(this.cwd, 'pom.xml')) ||
      fs.existsSync(path.join(this.cwd, 'build.gradle'))
    ) {
      return 'java';
    }

    // Check for go.mod (Go)
    if (fs.existsSync(path.join(this.cwd, 'go.mod'))) {
      return 'go';
    }

    // Check for Cargo.toml (Rust)
    if (fs.existsSync(path.join(this.cwd, 'Cargo.toml'))) {
      return 'rust';
    }

    return 'unknown';
  }

  /**
   * Track recent file access
   */
  trackFile(filePath: string): void {
    // Add to beginning, remove if already present
    this.recentFiles = this.recentFiles.filter((f) => f !== filePath);
    this.recentFiles.unshift(filePath);

    // Keep only last 20
    if (this.recentFiles.length > 20) {
      this.recentFiles = this.recentFiles.slice(0, 20);
    }
  }

  /**
   * Track recent command
   */
  trackCommand(command: string): void {
    this.recentCommands = this.recentCommands.filter((c) => c !== command);
    this.recentCommands.unshift(command);

    // Keep only last 10
    if (this.recentCommands.length > 10) {
      this.recentCommands = this.recentCommands.slice(0, 10);
    }
  }

  /**
   * Set current working directory
   */
  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  /**
   * Get current working directory
   */
  getCwd(): string {
    return this.cwd;
  }
}

/**
 * Singleton instance
 */
let detectorInstance: ContextDetector | null = null;

/**
 * Get global context detector
 */
export function getContextDetector(): ContextDetector {
  if (!detectorInstance) {
    detectorInstance = new ContextDetector();
  }
  return detectorInstance;
}

/**
 * Reset context detector (for testing)
 */
export function resetContextDetector(): void {
  detectorInstance = null;
}
