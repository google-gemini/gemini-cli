/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import { load } from 'js-yaml';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

/**
 * Represents the definition of a Gemini Profile.
 */
export interface ProfileDefinition {
  /** The unique name of the profile (slug). */
  name: string;
  /** A concise description of the profile's purpose. */
  description?: string;
  /** The model ID to use for this profile. */
  default_model?: string;
  /** List of extension IDs allowed for this profile. */
  extensions?: string[];
  /** The absolute path to the profile file. */
  location: string;
  /** The system instructions / persona body. */
  body: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?/;

/**
 * Parses profile frontmatter.
 */
function parseProfileFrontmatter(
  content: string,
): Partial<ProfileDefinition> | null {
  try {
    const parsed = load(content);
    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<ProfileDefinition>;
    }
  } catch (error) {
    debugLogger.debug('YAML profile frontmatter parsing failed:', error);
  }
  return null;
}

/**
 * Loads a single profile from an .md file.
 */
export async function loadProfileFromFile(
  filePath: string,
): Promise<ProfileDefinition | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) {
      debugLogger.debug(`Profile ${filePath} is missing frontmatter.`);
      return null;
    }

    const frontmatter = parseProfileFrontmatter(match[1]);
    if (!frontmatter || !frontmatter.name) {
      debugLogger.debug(
        `Profile ${filePath} has invalid or missing name in frontmatter.`,
      );
      return null;
    }

    // Enforce name matches file slug (optional but good practice/consistency)
    const expectedName = path.basename(filePath, '.md');
    if (frontmatter.name !== expectedName) {
      debugLogger.debug(
        `Profile name in frontmatter (${frontmatter.name}) should match filename (${expectedName}).`,
      );
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      default_model: frontmatter.default_model,
      extensions: frontmatter.extensions,
      location: filePath,
      body: match[2]?.trim() ?? '',
    };
  } catch (error) {
    debugLogger.log(`Error parsing profile file ${filePath}:`, error);
    return null;
  }
}

/**
 * Discovers and loads all profiles in a directory.
 */
export async function loadProfilesFromDir(
  dir: string,
): Promise<ProfileDefinition[]> {
  const discoveredProfiles: ProfileDefinition[] = [];

  try {
    const absoluteSearchPath = path.resolve(dir);
    const stats = await fs.stat(absoluteSearchPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return [];
    }

    const profileFiles = await glob('*.md', {
      cwd: absoluteSearchPath,
      absolute: true,
      nodir: true,
    });

    for (const file of profileFiles) {
      const profile = await loadProfileFromFile(file);
      if (profile) {
        discoveredProfiles.push(profile);
      }
    }
  } catch (error) {
    coreEvents.emitFeedback(
      'warning',
      `Error discovering profiles in ${dir}:`,
      error,
    );
  }

  return discoveredProfiles;
}
