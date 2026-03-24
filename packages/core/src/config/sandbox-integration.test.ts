/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Config } from './config.js';
import { NoopSandboxManager } from '../services/sandboxManager.js';

// Minimal mocks for Config dependencies to allow instantiation
vi.mock('../core/client.js');
vi.mock('../core/contentGenerator.js');
vi.mock('../telemetry/index.js');
vi.mock('../core/tokenLimits.js');
vi.mock('../services/fileDiscoveryService.js');
vi.mock('../services/gitService.js');
vi.mock('../services/trackerService.js');
vi.mock('../confirmation-bus/message-bus.js', () => ({
  MessageBus: vi.fn(),
}));
vi.mock('../policy/policy-engine.js', () => ({
  PolicyEngine: vi.fn().mockImplementation(() => ({
    getExcludedTools: vi.fn().mockReturnValue(new Set()),
    getApprovalMode: vi.fn().mockReturnValue('yolo'),
  })),
}));
vi.mock('../skills/skillManager.js', () => ({
  SkillManager: vi.fn().mockImplementation(() => ({
    setAdminSettings: vi.fn(),
  })),
}));
vi.mock('../agents/registry.js', () => ({
  AgentRegistry: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}));
vi.mock('../agents/acknowledgedAgents.js', () => ({
  AcknowledgedAgentsService: vi.fn(),
}));
vi.mock('../services/modelConfigService.js', () => ({
  ModelConfigService: vi.fn(),
}));
vi.mock('./models.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./models.js')>();
  return {
    ...actual,
    isPreviewModel: vi.fn().mockReturnValue(false),
    resolveModel: vi.fn().mockReturnValue('test-model'),
  };
});

describe('Sandbox Integration', () => {
  it('should have a NoopSandboxManager by default in Config', () => {
    const config = new Config({
      sessionId: 'test-session',
      targetDir: '.',
      model: 'test-model',
      cwd: '.',
      debugMode: false,
    });

    expect(config.sandboxManager).toBeDefined();
    expect(config.sandboxManager).toBeInstanceOf(NoopSandboxManager);
  });
});
