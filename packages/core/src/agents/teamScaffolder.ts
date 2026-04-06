/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dump } from 'js-yaml';
import { getErrorMessage } from '../utils/errors.js';
import { type RegistryTeam } from './types.js';
import {
  cloneFromGit,
  downloadFromGitHubRelease,
  tryParseGithubUrl,
} from '../utils/github.js';

export interface ScaffoldTeamAgent {
  name: string;
  kind: 'local' | 'external';
  provider?: string;
  description?: string;
  sourcePath?: string;
}

export interface ScaffoldTeamOptions {
  name: string;
  displayName: string;
  description: string;
  instructions: string;
  agents: ScaffoldTeamAgent[];
  targetDir: string;
}

/**
 * Scaffolds a new Agent Team directory and its associated files.
 *
 * @param options Configuration for the team to be created.
 * @returns The absolute path to the created team directory.
 */
export async function scaffoldTeam(
  options: ScaffoldTeamOptions,
): Promise<string> {
  const teamSlug = options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const teamDirPath = path.resolve(options.targetDir, teamSlug);
  const agentsDirPath = path.join(teamDirPath, 'agents');

  try {
    // 1. Create team directory
    await fs.mkdir(teamDirPath, { recursive: true });

    // 2. Clear agents directory if it exists to ensure a fresh start
    try {
      await fs.rm(agentsDirPath, { recursive: true, force: true });
    } catch (_e) {
      // Ignore if it doesn't exist
    }

    // 3. Generate TEAM.md content (no inline agents anymore)
    const frontmatter = {
      name: teamSlug,
      display_name: options.displayName,
      description: options.description,
    };

    const teamMdContent = `---
${dump(frontmatter).trim()}
---

${options.instructions.trim()}
`;

    await fs.writeFile(
      path.join(teamDirPath, 'TEAM.md'),
      teamMdContent,
      'utf-8',
    );

    // 4. Create agents/ sub-directory if there are any agents selected
    if (options.agents.length > 0) {
      await fs.mkdir(agentsDirPath, { recursive: true });

      for (const agent of options.agents) {
        const destPath = path.join(agentsDirPath, `${agent.name}.md`);

        if (agent.kind === 'external') {
          // Generate a new .md file for external agents
          const agentFrontmatter = {
            kind: 'external',
            name: agent.name,
            provider: agent.provider,
            description: agent.description || `Expert ${agent.name} agent.`,
          };
          const agentContent = `---
${dump(agentFrontmatter).trim()}
---
`;
          await fs.writeFile(destPath, agentContent, 'utf-8');
        } else if (agent.kind === 'local' && agent.sourcePath) {
          // Copy existing local agent file
          // Use a name-based filename to avoid collisions and keep it clean
          await fs.copyFile(agent.sourcePath, destPath);
        }
      }
    }

    return teamDirPath;
  } catch (error) {
    throw new Error(
      `Failed to scaffold team "${options.name}": ${getErrorMessage(error)}`,
    );
  }
}

/**
 * Installs an Agent Team from a registry entry.
 * Supports both source-based (Git/GitHub) and definition-only (metadata) teams.
 *
 * @param team The registry entry for the team.
 * @param targetDir The root directory where teams are stored (e.g. .gemini/teams/).
 * @returns The absolute path to the installed team directory.
 */
export async function installRegistryTeam(
  team: RegistryTeam,
  targetDir: string,
): Promise<string> {
  const teamSlug = team.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const teamDirPath = path.resolve(targetDir, teamSlug);

  try {
    // 1. Handle source-based installation if sourceUrl is provided
    if (team.sourceUrl) {
      await fs.mkdir(teamDirPath, { recursive: true });

      const githubInfo = tryParseGithubUrl(team.sourceUrl);
      if (githubInfo) {
        // Try GitHub release download first, fallback to Git clone
        const result = await downloadFromGitHubRelease(
          {
            source: team.sourceUrl,
            type: 'github-release',
          },
          teamDirPath,
          githubInfo,
          'TEAM.md',
        );

        if (!result.success) {
          await cloneFromGit(
            {
              source: team.sourceUrl,
              type: 'git',
            },
            teamDirPath,
          );
        }
      } else {
        // Not a GitHub URL, use standard Git clone
        await cloneFromGit(
          {
            source: team.sourceUrl,
            type: 'git',
          },
          teamDirPath,
        );
      }
    } else {
      // 2. Handle definition-only installation (scaffold from metadata)
      const scaffoldOptions: ScaffoldTeamOptions = {
        name: team.name,
        displayName: team.displayName,
        description: team.description,
        instructions: team.instructions,
        agents: team.agents.map((agent) => ({
          name: agent.name,
          kind: 'external' as const,
          provider: agent.provider,
          description: agent.description,
        })),
        targetDir: targetDir,
      };

      await scaffoldTeam(scaffoldOptions);
    }

    return teamDirPath;
  } catch (error) {
    throw new Error(
      `Failed to install team "${team.displayName}": ${getErrorMessage(error)}`,
    );
  }
}
