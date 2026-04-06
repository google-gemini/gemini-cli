/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  scaffoldTeam,
  installRegistryTeam,
  type ScaffoldTeamOptions,
} from './teamScaffolder.js';
import { type RegistryTeam } from './types.js';

vi.mock('../utils/github.js', () => ({
  cloneFromGit: vi.fn(),
  downloadFromGitHubRelease: vi.fn(),
  tryParseGithubUrl: vi.fn(),
}));

import {
  cloneFromGit,
  downloadFromGitHubRelease,
  tryParseGithubUrl,
} from '../utils/github.js';

describe('teamScaffolder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-team-scaffolder-test-'),
    );
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should scaffold a team with inline external agents', async () => {
    const options: ScaffoldTeamOptions = {
      name: 'Test Team',
      displayName: 'The Test Team',
      description: 'A team for testing.',
      instructions: 'Do some testing.',
      agents: [
        {
          kind: 'external',
          name: 'claude-coder',
          provider: 'claude-code',
          description: 'Expert Claude coder.',
        },
      ],
      targetDir: tempDir,
    };

    const teamPath = await scaffoldTeam(options);
    expect(teamPath).toBe(path.join(tempDir, 'test-team'));

    const teamMdPath = path.join(teamPath, 'TEAM.md');
    const content = await fs.readFile(teamMdPath, 'utf-8');

    expect(content).toContain('name: test-team');
    expect(content).toContain('display_name: The Test Team');
    expect(content).toContain('description: A team for testing.');
    expect(content).toContain('Do some testing.');

    const agentPath = path.join(teamPath, 'agents', 'claude-coder.md');
    const agentContent = await fs.readFile(agentPath, 'utf-8');
    expect(agentContent).toContain('name: claude-coder');
    expect(agentContent).toContain('provider: claude-code');
  });

  it('should scaffold a team with standalone local agents', async () => {
    // Create a dummy local agent file
    const localAgentPath = path.join(tempDir, 'dummy-agent.md');
    await fs.writeFile(
      localAgentPath,
      '---\nname: dummy\n---\nPrompt',
      'utf-8',
    );

    const options: ScaffoldTeamOptions = {
      name: 'Local Team',
      displayName: 'The Local Team',
      description: 'A team with local agents.',
      instructions: 'Use local agents.',
      agents: [
        {
          kind: 'local',
          name: 'dummy',
          sourcePath: localAgentPath,
        },
      ],
      targetDir: tempDir,
    };

    // Use a subfolder for teams to avoid collision with dummy-agent.md
    const teamsDir = path.join(tempDir, 'teams');
    options.targetDir = teamsDir;

    const teamPath = await scaffoldTeam(options);
    const agentsDir = path.join(teamPath, 'agents');
    const copiedAgentPath = path.join(agentsDir, 'dummy.md');

    expect(
      await fs
        .access(copiedAgentPath)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);
    const copiedContent = await fs.readFile(copiedAgentPath, 'utf-8');
    expect(copiedContent).toContain('name: dummy');
  });

  describe('installRegistryTeam', () => {
    it('should install a definition-only team from registry', async () => {
      const team: RegistryTeam = {
        id: 'team-1',
        name: 'registry-team',
        displayName: 'Registry Team',
        description: 'A team from the registry.',
        instructions: 'Follow these instructions.',
        agents: [
          {
            name: 'agent-1',
            provider: 'gemini',
            description: 'First agent.',
          },
        ],
      };

      const teamPath = await installRegistryTeam(team, tempDir);
      expect(teamPath).toBe(path.join(tempDir, 'registry-team'));

      const teamMdPath = path.join(teamPath, 'TEAM.md');
      const content = await fs.readFile(teamMdPath, 'utf-8');
      expect(content).toContain('display_name: Registry Team');
      expect(content).toContain('Follow these instructions.');

      const agentPath = path.join(teamPath, 'agents', 'agent-1.md');
      const agentContent = await fs.readFile(agentPath, 'utf-8');
      expect(agentContent).toContain('name: agent-1');
      expect(agentContent).toContain('provider: gemini');
    });

    it('should install a Git-based team using cloneFromGit', async () => {
      const team: RegistryTeam = {
        id: 'team-git',
        name: 'git-team',
        displayName: 'Git Team',
        description: 'A team from git.',
        instructions: 'Use git.',
        agents: [],
        sourceUrl: 'https://github.com/user/git-team.git',
      };

      vi.mocked(tryParseGithubUrl).mockReturnValue({
        owner: 'user',
        repo: 'git-team',
      });
      vi.mocked(downloadFromGitHubRelease).mockResolvedValue({
        success: false,
        failureReason: 'no release data',
        errorMessage: 'Fail',
        type: 'github-release',
      });
      vi.mocked(cloneFromGit).mockResolvedValue();

      const teamPath = await installRegistryTeam(team, tempDir);
      expect(teamPath).toBe(path.join(tempDir, 'git-team'));
      expect(cloneFromGit).toHaveBeenCalled();
    });

    it('should install a GitHub-based team using downloadFromGitHubRelease', async () => {
      const team: RegistryTeam = {
        id: 'team-gh',
        name: 'gh-team',
        displayName: 'GitHub Team',
        description: 'A team from GitHub.',
        instructions: 'Use GitHub.',
        agents: [],
        sourceUrl: 'https://github.com/user/gh-team',
      };

      vi.mocked(tryParseGithubUrl).mockReturnValue({
        owner: 'user',
        repo: 'gh-team',
      });
      vi.mocked(downloadFromGitHubRelease).mockResolvedValue({
        success: true,
        type: 'github-release',
      });

      const teamPath = await installRegistryTeam(team, tempDir);
      expect(teamPath).toBe(path.join(tempDir, 'gh-team'));
      expect(downloadFromGitHubRelease).toHaveBeenCalled();
      expect(cloneFromGit).not.toHaveBeenCalled();
    });
  });
});
