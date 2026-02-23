/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getCoreSystemPrompt } from './snippets.capability.js';
import type { SystemPromptOptions } from './snippets.js';

describe('snippets.capability', () => {
  it('should render a minimized capability-driven prompt', () => {
    const options: SystemPromptOptions = {
      preamble: { interactive: true },
      coreMandates: {
        interactive: true,
        hasSkills: true,
        hasHierarchicalMemory: false,
      },
      agentSkills: [
        { name: 'test-skill', description: 'desc', location: 'loc' },
      ],
      operationalGuidelines: {
        interactive: true,
        interactiveShellEnabled: true,
      },
    };

    const prompt = getCoreSystemPrompt(options);

    expect(prompt).toContain('You are Gemini CLI, an expert agent.');
    expect(prompt).toContain('# Core Mandates');
    expect(prompt).toContain('Precision:');
    expect(prompt).toContain('Integrity:');
    expect(prompt).toContain('Efficiency:');
    expect(prompt).toContain('Self-Correction:');
    expect(prompt).toContain('# Capabilities');
    expect(prompt).toContain('# Operational Style');

    // Should NOT contain the long Software Engineering workflow by default
    expect(prompt).not.toContain('## Development Lifecycle');
    expect(prompt).not.toContain('## New Applications');
  });
});
