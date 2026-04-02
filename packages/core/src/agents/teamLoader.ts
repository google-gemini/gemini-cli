/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { load } from 'js-yaml';
import * as fs from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { type TeamDefinition } from './types.js';
import {
  AgentLoadError,
  loadAgentsFromDirectory,
  externalAgentSchema,
  markdownToAgentDefinition,
} from './agentLoader.js';
import { FRONTMATTER_REGEX } from '../skills/skillLoader.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Result of loading teams from a directory.
 */
export interface TeamLoadResult {
  teams: TeamDefinition[];
  errors: AgentLoadError[];
}

const nameSchema = z
  .string()
  .regex(/^[a-z0-9-_]+$/, 'Name must be a valid slug');

const teamSchema = z
  .object({
    name: nameSchema,
    display_name: z.string().min(1),
    description: z.string().min(1),
    agents: z.array(externalAgentSchema).optional(),
  })
  .strict();

/**
 * Loads all teams from a specific directory.
 * Each subdirectory is treated as a potential team.
 *
 * @param dir Directory path to scan (e.g., .gemini/teams/).
 * @returns Object containing successfully loaded teams and any errors.
 */
export async function loadTeamsFromDirectory(
  dir: string,
): Promise<TeamLoadResult> {
  const result: TeamLoadResult = {
    teams: [],
    errors: [],
  };

  let dirEntries: Dirent[];
  try {
    dirEntries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    // If directory doesn't exist, just return empty
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return result;
    }
    result.errors.push(
      new AgentLoadError(
        dir,
        `Could not list directory: ${getErrorMessage(error)}`,
      ),
    );
    return result;
  }

  const teamDirs = dirEntries.filter((entry) => entry.isDirectory());

  for (const entry of teamDirs) {
    const teamPath = path.join(dir, entry.name);
    const teamMdPath = path.join(teamPath, 'TEAM.md');
    const agentsDirPath = path.join(teamPath, 'agents');

    try {
      // Check if TEAM.md exists
      try {
        await fs.access(teamMdPath);
      } catch {
        // Not a team directory (missing TEAM.md), just skip it
        continue;
      }

      const teamMdContent = await fs.readFile(teamMdPath, 'utf-8');
      const hash = crypto
        .createHash('sha256')
        .update(teamMdContent)
        .digest('hex');

      // Parse TEAM.md
      const match = teamMdContent.match(FRONTMATTER_REGEX);
      if (!match) {
        throw new AgentLoadError(
          teamMdPath,
          'Invalid team definition: Missing mandatory YAML frontmatter.',
        );
      }

      const frontmatterStr = match[1];
      const instructions = (match[2] || '').trim();

      let rawFrontmatter: unknown;
      try {
        rawFrontmatter = load(frontmatterStr);
      } catch (error) {
        throw new AgentLoadError(
          teamMdPath,
          `YAML frontmatter parsing failed: ${getErrorMessage(error)}`,
        );
      }

      const parsedFrontmatter = teamSchema.safeParse(rawFrontmatter);
      if (!parsedFrontmatter.success) {
        throw new AgentLoadError(
          teamMdPath,
          `Validation failed:\n${parsedFrontmatter.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('\n')}`,
        );
      }

      const {
        name,
        display_name,
        description,
        agents: inlineAgentsRaw,
      } = parsedFrontmatter.data;

      // Load agents from agents/ subfolder
      const agentsResult = await loadAgentsFromDirectory(agentsDirPath);
      result.errors.push(...agentsResult.errors);

      const allAgents = [...agentsResult.agents];

      // Add inline agents
      if (inlineAgentsRaw) {
        for (const inline of inlineAgentsRaw) {
          try {
            const agent = markdownToAgentDefinition(inline, {
              hash,
              filePath: teamMdPath,
            });
            allAgents.push(agent);
          } catch (error) {
            result.errors.push(
              new AgentLoadError(
                teamMdPath,
                `Error loading inline agent "${inline.name}": ${getErrorMessage(error)}`,
              ),
            );
          }
        }
      }

      result.teams.push({
        name,
        displayName: display_name,
        description,
        instructions,
        agents: allAgents,
        metadata: {
          hash,
          filePath: teamMdPath,
        },
      });
    } catch (error) {
      if (error instanceof AgentLoadError) {
        result.errors.push(error);
      } else {
        result.errors.push(
          new AgentLoadError(
            teamMdPath,
            `Unexpected error: ${getErrorMessage(error)}`,
          ),
        );
      }
    }
  }

  return result;
}
