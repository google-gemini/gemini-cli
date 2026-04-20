/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDepGraph, renderDepTree, type DepNode } from './depGraph.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('buildDepGraph', () => {
  it('should return null when package.json does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    const result = buildDepGraph('/fake/dir');
    expect(result).toBeNull();
  });

  it('should return null when package.json is invalid JSON', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('not json');
    const result = buildDepGraph('/fake/dir');
    expect(result).toBeNull();
  });

  it('should parse project name and version', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ name: 'my-project', version: '1.2.3' }),
    );

    const result = buildDepGraph('/fake/dir');
    expect(result).not.toBeNull();
    expect(result?.projectName).toBe('my-project');
    expect(result?.projectVersion).toBe('1.2.3');
  });

  it('should default name and version when missing', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

    const result = buildDepGraph('/fake/dir');
    expect(result?.projectName).toBe('unknown');
    expect(result?.projectVersion).toBe('0.0.0');
  });

  it('should parse dependencies', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        name: 'test',
        dependencies: {
          react: '^18.0.0',
          ink: '^4.0.0',
        },
      }),
    );

    const result = buildDepGraph('/fake/dir');
    expect(result?.totalDeps).toBe(2);
    expect(result?.dependencies[0]?.name).toBe('react');
    expect(result?.dependencies[0]?.version).toBe('^18.0.0');
    expect(result?.dependencies[1]?.name).toBe('ink');
  });

  it('should parse devDependencies', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        name: 'test',
        devDependencies: {
          vitest: '^1.0.0',
          typescript: '^5.0.0',
        },
      }),
    );

    const result = buildDepGraph('/fake/dir');
    expect(result?.totalDevDeps).toBe(2);
    expect(result?.devDependencies[0]?.name).toBe('vitest');
  });

  it('should handle missing dependencies gracefully', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'empty' }));

    const result = buildDepGraph('/fake/dir');
    expect(result?.totalDeps).toBe(0);
    expect(result?.totalDevDeps).toBe(0);
    expect(result?.dependencies).toEqual([]);
    expect(result?.devDependencies).toEqual([]);
  });
});

describe('renderDepTree', () => {
  it('should return empty array for no nodes', () => {
    expect(renderDepTree([])).toEqual([]);
  });

  it('should render a single node', () => {
    const nodes: DepNode[] = [
      { name: 'react', version: '^18.0.0', children: [] },
    ];
    const lines = renderDepTree(nodes);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('react@^18.0.0');
    // Last node uses └─
    expect(lines[0]).toContain('\u2514\u2500');
  });

  it('should render multiple nodes with tree connectors', () => {
    const nodes: DepNode[] = [
      { name: 'a', version: '1.0', children: [] },
      { name: 'b', version: '2.0', children: [] },
    ];
    const lines = renderDepTree(nodes);
    expect(lines).toHaveLength(2);
    // First uses ├─, last uses └─
    expect(lines[0]).toContain('\u251C\u2500');
    expect(lines[1]).toContain('\u2514\u2500');
  });

  it('should render nested children', () => {
    const nodes: DepNode[] = [
      {
        name: 'parent',
        version: '1.0',
        children: [{ name: 'child', version: '2.0', children: [] }],
      },
    ];
    const lines = renderDepTree(nodes);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('parent@1.0');
    expect(lines[1]).toContain('child@2.0');
  });
});
