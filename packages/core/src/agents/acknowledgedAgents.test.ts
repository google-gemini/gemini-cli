/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AcknowledgedAgentsService } from './acknowledgedAgents.js';
import { Storage } from '../config/storage.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('AcknowledgedAgentsService', () => {
  let tempDir: string;
  let originalGeminiCliHome: string | undefined;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));

    // Override GEMINI_CLI_HOME to point to the temp directory
    originalGeminiCliHome = process.env['GEMINI_CLI_HOME'];
    process.env['GEMINI_CLI_HOME'] = tempDir;
  });

  afterEach(async () => {
    // Restore environment variable
    if (originalGeminiCliHome) {
      process.env['GEMINI_CLI_HOME'] = originalGeminiCliHome;
    } else {
      delete process.env['GEMINI_CLI_HOME'];
    }

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should acknowledge an agent and save to disk', async () => {
    const service = new AcknowledgedAgentsService();
    const ackPath = Storage.getAcknowledgedAgentsPath();

    await service.acknowledge('/project', 'AgentA', 'hash1');

    // Verify file exists and content
    const content = await fs.readFile(ackPath, 'utf-8');
    expect(content).toContain('"AgentA": "hash1"');
  });

  it('should return true for acknowledged agent', async () => {
    const service = new AcknowledgedAgentsService();

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
    const ackPath = Storage.getAcknowledgedAgentsPath();
    const data = {
      '/project': {
        AgentLoaded: 'hashLoaded',
      },
    };

    // Ensure directory exists
    await fs.mkdir(path.dirname(ackPath), { recursive: true });
    await fs.writeFile(ackPath, JSON.stringify(data), 'utf-8');

    const service = new AcknowledgedAgentsService();

    expect(
      await service.isAcknowledged('/project', 'AgentLoaded', 'hashLoaded'),
    ).toBe(true);
  });

  it('should handle load errors gracefully', async () => {
    // Create a directory where the file should be to cause a read error (EISDIR)
    const ackPath = Storage.getAcknowledgedAgentsPath();
    await fs.mkdir(ackPath, { recursive: true });

    const service = new AcknowledgedAgentsService();

    // Should not throw, and treated as empty
    expect(await service.isAcknowledged('/project', 'Agent', 'hash')).toBe(
      false,
    );
  });
});
