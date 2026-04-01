/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Config } from './config.js';
import { Storage } from './storage.js';

describe('Config Team Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-team-test-'));
    // Setup .gemini/teams structure
    const teamsDir = path.join(tempDir, '.gemini', 'teams', 'test-team');
    await fs.mkdir(teamsDir, { recursive: true });
    await fs.writeFile(
      path.join(teamsDir, 'TEAM.md'),
      `---
name: test-team
display_name: Test Team
description: A test team
---
Instructions`,
    );
    const agentsDir = path.join(teamsDir, 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(
      path.join(agentsDir, 'team-agent.md'),
      `---
name: team-agent
description: Team agent
---
Prompt`,
    );

    // Mock global teams dir to be empty for isolation
    const globalTeamsDir = path.join(tempDir, 'global-teams');
    await fs.mkdir(globalTeamsDir, { recursive: true });
    vi.spyOn(Storage, 'getUserTeamsDir').mockReturnValue(globalTeamsDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should discover and load teams during initialization', async () => {
    const config = new Config({
      sessionId: 'test-session',
      targetDir: tempDir,
      debugMode: false,
      model: 'gemini-1.5-flash',
      cwd: tempDir,
    });

    await config.initialize();

    const teamRegistry = config.getTeamRegistry();
    const teams = teamRegistry.getAllTeams();
    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe('test-team');

    const agentRegistry = config.getAgentRegistry();
    const agent = agentRegistry.getDiscoveredDefinition('team-agent');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('team-agent');
  });

  it('should delegate active team management', async () => {
    const config = new Config({
      sessionId: 'test-session',
      targetDir: tempDir,
      debugMode: false,
      model: 'gemini-1.5-flash',
      cwd: tempDir,
    });

    await config.initialize();

    expect(config.getActiveTeam()).toBeUndefined();

    config.setActiveTeam('test-team');
    expect(config.getActiveTeam()?.name).toBe('test-team');
  });
});
