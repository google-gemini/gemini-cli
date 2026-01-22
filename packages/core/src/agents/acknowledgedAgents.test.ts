/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcknowledgedAgentsService } from './acknowledgedAgents.js';
import * as fs from 'node:fs';
import { Storage } from '../config/storage.js';

vi.mock('node:fs');
vi.mock('../config/storage.js');

describe('AcknowledgedAgentsService', () => {
  const MOCK_PATH = '/mock/path/acknowledged_agents.json';

  beforeEach(() => {
    vi.resetAllMocks();
    AcknowledgedAgentsService.resetInstanceForTesting();
    vi.mocked(Storage.getAcknowledgedAgentsPath).mockReturnValue(MOCK_PATH);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should acknowledge an agent and save to disk', () => {
    const service = AcknowledgedAgentsService.getInstance();

    // Mock mkdir to succeed
    vi.mocked(fs.existsSync).mockReturnValue(false); // Dir doesn't exist initially
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    service.acknowledge('/project', 'AgentA', 'hash1');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      MOCK_PATH,
      expect.stringContaining('"AgentA": "hash1"'),
      'utf-8',
    );
  });

  it('should return true for acknowledged agent', () => {
    const service = AcknowledgedAgentsService.getInstance();

    // Pre-load logic (simulated by mocking readFileSync if needed, or just setting state via acknowledge)
    // Here we just use acknowledge first
    vi.mocked(fs.existsSync).mockReturnValue(false);
    service.acknowledge('/project', 'AgentA', 'hash1');

    expect(service.isAcknowledged('/project', 'AgentA', 'hash1')).toBe(true);
    expect(service.isAcknowledged('/project', 'AgentA', 'hash2')).toBe(false);
    expect(service.isAcknowledged('/project', 'AgentB', 'hash1')).toBe(false);
  });

  it('should load acknowledged agents from disk', () => {
    const data = {
      '/project': {
        AgentLoaded: 'hashLoaded',
      },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));

    const service = AcknowledgedAgentsService.getInstance();

    expect(
      service.isAcknowledged('/project', 'AgentLoaded', 'hashLoaded'),
    ).toBe(true);
  });

  it('should handle load errors gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const service = AcknowledgedAgentsService.getInstance();

    // Should not throw, and treated as empty
    expect(service.isAcknowledged('/project', 'Agent', 'hash')).toBe(false);
  });
});
