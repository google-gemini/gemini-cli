/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcknowledgedAgentsService } from './acknowledgedAgents.js';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Storage } from '../config/storage.js';

vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));
vi.mock('../config/storage.js');

describe('AcknowledgedAgentsService', () => {
  const MOCK_PATH = '/mock/path/acknowledged_agents.json';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Storage.getAcknowledgedAgentsPath).mockReturnValue(MOCK_PATH);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should acknowledge an agent and save to disk', async () => {
    const service = new AcknowledgedAgentsService();

    // Mock mkdir to succeed
    vi.mocked(existsSync).mockReturnValue(false); // Dir doesn't exist initially
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await service.acknowledge('/project', 'AgentA', 'hash1');

    expect(fs.writeFile).toHaveBeenCalledWith(
      MOCK_PATH,
      expect.stringContaining('"AgentA": "hash1"'),
      'utf-8',
    );
  });

  it('should return true for acknowledged agent', async () => {
    const service = new AcknowledgedAgentsService();

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await service.acknowledge('/project', 'AgentA', 'hash1');

    expect(await service.isAcknowledged('/project', 'AgentA', 'hash1')).toBe(
      true,
    );
    expect(await service.isAcknowledged('/project', 'AgentA', 'hash2')).toBe(
      false,
    );
    expect(await service.isAcknowledged('/project', 'AgentB', 'hash1')).toBe(
      false,
    );
  });

  it('should load acknowledged agents from disk', async () => {
    const data = {
      '/project': {
        AgentLoaded: 'hashLoaded',
      },
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(data));

    const service = new AcknowledgedAgentsService();

    expect(
      await service.isAcknowledged('/project', 'AgentLoaded', 'hashLoaded'),
    ).toBe(true);
  });

  it('should handle load errors gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

    const service = new AcknowledgedAgentsService();

    // Should not throw, and treated as empty
    expect(await service.isAcknowledged('/project', 'Agent', 'hash')).toBe(
      false,
    );
  });
});
