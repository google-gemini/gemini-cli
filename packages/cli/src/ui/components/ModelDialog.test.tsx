/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelDialog } from './ModelDialog.js';
import { Config, AuthType } from '@google/gemini-cli-core';

describe('ModelDialog', () => {
  const mockOnSelect = vi.fn();
  
  const createMockConfig = (authType?: AuthType, model?: string) => ({
    getContentGeneratorConfig: () => ({ authType, model: model || 'gemini-2.5-pro' }),
    getModel: () => model || 'gemini-2.5-pro',
  } as unknown as Config);

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it('should render Gemini models for non-Bedrock auth', () => {
    const config = createMockConfig(AuthType.USE_GEMINI);
    const { lastFrame } = render(
      <ModelDialog onSelect={mockOnSelect} config={config} />
    );

    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Gemini 2.5 Pro');
    expect(lastFrame()).toContain('Gemini 2.5 Flash');
  });

  it('should render Bedrock models for Bedrock auth', () => {
    const config = createMockConfig(AuthType.USE_AWS_BEDROCK);
    const { lastFrame } = render(
      <ModelDialog onSelect={mockOnSelect} config={config} />
    );

    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Claude 3.7 Sonnet');
    expect(lastFrame()).toContain('Claude 3.5 Haiku');
    expect(lastFrame()).toContain('Claude 4 Opus');
  });

  it('should mark current model', () => {
    const config = createMockConfig(AuthType.USE_GEMINI, 'gemini-2.5-pro');
    const { lastFrame } = render(
      <ModelDialog onSelect={mockOnSelect} config={config} />
    );

    expect(lastFrame()).toContain('Gemini 2.5 Pro (current)');
  });

  it('should handle escape key', () => {
    const config = createMockConfig(AuthType.USE_GEMINI);
    const { stdin } = render(
      <ModelDialog onSelect={mockOnSelect} config={config} />
    );

    stdin.write('\x1B'); // ESC key
    expect(mockOnSelect).toHaveBeenCalledWith(undefined);
  });
});