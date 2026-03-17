/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface KnowledgeIndexEntry {
  path: string;
  level: 'global' | 'project' | 'micro' | 'epic';
  summary: string;
  tags: string[];
  lastUpdated: string;
}

export interface KnowledgeIndex {
  entries: KnowledgeIndexEntry[];
  version: string;
}

export class KnowledgeIndexingService {
  private readonly config: Config;
  private readonly indexPath: string;

  constructor(config: Config) {
    this.config = config;
    this.indexPath = path.join(
      config.getProjectRoot(),
      '.gemini',
      'knowledge_index.json',
    );
  }

  /**
   * Scans the workspace and updates the knowledge index.
   */
  async updateIndex(): Promise<void> {
    debugLogger.debug('AKL: Updating knowledge index...');
    const projectRoot = this.config.getProjectRoot();
    const entries: KnowledgeIndexEntry[] = [];

    // 1. Scan for machine-learnings.md and GEMINI.md
    // We'll use a manual walk since findFiles is missing or has a different name
    const files: string[] = [];
    const geminiMdFiles: string[] = [];

    const walk = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (this.config.getFileService().shouldIgnoreFile(fullPath)) continue;

        if (item.isDirectory()) {
          await walk(fullPath);
        } else if (item.name === 'machine-learnings.md') {
          files.push(fullPath);
        } else if (item.name === 'GEMINI.md') {
          geminiMdFiles.push(fullPath);
        }
      }
    };

    await walk(projectRoot);

    // 2. Index Machine Learnings
    for (const file of [...files, ...geminiMdFiles]) {
      const entry = await this.createEntry(file, projectRoot);
      if (entry) entries.push(entry);
    }

    // 3. Index Epics
    const epicDir = path.join(projectRoot, '.gemini', 'epics');
    try {
      const epics = await fs.readdir(epicDir);
      for (const epicId of epics) {
        const entry = await this.createEpicEntry(epicId, projectRoot);
        if (entry) entries.push(entry);
      }
    } catch {
      // Epics dir might not exist
    }

    const index: KnowledgeIndex = {
      entries,
      version: '1.0.0',
    };

    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
    debugLogger.debug(`AKL: Index updated with ${entries.length} entries.`);
  }

  private async createEntry(
    filePath: string,
    projectRoot: string,
  ): Promise<KnowledgeIndexEntry | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      const isGeminiMd = filePath.endsWith('GEMINI.md');

      // Simple heuristic for summary: first few bullet points or section headers
      const lines = content.split('\n');
      const learningsLine = lines.findIndex(
        (l) =>
          l.includes('## Agent Machine Learnings') ||
          l.includes('## Gemini Added Memories'),
      );
      const summaryLines =
        learningsLine !== -1
          ? lines.slice(learningsLine + 1, learningsLine + 5)
          : lines.slice(0, 5);

      const summary = summaryLines.join(' ').trim().substring(0, 200);
      const relativePath = path.relative(projectRoot, filePath);

      return {
        path: relativePath,
        level: this.determineLevel(relativePath, isGeminiMd),
        summary:
          summary ||
          (isGeminiMd
            ? 'Project mandates and instructions'
            : 'Machine learnings and optimizations'),
        tags: this.extractTags(content),
        lastUpdated: stats.mtime.toISOString(),
      };
    } catch (error) {
      debugLogger.debug(`AKL: Failed to index ${filePath}: ${String(error)}`);
      return null;
    }
  }

  private async createEpicEntry(
    epicId: string,
    projectRoot: string,
  ): Promise<KnowledgeIndexEntry | null> {
    const contextPath = path.join(
      projectRoot,
      '.gemini',
      'epics',
      epicId,
      'context.md',
    );
    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      const stats = await fs.stat(contextPath);

      return {
        path: path.join('.gemini', 'epics', epicId),
        level: 'epic',
        summary: content
          .split('\n')
          .slice(0, 5)
          .join(' ')
          .trim()
          .substring(0, 200),
        tags: [epicId, 'epic'],
        lastUpdated: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  private determineLevel(
    relativePath: string,
    _isGeminiMd: boolean,
  ): 'global' | 'project' | 'micro' {
    if (relativePath.includes('..')) return 'global';
    if (!relativePath.includes(path.sep)) return 'project';
    return 'micro';
  }

  private extractTags(content: string): string[] {
    const tags = new Set<string>();
    const matches = content.match(/#\w+/g);
    if (matches) matches.forEach((m) => tags.add(m.substring(1)));
    return Array.from(tags);
  }

  async loadIndex(): Promise<KnowledgeIndex | null> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
