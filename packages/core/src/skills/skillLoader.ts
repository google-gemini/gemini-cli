/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import { load } from 'js-yaml';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

/**
 * Represents the definition of an Agent Skill.
 */
export interface SkillDefinition {
  /** The unique name of the skill. */
  name: string;
  /** A concise description of what the skill does. */
  description: string;
  /** The absolute path to the skill's source file on disk. */
  location: string;
  /** The core logic/instructions of the skill. */
  body: string;
  /** Whether the skill is currently disabled. */
  disabled?: boolean;
  /** Whether the skill is a built-in skill. */
  isBuiltin?: boolean;
  /** The name of the extension that provided this skill, if any. */
  extensionName?: string;
  /** Optional load metadata from the most recent discovery pass. */
  loadMetadata?: SkillLoadMetric;
}

export type SkillLoadCacheStatus = 'hit' | 'miss' | 'bypass';
export type SkillParseResult = 'loaded' | 'invalid_frontmatter' | 'error';

export interface SkillLoadMetric {
  name?: string;
  location: string;
  duration_ms: number;
  cache_status: SkillLoadCacheStatus;
  parse_result: SkillParseResult;
}

export interface SkillDiscoveryReport {
  source_dir: string;
  total_duration_ms: number;
  glob_duration_ms: number;
  skill_count: number;
  invalid_count: number;
  skill_metrics: SkillLoadMetric[];
}

export interface SkillLoadResult {
  skills: SkillDefinition[];
  report: SkillDiscoveryReport;
}

export const FRONTMATTER_REGEX =
  /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?/;

/**
 * Parses frontmatter content using YAML with a fallback to simple key-value parsing.
 * This handles cases where description contains colons that would break YAML parsing.
 */
export function parseFrontmatter(
  content: string,
): { name: string; description: string } | null {
  try {
    const parsed = load(content);
    if (parsed && typeof parsed === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const { name, description } = parsed as Record<string, unknown>;
      if (typeof name === 'string' && typeof description === 'string') {
        return { name, description };
      }
    }
  } catch (yamlError) {
    debugLogger.debug(
      'YAML frontmatter parsing failed, falling back to simple parser:',
      yamlError,
    );
  }

  return parseSimpleFrontmatter(content);
}

/**
 * Simple frontmatter parser that extracts name and description fields.
 * Handles cases where values contain colons that would break YAML parsing.
 */
function parseSimpleFrontmatter(
  content: string,
): { name: string; description: string } | null {
  const lines = content.split(/\r?\n/);
  let name: string | undefined;
  let description: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match "name:" at the start of the line (optional whitespace)
    const nameMatch = line.match(/^\s*name:\s*(.*)$/);
    if (nameMatch) {
      name = nameMatch[1].trim();
      continue;
    }

    // Match "description:" at the start of the line (optional whitespace)
    const descMatch = line.match(/^\s*description:\s*(.*)$/);
    if (descMatch) {
      const descLines = [descMatch[1].trim()];

      // Check for multi-line description (indented continuation lines)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // If next line is indented, it's a continuation of the description
        if (nextLine.match(/^[ \t]+\S/)) {
          descLines.push(nextLine.trim());
          i++;
        } else {
          break;
        }
      }

      description = descLines.filter(Boolean).join(' ');
      continue;
    }
  }

  if (name !== undefined && description !== undefined) {
    return { name, description };
  }
  return null;
}

/**
 * Discovers and loads all skills in the provided directory.
 */
export async function loadSkillsFromDir(
  dir: string,
): Promise<SkillDefinition[]> {
  return (await loadSkillsFromDirWithReport(dir)).skills;
}

/**
 * Discovers and loads all skills in the provided directory, returning timing metadata.
 */
export async function loadSkillsFromDirWithReport(
  dir: string,
): Promise<SkillLoadResult> {
  const discoveredSkills: SkillDefinition[] = [];
  const absoluteSearchPath = path.resolve(dir);
  const startTime = performance.now();
  const report: SkillDiscoveryReport = {
    source_dir: absoluteSearchPath,
    total_duration_ms: 0,
    glob_duration_ms: 0,
    skill_count: 0,
    invalid_count: 0,
    skill_metrics: [],
  };

  try {
    const stats = await fs.stat(absoluteSearchPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      report.total_duration_ms = Math.round(performance.now() - startTime);
      return { skills: [], report };
    }

    const pattern = ['SKILL.md', '*/SKILL.md'];
    const globStart = performance.now();
    const skillFiles = await glob(pattern, {
      cwd: absoluteSearchPath,
      absolute: true,
      nodir: true,
      follow: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });
    report.glob_duration_ms = Math.round(performance.now() - globStart);

    for (const skillFile of skillFiles) {
      const { skill, metric } = await loadSkillFromFile(skillFile);
      report.skill_metrics.push(metric);
      if (skill) {
        discoveredSkills.push(skill);
      } else {
        report.invalid_count++;
      }
    }

    report.skill_count = discoveredSkills.length;

    if (discoveredSkills.length === 0) {
      const files = await fs.readdir(absoluteSearchPath);
      if (files.length > 0) {
        debugLogger.debug(
          `Failed to load skills from ${absoluteSearchPath}. The directory is not empty but no valid skills were discovered. Please ensure SKILL.md files are present in subdirectories and have valid frontmatter.`,
        );
      }
    }
  } catch (error) {
    coreEvents.emitFeedback(
      'warning',
      `Error discovering skills in ${dir}:`,
      error,
    );
  }

  report.total_duration_ms = Math.round(performance.now() - startTime);
  return { skills: discoveredSkills, report };
}

/**
 * Loads a single skill from a SKILL.md file.
 */
export async function loadSkillFromFile(
  filePath: string,
): Promise<{ skill: SkillDefinition | null; metric: SkillLoadMetric }> {
  const startTime = performance.now();
  const cacheStatus: SkillLoadCacheStatus = 'bypass';

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) {
      return {
        skill: null,
        metric: {
          location: filePath,
          duration_ms: Math.round(performance.now() - startTime),
          cache_status: cacheStatus,
          parse_result: 'invalid_frontmatter',
        },
      };
    }

    const frontmatter = parseFrontmatter(match[1]);
    if (!frontmatter) {
      return {
        skill: null,
        metric: {
          location: filePath,
          duration_ms: Math.round(performance.now() - startTime),
          cache_status: cacheStatus,
          parse_result: 'invalid_frontmatter',
        },
      };
    }

    // Sanitize name for use as a filename/directory name (e.g. replace ':' with '-')
    const sanitizedName = frontmatter.name.replace(/[:\\/<>*?"|]/g, '-');
    const metric: SkillLoadMetric = {
      name: sanitizedName,
      location: filePath,
      duration_ms: Math.round(performance.now() - startTime),
      cache_status: cacheStatus,
      parse_result: 'loaded',
    };
    const skill: SkillDefinition = {
      name: sanitizedName,
      description: frontmatter.description,
      location: filePath,
      body: match[2]?.trim() ?? '',
      loadMetadata: metric,
    };

    return { skill, metric };
  } catch (error) {
    debugLogger.log(`Error parsing skill file ${filePath}:`, error);
    return {
      skill: null,
      metric: {
        location: filePath,
        duration_ms: Math.round(performance.now() - startTime),
        cache_status: cacheStatus,
        parse_result: 'error',
      },
    };
  }
}
