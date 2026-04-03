/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { scaffoldTeam, type ScaffoldTeamOptions } from './teamScaffolder.js';

describe('teamScaffolder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-team-scaffolder-test-'),
    );
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
    expect(content).toContain('provider: claude-code');
    expect(content).toContain('Do some testing.');
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
    const copiedAgentPath = path.join(agentsDir, 'dummy-agent.md');

    expect(
      await fs
        .access(copiedAgentPath)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);
    const copiedContent = await fs.readFile(copiedAgentPath, 'utf-8');
    expect(copiedContent).toContain('name: dummy');
  });
});
