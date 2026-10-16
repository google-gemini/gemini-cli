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
import { readFileWithEncoding } from '../utils/fileUtils.js';

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
}

export const FRONTMATTER_REGEX =
  /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

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

function stripOuterQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
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
    const namePrefixMatch = line.match(/^[ \t]*name[ \t]*:/i);
    if (namePrefixMatch) {
      name = stripOuterQuotes(line.slice(namePrefixMatch[0].length).trim());
      continue;
    }

    // Match "description:" at the start of the line (optional whitespace)
    const descPrefixMatch = line.match(/^([ \t]*)description[ \t]*:/i);
    if (descPrefixMatch) {
      const descIndent = descPrefixMatch[1].length;
      const firstLine = line.slice(descPrefixMatch[0].length).trim();
      const descLines = /^[>|][-+]?$/.test(firstLine) ? [] : [firstLine];

      // Check for multi-line description (continuation lines)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextIndentMatch = nextLine.match(/^[ \t]*/);
        const nextIndent = nextIndentMatch ? nextIndentMatch[0].length : 0;
        const isNonEmpty = nextIndent < nextLine.length;
        const isKnownKey = /^[ \t]*(?:name|description)[ \t]*:/i.test(nextLine);
        const isComment = /^[ \t]*#/.test(nextLine);
        const isOtherKeyAtOrAboveDescIndent =
          nextIndent <= descIndent &&
          /^[ \t]*[a-zA-Z0-9_-]+[ \t]*:/.test(nextLine);

        if (
          isNonEmpty &&
          !isKnownKey &&
          !isComment &&
          !isOtherKeyAtOrAboveDescIndent
        ) {
          descLines.push(nextLine.trim());
          i++;
        } else {
          break;
        }
      }

      description = stripOuterQuotes(descLines.filter(Boolean).join(' '));
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
  const discoveredSkills: SkillDefinition[] = [];

  try {
    const absoluteSearchPath = path.resolve(dir);
    const stats = await fs.stat(absoluteSearchPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return [];
    }

    const pattern = ['SKILL.md', '*/SKILL.md'];
    const skillFiles = await glob(pattern, {
      cwd: absoluteSearchPath,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    for (const skillFile of skillFiles) {
      const metadata = await loadSkillFromFile(skillFile);
      if (metadata) {
        discoveredSkills.push(metadata);
      }
    }

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

  return discoveredSkills;
}

/**
 * Loads a single skill from a SKILL.md file.
 */
export async function loadSkillFromFile(
  filePath: string,
): Promise<SkillDefinition | null> {
  try {
    const content = await readFileWithEncoding(filePath);
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) {
      return null;
    }

    const frontmatter = parseFrontmatter(match[1]);
    if (!frontmatter) {
      return null;
    }

    // Sanitize name for use as a filename/directory name (e.g. replace ':' with '-')
    const sanitizedName = frontmatter.name.replace(/[:\\/<>*?"|]/g, '-');

    return {
      name: sanitizedName,
      description: frontmatter.description,
      location: filePath,
      body: match[2]?.trim() ?? '',
    };
  } catch (error) {
    debugLogger.log(`Error parsing skill file ${filePath}:`, error);
    return null;
  }
}
