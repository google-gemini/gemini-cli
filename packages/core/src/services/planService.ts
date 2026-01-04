/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { debugLogger } from '../utils/debugLogger.js';
import { GEMINI_DIR } from '../utils/paths.js';

export const PLANS_DIR = 'plans';
export const PLAN_FILE_PREFIX = 'plan-';
export const PLAN_FILE_EXT = '.md';

/**
 * Metadata for a saved plan.
 */
export interface PlanMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'saved' | 'executed';
  originalPrompt: string;
  lastViewed?: string; // ISO timestamp of when plan was last viewed
}

/**
 * Complete plan data including content and metadata.
 */
export interface PlanData {
  content: string;
  metadata: PlanMetadata;
}

/**
 * Summary information for listing plans.
 */
export interface PlanSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'saved' | 'executed';
  filePath: string;
  lastViewed?: string;
}

/**
 * Service for persisting and managing implementation plans.
 *
 * Plans are stored as Markdown files in the .gemini/plans/ directory.
 * Each plan file contains YAML frontmatter with metadata followed by
 * the plan content in Markdown format.
 */
export class PlanService {
  private plansDir: string;

  constructor(projectRoot?: string) {
    // Store plans in project-local .gemini/plans/ directory
    const baseDir = projectRoot || process.cwd();
    this.plansDir = path.join(baseDir, GEMINI_DIR, PLANS_DIR);
  }

  /**
   * Ensures the plans directory exists.
   */
  private async ensurePlansDir(): Promise<void> {
    await fsPromises.mkdir(this.plansDir, { recursive: true });
  }

  /**
   * Generates a unique plan ID.
   */
  private generatePlanId(): string {
    const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    const shortId = randomUUID().slice(0, 8);
    return `${timestamp}-${shortId}`;
  }

  /**
   * Generates a filename for a plan.
   */
  private getPlanFilename(id: string): string {
    return `${PLAN_FILE_PREFIX}${id}${PLAN_FILE_EXT}`;
  }

  /**
   * Gets the full path to a plan file.
   */
  private getPlanPath(id: string): string {
    return path.join(this.plansDir, this.getPlanFilename(id));
  }

  /**
   * Extracts plan ID from a filename.
   */
  private extractPlanId(filename: string): string | null {
    if (
      filename.startsWith(PLAN_FILE_PREFIX) &&
      filename.endsWith(PLAN_FILE_EXT)
    ) {
      return filename.slice(PLAN_FILE_PREFIX.length, -PLAN_FILE_EXT.length);
    }
    return null;
  }

  /**
   * Serializes plan data to Markdown with YAML frontmatter.
   */
  private serializePlan(data: PlanData): string {
    const lines = [
      '---',
      `id: "${data.metadata.id}"`,
      `title: "${data.metadata.title.replace(/"/g, '\\"')}"`,
      `createdAt: "${data.metadata.createdAt}"`,
      `updatedAt: "${data.metadata.updatedAt}"`,
      `status: "${data.metadata.status}"`,
      `originalPrompt: "${data.metadata.originalPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
    ];

    // Only include lastViewed if it's set
    if (data.metadata.lastViewed) {
      lines.push(`lastViewed: "${data.metadata.lastViewed}"`);
    }

    lines.push('---', '');

    return lines.join('\n') + data.content;
  }

  /**
   * Parses plan data from Markdown with YAML frontmatter.
   */
  private parsePlan(fileContent: string, filePath: string): PlanData | null {
    const frontmatterMatch = fileContent.match(
      /^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
    );

    if (!frontmatterMatch) {
      debugLogger.warn(`Invalid plan file format: ${filePath}`);
      return null;
    }

    const [, frontmatter, content] = frontmatterMatch;

    // Parse YAML frontmatter manually (simple key: value parsing)
    const metadata: Record<string, string> = {};
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^(\w+):\s*"(.*)"\s*$/);
      if (match) {
        const [, key, value] = match;
        // Unescape the value
        metadata[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
      }
    }

    if (!metadata['id'] || !metadata['title']) {
      debugLogger.warn(`Missing required metadata in plan file: ${filePath}`);
      return null;
    }

    return {
      content: content.trim(),
      metadata: {
        id: metadata['id'],
        title: metadata['title'],
        createdAt: metadata['createdAt'] || new Date().toISOString(),
        updatedAt: metadata['updatedAt'] || new Date().toISOString(),
        status: (metadata['status'] as PlanMetadata['status']) || 'saved',
        originalPrompt: metadata['originalPrompt'] || '',
        lastViewed: metadata['lastViewed'] || undefined,
      },
    };
  }

  /**
   * Saves a new plan or updates an existing one.
   *
   * @param content The plan content in Markdown format.
   * @param title A short title for the plan.
   * @param originalPrompt The original user prompt that triggered planning.
   * @param existingId Optional ID to update an existing plan.
   * @returns The plan ID.
   */
  async savePlan(
    content: string,
    title: string,
    originalPrompt: string,
    existingId?: string,
  ): Promise<string> {
    await this.ensurePlansDir();

    const now = new Date().toISOString();
    const id = existingId || this.generatePlanId();
    const isUpdate = !!existingId;

    let metadata: PlanMetadata;

    if (isUpdate) {
      // Load existing metadata and update
      const existing = await this.loadPlan(id);
      if (existing) {
        metadata = {
          ...existing.metadata,
          title,
          updatedAt: now,
        };
      } else {
        // Plan doesn't exist, create new
        metadata = {
          id,
          title,
          createdAt: now,
          updatedAt: now,
          status: 'saved',
          originalPrompt,
        };
      }
    } else {
      metadata = {
        id,
        title,
        createdAt: now,
        updatedAt: now,
        status: 'saved',
        originalPrompt,
      };
    }

    const planData: PlanData = { content, metadata };
    const filePath = this.getPlanPath(id);

    try {
      await fsPromises.writeFile(
        filePath,
        this.serializePlan(planData),
        'utf8',
      );
      return id;
    } catch (error) {
      debugLogger.error('Error saving plan:', error);
      throw error;
    }
  }

  /**
   * Lists all saved plans.
   *
   * @param sortDesc Whether to sort by date descending (newest first).
   * @returns Array of plan summaries.
   */
  async listPlans(sortDesc: boolean = true): Promise<PlanSummary[]> {
    try {
      await this.ensurePlansDir();
      const files = await fsPromises.readdir(this.plansDir);
      const plans: PlanSummary[] = [];

      for (const file of files) {
        const id = this.extractPlanId(file);
        if (!id) continue;

        const filePath = path.join(this.plansDir, file);
        try {
          const content = await fsPromises.readFile(filePath, 'utf8');
          const planData = this.parsePlan(content, filePath);
          if (planData) {
            plans.push({
              id: planData.metadata.id,
              title: planData.metadata.title,
              createdAt: planData.metadata.createdAt,
              updatedAt: planData.metadata.updatedAt,
              status: planData.metadata.status,
              filePath,
              lastViewed: planData.metadata.lastViewed,
            });
          }
        } catch (error) {
          debugLogger.warn(`Error reading plan file ${file}:`, error);
        }
      }

      // Sort by updatedAt
      plans.sort((a, b) => {
        const comparison = a.updatedAt.localeCompare(b.updatedAt);
        return sortDesc ? -comparison : comparison;
      });

      return plans;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      debugLogger.error('Error listing plans:', error);
      throw error;
    }
  }

  /**
   * Loads a plan by ID.
   *
   * @param id The plan ID.
   * @returns The plan data, or null if not found.
   */
  async loadPlan(id: string): Promise<PlanData | null> {
    const filePath = this.getPlanPath(id);

    try {
      const content = await fsPromises.readFile(filePath, 'utf8');
      return this.parsePlan(content, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      debugLogger.error('Error loading plan:', error);
      throw error;
    }
  }

  /**
   * Deletes a plan by ID.
   *
   * @param id The plan ID.
   * @returns True if the plan was deleted, false if it didn't exist.
   */
  async deletePlan(id: string): Promise<boolean> {
    const filePath = this.getPlanPath(id);

    try {
      await fsPromises.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      debugLogger.error('Error deleting plan:', error);
      throw error;
    }
  }

  /**
   * Updates the status of a plan.
   *
   * @param id The plan ID.
   * @param status The new status.
   * @returns True if the plan was updated, false if it didn't exist.
   */
  async updatePlanStatus(
    id: string,
    status: PlanMetadata['status'],
  ): Promise<boolean> {
    const planData = await this.loadPlan(id);
    if (!planData) {
      return false;
    }

    planData.metadata.status = status;
    planData.metadata.updatedAt = new Date().toISOString();

    const filePath = this.getPlanPath(id);
    try {
      await fsPromises.writeFile(
        filePath,
        this.serializePlan(planData),
        'utf8',
      );
      return true;
    } catch (error) {
      debugLogger.error('Error updating plan status:', error);
      throw error;
    }
  }

  /**
   * Updates the lastViewed timestamp of a plan.
   *
   * @param id The plan ID.
   * @returns True if the plan was updated, false if it didn't exist.
   */
  async updateLastViewed(id: string): Promise<boolean> {
    const planData = await this.loadPlan(id);
    if (!planData) {
      return false;
    }

    planData.metadata.lastViewed = new Date().toISOString();

    const filePath = this.getPlanPath(id);
    try {
      await fsPromises.writeFile(
        filePath,
        this.serializePlan(planData),
        'utf8',
      );
      return true;
    } catch (error) {
      debugLogger.error('Error updating plan lastViewed:', error);
      throw error;
    }
  }

  /**
   * Exports a plan's content to a file.
   *
   * @param id The plan ID.
   * @param targetPath The path to export to.
   * @returns True if exported successfully.
   */
  async exportPlan(id: string, targetPath: string): Promise<boolean> {
    const planData = await this.loadPlan(id);
    if (!planData) {
      return false;
    }

    try {
      // Export just the content, not the frontmatter
      await fsPromises.writeFile(targetPath, planData.content, 'utf8');
      return true;
    } catch (error) {
      debugLogger.error('Error exporting plan:', error);
      throw error;
    }
  }

  /**
   * Gets the path to the plans directory.
   */
  getPlansDirectory(): string {
    return this.plansDir;
  }

  /**
   * Checks if a plan exists.
   */
  async planExists(id: string): Promise<boolean> {
    const filePath = this.getPlanPath(id);
    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
