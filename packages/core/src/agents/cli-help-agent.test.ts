/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CliHelpAgent } from './cli-help-agent.js';
import { GET_INTERNAL_DOCS_TOOL_NAME } from '../tools/tool-names.js';
import { GET_CLI_REFERENCE_TOOL_NAME } from '../tools/tool-names.js';
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

  it('should mention flags, shortcuts, and slash commands in its description', () => {
    expect(localAgent.description).toContain('flags');
    expect(localAgent.description).toContain('keyboard shortcuts');
    expect(localAgent.description).toContain('slash commands');
  });

  it('should have correctly configured inputs and outputs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputSchema = localAgent.inputConfig.inputSchema as any;
    expect(inputSchema.properties['question']).toBeDefined();
    expect(inputSchema.required).toContain('question');

    expect(localAgent.outputConfig?.outputName).toBe('report');
    expect(localAgent.outputConfig?.description).toBeDefined();
  });

  it('should use the correct model and include both tools', () => {
    expect(localAgent.modelConfig?.model).toBe(GEMINI_MODEL_ALIAS_FLASH);

    const tools = localAgent.toolConfig?.tools || [];

    const hasInternalDocsTool = tools.some(
      (t) => typeof t !== 'string' && t.name === GET_INTERNAL_DOCS_TOOL_NAME,
    );
    expect(hasInternalDocsTool).toBe(true);

    const hasCliReferenceTool = tools.some(
      (t) => typeof t !== 'string' && t.name === GET_CLI_REFERENCE_TOOL_NAME,
    );
    expect(hasCliReferenceTool).toBe(true);
  });

  it('should list get_cli_reference before get_internal_docs in tools array', () => {
    const tools = localAgent.toolConfig?.tools || [];
    const refIndex = tools.findIndex(
      (t) => typeof t !== 'string' && t.name === GET_CLI_REFERENCE_TOOL_NAME,
    );
    const docsIndex = tools.findIndex(
      (t) => typeof t !== 'string' && t.name === GET_INTERNAL_DOCS_TOOL_NAME,
    );
    expect(refIndex).toBeLessThan(docsIndex);
  });

  it('should have expected prompt placeholders', () => {
    const systemPrompt = localAgent.promptConfig.systemPrompt || '';
    expect(systemPrompt).toContain('${cliVersion}');
    expect(systemPrompt).toContain('${activeModel}');
    expect(systemPrompt).toContain('${today}');

    const query = localAgent.promptConfig.query || '';
    expect(query).toContain('${question}');
  });

  it('should instruct the agent to use get_cli_reference first', () => {
    const systemPrompt = localAgent.promptConfig.systemPrompt || '';
    expect(systemPrompt).toContain('get_cli_reference');
    expect(systemPrompt).toContain('category');
  });

  it('should warn about the deprecated --yolo flag in the prompt', () => {
    const systemPrompt = localAgent.promptConfig.systemPrompt || '';
    expect(systemPrompt).toContain('--yolo');
    expect(systemPrompt).toContain('deprecated');
    expect(systemPrompt).toContain('--approval-mode=yolo');
  });

  it('should instruct precise self-execution command construction', () => {
    const systemPrompt = localAgent.promptConfig.systemPrompt || '';
    expect(systemPrompt).toContain('Self-Execution');
    expect(systemPrompt).toContain('gemini -p');
  });

  it('should process output to a formatted markdown string', () => {
    const mockOutput = {
      answer: '  This is the answer.  ',
      sources: ['file1.md', 'file2.md', 'file1.md', '   ', ''],
    };
    const processed = localAgent.processOutput?.(mockOutput);
    expect(processed).toBe(
      'This is the answer.\n\n**Sources:**\n- file1.md\n- file2.md',
    );
  });

  it('should handle empty output gracefully', () => {
    expect(localAgent.processOutput?.(null)).toBe('');
    expect(localAgent.processOutput?.(undefined)).toBe('');
  });

  it('should handle output with no sources', () => {
    const mockOutput = {
      answer: 'Just an answer.',
      sources: [],
    };
    const processed = localAgent.processOutput?.(mockOutput);
    expect(processed).toBe('Just an answer.');
  });
});
