/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { IntrospectionAgent } from './introspection-agent.js';
import { GetInternalDocsTool } from '../tools/get-internal-docs.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import type { LocalAgentDefinition } from './types.js';

describe('IntrospectionAgent', () => {
  const localAgent = IntrospectionAgent as LocalAgentDefinition;

  it('should have the correct agent definition metadata', () => {
    expect(localAgent.name).toBe('introspection_agent');
    expect(localAgent.kind).toBe('local');
    expect(localAgent.displayName).toBe('Introspection Agent');
    expect(localAgent.description).toContain('Gemini CLI');
  });

  it('should have correctly configured inputs and outputs', () => {
    expect(localAgent.inputConfig.inputs['question']).toBeDefined();
    expect(localAgent.inputConfig.inputs['question'].required).toBe(true);

    expect(localAgent.outputConfig?.outputName).toBe('report');
    expect(localAgent.outputConfig?.description).toBeDefined();
  });

  it('should use the correct model and tools', () => {
    expect(localAgent.modelConfig?.model).toBe(GEMINI_MODEL_ALIAS_FLASH);

    const tools = localAgent.toolConfig?.tools || [];
    const hasInternalDocsTool = tools.some(
      (t) => t instanceof GetInternalDocsTool,
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
