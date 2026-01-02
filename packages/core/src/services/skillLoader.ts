/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';
import { debugLogger } from '../utils/debugLogger.js';

export interface SkillDefinition {
  name: string;
  description: string;
  location: string;
  body: string;
  disabled?: boolean;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)/;

export class SkillLoader {
  /**
   * Discovers and loads all skills in the provided directory.
   */
  static async loadSkillsFromDir(dir: string): Promise<SkillDefinition[]> {
    const discoveredSkills: SkillDefinition[] = [];
    const seenLocations = new Set<string>();

    try {
      const absoluteSearchPath = path.resolve(dir);
      const stats = await fs.stat(absoluteSearchPath).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        return [];
      }

      const skillFiles = await glob('*/SKILL.md', {
        cwd: absoluteSearchPath,
        absolute: true,
        nodir: true,
      });

      for (const skillFile of skillFiles) {
        const metadata = await SkillLoader.loadSkillFromFile(skillFile);
        if (metadata) {
          discoveredSkills.push(metadata);
          seenLocations.add(skillFile);
        }
      }
    } catch (error) {
      debugLogger.log(`Error discovering skills in ${dir}:`, error);
    }

    return discoveredSkills;
  }

  /**
   * Loads a single skill from a SKILL.md file.
   */
  static async loadSkillFromFile(
    filePath: string,
  ): Promise<SkillDefinition | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const match = content.match(FRONTMATTER_REGEX);
      if (!match) {
        return null;
      }

      const frontmatter = yaml.load(match[1]);
      if (!frontmatter || typeof frontmatter !== 'object') {
        return null;
      }

      const { name, description } = frontmatter as Record<string, unknown>;
      if (typeof name !== 'string' || typeof description !== 'string') {
        return null;
      }

      return {
        name,
        description,
        location: filePath,
        body: match[2].trim(),
      };
    } catch (error) {
      debugLogger.log(`Error parsing skill file ${filePath}:`, error);
      return null;
    }
  }
}
