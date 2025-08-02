/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { getProjectTempDir } from '../utils/paths.js';

const PLAN_FILE_NAME = 'plan.json';

export type PlanStatus = 'pending' | 'in_progress' | 'done';
export type PlanPriority = 'high' | 'medium' | 'low';

export interface PlanEntry {
  id: string;
  content: string;
  status: PlanStatus;
  priority: PlanPriority;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

/**
 * Planner persists a single plan (array of PlanEntry objects) per CLI session.
 * The file is written next to logs.json inside the project temp directory,
 * which resolves to ~/.gemini/tmp/<project-hash>/plan.json.
 */
export class Planner {
  private planFilePath?: string;
  private initialized = false;
  private cache: PlanEntry[] = [];

  /**
   * Initialise the planner lazily; safe to call multiple times.
   */
  async initialize(cwd: string = process.cwd()): Promise<void> {
    if (this.initialized) return;

    const tempDir = getProjectTempDir(cwd);
    this.planFilePath = path.join(tempDir, PLAN_FILE_NAME);

    await fs.mkdir(tempDir, { recursive: true });

    // Ensure file exists
    try {
      await fs.access(this.planFilePath);
    } catch {
      await fs.writeFile(this.planFilePath, '[]', 'utf-8');
    }

    this.cache = await this._safeRead();
    this.initialized = true;
  }

  private async _safeRead(): Promise<PlanEntry[]> {
    if (!this.planFilePath) throw new Error('Planner not initialised');
    try {
      const txt = await fs.readFile(this.planFilePath, 'utf-8');
      const arr = JSON.parse(txt);
      if (Array.isArray(arr)) {
        // Basic shape validation
        return arr.filter((e) => typeof e.id === 'string' && typeof e.content === 'string');
      }
      return [];
    } catch {
      // Corrupted file – back it up and reset
      const backup = `${this.planFilePath}.bak.${Date.now()}`;
      try { 
        await fs.rename(this.planFilePath, backup); 
      } catch {
        // If backup fails, we'll continue anyway and reset the file
      }
      await fs.writeFile(this.planFilePath!, '[]', 'utf-8');
      return [];
    }
  }

  private async _flush(plan: PlanEntry[]): Promise<void> {
    if (!this.planFilePath) throw new Error('Planner not initialised');
    await fs.writeFile(this.planFilePath, JSON.stringify(plan, null, 2), 'utf-8');
    this.cache = plan;
  }

  async list(): Promise<PlanEntry[]> {
    await this.initialize();
    return [...this.cache];
  }

  async add(content: string, priority: PlanPriority = 'medium'): Promise<PlanEntry> {
    await this.initialize();
    const now = new Date().toISOString();
    const entry: PlanEntry = {
      id: crypto.randomUUID(),
      content,
      status: 'pending',
      priority,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...this.cache, entry];
    await this._flush(next);
    return entry;
  }

  async update(id: string, patch: Partial<Omit<PlanEntry, 'id' | 'createdAt'>>): Promise<PlanEntry | null> {
    await this.initialize();
    const idx = this.cache.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated: PlanEntry = {
      ...this.cache[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = [...this.cache];
    next[idx] = updated;
    await this._flush(next);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize();
    const next = this.cache.filter((e) => e.id !== id);
    if (next.length === this.cache.length) return false;
    await this._flush(next);
    return true;
  }

  async clear(): Promise<void> {
    await this._flush([]);
  }
}
