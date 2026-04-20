/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DepNode {
  name: string;
  version: string;
  children: DepNode[];
}

export interface DepGraphData {
  projectName: string;
  projectVersion: string;
  dependencies: DepNode[];
  devDependencies: DepNode[];
  totalDeps: number;
  totalDevDeps: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

/**
 * Reads package.json from the given directory and builds
 * a dependency graph structure for visualization.
 */
export function buildDepGraph(cwd: string): DepGraphData | null {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }

  let pkg: unknown;
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(pkg)) {
    return null;
  }

  const projectName = getString(pkg, 'name') ?? 'unknown';
  const projectVersion = getString(pkg, 'version') ?? '0.0.0';

  const deps = parseDeps(pkg['dependencies']);
  const devDeps = parseDeps(pkg['devDependencies']);

  return {
    projectName,
    projectVersion,
    dependencies: deps,
    devDependencies: devDeps,
    totalDeps: deps.length,
    totalDevDeps: devDeps.length,
  };
}

function parseDeps(raw: unknown): DepNode[] {
  if (!isRecord(raw)) {
    return [];
  }

  return Object.keys(raw).map((name) => ({
    name,
    version: String(raw[name] ?? ''),
    children: [],
  }));
}

/**
 * Renders a dependency tree as an array of formatted lines.
 * Each line includes tree-drawing characters for hierarchy.
 */
export function renderDepTree(nodes: DepNode[], prefix = ''): string[] {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
    const childPrefix = prefix + (isLast ? '   ' : '\u2502  ');

    lines.push(`${prefix}${connector}${node.name}@${node.version}`);

    if (node.children.length > 0) {
      lines.push(...renderDepTree(node.children, childPrefix));
    }
  }

  return lines;
}
