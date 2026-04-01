/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadTeamsFromDirectory } from './teamLoader.js';

describe('teamLoader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'team-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  async function createTeamStructure(
    teamName: string,
    teamMdContent: string,
    agents: Record<string, string> = {},
  ) {
    const teamPath = path.join(tempDir, teamName);
    await fs.mkdir(teamPath, { recursive: true });
    await fs.writeFile(path.join(teamPath, 'TEAM.md'), teamMdContent);

    if (Object.keys(agents).length > 0) {
      const agentsPath = path.join(teamPath, 'agents');
      await fs.mkdir(agentsPath, { recursive: true });
      for (const [name, content] of Object.entries(agents)) {
        await fs.writeFile(path.join(agentsPath, `${name}.md`), content);
      }
    }
    return teamPath;
  }

  it('should load a valid team with agents', async () => {
    await createTeamStructure(
      'my-team',
      `---
name: my-team
display_name: My Team
description: A great team
---
Team instructions here.`,
      {
        'agent-1': `---
name: agent-1
description: Agent 1
---
Agent 1 prompt`,
      },
    );

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const team = result.teams[0];
    expect(team.name).toBe('my-team');
    expect(team.displayName).toBe('My Team');
    expect(team.description).toBe('A great team');
    expect(team.instructions).toBe('Team instructions here.');
    expect(team.agents).toHaveLength(1);
    expect(team.agents[0].name).toBe('agent-1');
    expect(team.metadata?.filePath).toContain('my-team/TEAM.md');
  });

  it('should skip directories without TEAM.md', async () => {
    await fs.mkdir(path.join(tempDir, 'not-a-team'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'not-a-team', 'README.md'), 'test');

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle multiple teams', async () => {
    await createTeamStructure(
      'team-1',
      `---
name: team-1
display_name: Team One
description: First team
---
Instructions 1`,
    );
    await createTeamStructure(
      'team-2',
      `---
name: team-2
display_name: Team Two
description: Second team
---
Instructions 2`,
    );

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(2);
    const names = result.teams.map((t) => t.name).sort();
    expect(names).toEqual(['team-1', 'team-2']);
  });

  it('should capture errors for malformed TEAM.md', async () => {
    const teamPath = path.join(tempDir, 'bad-team');
    await fs.mkdir(teamPath, { recursive: true });
    await fs.writeFile(path.join(teamPath, 'TEAM.md'), 'invalid content');

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain(
      'Missing mandatory YAML frontmatter',
    );
  });

  it('should capture validation errors for TEAM.md', async () => {
    await createTeamStructure(
      'invalid-team',
      `---
name: invalid-team
# missing display_name and description
---
Instructions`,
    );

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Validation failed');
  });

  it('should load team even if agents subfolder is missing', async () => {
    await createTeamStructure(
      'no-agents-team',
      `---
name: no-agents-team
display_name: No Agents
description: No agents here
---
Instructions`,
    );

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].agents).toHaveLength(0);
  });

  it('should capture errors from agents subfolder', async () => {
    await createTeamStructure(
      'bad-agents-team',
      `---
name: bad-agents-team
display_name: Bad Agents
description: Team with bad agents
---
Instructions`,
      {
        'bad-agent': 'invalid agent content',
      },
    );

    const result = await loadTeamsFromDirectory(tempDir);
    expect(result.teams).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].filePath).toContain('agents/bad-agent.md');
  });

  it('should return empty result if directory does not exist', async () => {
    const nonExistentDir = path.join(tempDir, 'void');
    const result = await loadTeamsFromDirectory(nonExistentDir);
    expect(result.teams).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
