/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CliHelpAgent } from './cli-help-agent.js';
import { GET_INTERNAL_DOCS_TOOL_NAME } from '../tools/tool-names.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import type { LocalAgentDefinition } from './types.js';
import type { Config } from '../config/config.js';

describe('CliHelpAgent', () => {
  const fakeConfig = {
    getMessageBus: () => ({}),
    isAgentsEnabled: () => false,
  } as unknown as Config;
  const localAgent = CliHelpAgent(fakeConfig) as LocalAgentDefinition;

  it('should have the correct agent definition metadata', () => {
    expect(localAgent.name).toBe('cli_help');
    expect(localAgent.kind).toBe('local');
    expect(localAgent.displayName).toBe('CLI Help Agent');
    expect(localAgent.description).toContain('Gemini CLI');
  });

  it('should have correctly configured inputs and outputs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputSchema = localAgent.inputConfig.inputSchema as any;
    expect(inputSchema.properties['question']).toBeDefined();
    expect(inputSchema.required).toContain('question');

    expect(localAgent.outputConfig?.outputName).toBe('report');
    expect(localAgent.outputConfig?.description).toBeDefined();
  });

  it('should use the correct model and tools', () => {
    expect(localAgent.modelConfig?.model).toBe(GEMINI_MODEL_ALIAS_FLASH);

    const tools = localAgent.toolConfig?.tools || [];
    const hasInternalDocsTool = tools.some(
      (t) => typeof t !== 'string' && t.name === GET_INTERNAL_DOCS_TOOL_NAME,
    );
    expect(hasInternalDocsTool).toBe(true);
  });

  it('should have expected prompt placeholders', () => {
    const systemPrompt = localAgent.promptConfig.systemPrompt || '';
    expect(systemPrompt).toContain('${cliVersion}');
    expect(systemPrompt).toContain('${activeModel}');
    expect(systemPrompt).toContain('${today}');

    const query = localAgent.promptConfig.query || '';
    expect(query).toContain('${question}');
  });

  it('should process output to a formatted JSON string', () => {
    const mockOutput = {
      answer: 'This is the answer.',
      sources: ['file1.md', 'file2.md'],
    };
    const processed = localAgent.processOutput?.(mockOutput);
    expect(processed).toBe(JSON.stringify(mockOutput, null, 2));
  });
});
