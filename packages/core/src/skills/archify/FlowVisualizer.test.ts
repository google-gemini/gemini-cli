/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FlowVisualizer } from './FlowVisualizer.js';

describe('FlowVisualizer', () => {
  it('renders horizontal pipeline diagrams', () => {
    const pipeline = FlowVisualizer.renderPipeline(['Client', 'Router', 'Service', 'Database']);
    expect(pipeline).toContain('Client');
    expect(pipeline).toContain('──►');
    expect(pipeline).toContain('Router');
    expect(pipeline).toContain('Service');
    expect(pipeline).toContain('Database');
  });

  it('renders vertical multi-step flow diagrams with arrows', () => {
    const vertical = FlowVisualizer.renderVerticalFlow([
      { title: 'Step 1: Input', description: 'Read user line' },
      { title: 'Step 2: Processing', description: 'Parse tokens' },
    ]);
    expect(vertical).toContain('Step 1: Input');
    expect(vertical).toContain('Read user line');
    expect(vertical).toContain('│\n           ▼');
    expect(vertical).toContain('Step 2: Processing');
    expect(vertical).toContain('Parse tokens');
  });

  it('renders bidirectional component communication', () => {
    const bidi = FlowVisualizer.renderBidirectional('SessionEngine', 'AgentHarness', 'Events');
    expect(bidi).toContain('SessionEngine');
    expect(bidi).toContain('◄──[ Events ]──►');
    expect(bidi).toContain('AgentHarness');
  });
});
