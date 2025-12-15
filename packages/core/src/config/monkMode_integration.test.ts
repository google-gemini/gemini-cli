/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Config } from './config.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';

// We only mock dependencies that are external or heavy,
// but we want to use the REAL ToolRegistry.
// So we do NOT mock '../tools/tool-registry'.

vi.mock('../telemetry/index.js', () => ({
  initializeTelemetry: vi.fn(),
  DEFAULT_TELEMETRY_TARGET: 'mock-target',
  DEFAULT_OTLP_ENDPOINT: 'mock-endpoint',
  uiTelemetryService: {
    getLastPromptTokenCount: vi.fn(() => 0),
  },
}));

vi.mock('../services/gitService.js');
vi.mock('../core/client.js'); // GeminiClient
vi.mock('../core/contentGenerator.js'); // ContentGenerator

describe('Monk Mode Integration', () => {
  it('should only have SHELL_TOOL_NAME in tool registry when monkMode is true', async () => {
    const params = {
      cwd: '/tmp',
      targetDir: '/tmp',
      debugMode: false,
      sessionId: 'test-session-id',
      model: 'gemini-pro',
      monkMode: true,
      enableAgents: true, // Try to trigger delegate tool
    };

    const config = new Config(params);
    await config.initialize();

    const toolRegistry = config.getToolRegistry();
    const declarations = toolRegistry.getFunctionDeclarations();

    // Check names
    const names = declarations.map((d) => d.name);
    console.log('Registered tools in Monk Mode:', names);

    expect(names).toContain(SHELL_TOOL_NAME);
    expect(names.length).toBe(1);
  });
});
