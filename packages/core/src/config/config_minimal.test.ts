/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Config, type ConfigParameters } from './config.js';
import { AuthType } from '../core/contentGenerator.js';
import { getExperiments } from '../code_assist/experiments/experiments.js';
import { fetchAdminControls } from '../code_assist/admin/admin_controls.js';
import { createContentGeneratorConfig } from '../core/contentGenerator.js';
import { CodeAssistServer } from '../code_assist/server.js';
import { setupUser, type UserData } from '../code_assist/setup.js';
import { UserTierId } from '../code_assist/types.js';
import * as fs from 'node:fs/promises';

vi.mock('../code_assist/experiments/experiments.js');
vi.mock('../code_assist/admin/admin_controls.js');
vi.mock('../core/contentGenerator.js');
vi.mock('node:fs/promises');
vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    stripThoughtsFromHistory: vi.fn(),
    updateSystemInstruction: vi.fn(),
    setTools: vi.fn(),
  })),
}));

const TARGET_DIR = process.cwd();
const SESSION_ID = 'test-session';

const baseParams: ConfigParameters = {
  sessionId: SESSION_ID,
  targetDir: TARGET_DIR,
  cwd: TARGET_DIR,
  debugMode: false,
  model: 'test-model',
};

describe('Config Minimal Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty memory in getSystemInstructionMemory if minimalPayload is true', () => {
    const config = new Config({ ...baseParams, minimalPayload: true, userMemory: 'some memory' });
    expect(config.getSystemInstructionMemory()).toBe('');
  });

  it('should return empty memory in getSessionMemory if minimalPayload is true', () => {
    const config = new Config({ ...baseParams, minimalPayload: true });
    expect(config.getSessionMemory()).toBe('');
  });

  it('should skip quota and experiments in refreshAuth if skipPreflightRequests is true', async () => {
    const config = new Config({ ...baseParams, skipPreflightRequests: true });
    
    vi.mocked(createContentGeneratorConfig).mockResolvedValue({
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    vi.spyOn(config as any, 'refreshUserQuota').mockResolvedValue({} as any);

    await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);

    expect(getExperiments).not.toHaveBeenCalled();
    expect(fetchAdminControls).not.toHaveBeenCalled();
  });

  it('CodeAssistServer should skip non-essential requests if skipPreflightRequests is true', async () => {
    const config = new Config({ ...baseParams, skipPreflightRequests: true });
    const mockAuthClient = { request: vi.fn() } as any;
    const server = new CodeAssistServer(mockAuthClient, 'test-project', {}, '', undefined, undefined, undefined, config);

    await server.loadCodeAssist({ metadata: {} });
    expect(mockAuthClient.request).not.toHaveBeenCalled();

    await server.listExperiments({} as any);
    expect(mockAuthClient.request).not.toHaveBeenCalled();

    await server.retrieveUserQuota({ project: 'test' });
    expect(mockAuthClient.request).not.toHaveBeenCalled();
  });

  it('setupUser should use cached UserData in Fast Mode', async () => {
    const config = new Config({ ...baseParams, skipPreflightRequests: true });
    const mockAuthClient = {} as any;

    const mockUserData: UserData = {
      projectId: 'cached-project',
      userTier: UserTierId.STANDARD,
      userTierName: 'Standard',
      hasOnboardedPreviously: true,
    };
    
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockUserData));

    const userData = await setupUser(mockAuthClient, config);
    expect(userData.projectId).toBe('cached-project');
  });
});
