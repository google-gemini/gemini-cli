/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ArchitectureVisualizer } from './ArchitectureVisualizer.js';
import type { ProjectInfo } from '../../tools/project/ProjectDetector.js';

describe('ArchitectureVisualizer', () => {
  const mockProject: ProjectInfo = {
    workspacePath: process.cwd(),
    displayPath: '~/Projects/cli-zoe',
    badges: ['TypeScript', 'Node', 'React', 'Ink', 'Git'],
    summary: 'Mock project for testing',
  };

  it('renders workspace architecture topology with layers and pipelines', () => {
    const topology = ArchitectureVisualizer.renderWorkspaceTopology(mockProject);
    expect(topology).toContain('SYSTEM ARCHITECTURE TOPOLOGY');
    expect(topology).toContain('Target: ~/Projects/cli-zoe');
    expect(topology).toContain('Stack:  TypeScript • Node • React • Ink • Git');
    expect(topology).toContain('High-Level Architecture Flow:');
    expect(topology).toContain('CLI / TUI');
    expect(topology).toContain('──►');
    expect(topology).toContain('SessionEngine');
    expect(topology).toContain('Subsystem Layers:');
    expect(topology).toContain('Interaction Layer');
    expect(topology).toContain('Orchestration Layer');
    expect(topology).toContain('Socratic Mentoring & Skills');
    expect(topology).toContain('Security & Capability Matrix');
    expect(topology).toContain('Model Provider Layer');
  });

  it('renders custom architecture diagrams with components and connections', () => {
    const custom = ArchitectureVisualizer.renderCustomArchitecture(
      'Payment Processing Gateway',
      [
        { name: 'Gateway', role: 'Validates and signs incoming charges' },
        { name: 'Ledger', role: 'Double-entry bookkeeping journal' },
      ],
      [{ from: 'Gateway', to: 'Ledger', label: 'gRPC' }]
    );

    expect(custom).toContain('Payment Processing Gateway');
    expect(custom).toContain('Gateway');
    expect(custom).toContain('Ledger');
    expect(custom).toContain('Gateway          ──[ gRPC ]──► Ledger');
  });
});
