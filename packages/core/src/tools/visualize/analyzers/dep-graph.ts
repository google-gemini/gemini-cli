/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads a dependency manifest file and returns Mermaid flowchart code
 * representing the dependency graph.
 */
export function generateDepGraphMermaid(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  const basename = path.basename(filePath);

  if (basename === 'package.json') {
    return parsePackageJson(content, basename);
  }
  if (basename === 'requirements.txt') {
    return parseRequirementsTxt(content);
  }
  if (basename === 'go.mod') {
    return parseGoMod(content);
  }

  throw new Error(
    `Unsupported manifest file: ${basename}. Supported: package.json, requirements.txt, go.mod`,
  );
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

interface PackageJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function isString(val: unknown): val is string {
  return Object.prototype.toString.call(val) === '[object String]';
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return (
    val !== null &&
    val !== undefined &&
    !Array.isArray(val) &&
    val instanceof Object
  );
}

function extractStringRecord(val: unknown): Record<string, string> | undefined {
  if (!isRecord(val)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(val)) {
    if (isString(value)) {
      result[key] = value;
    }
  }
  return result;
}

function parsePackageJson(content: string, filename: string): string {
  const raw: unknown = JSON.parse(content);
  if (!isRecord(raw)) {
    throw new Error('Invalid package.json: expected an object');
  }
  const pkg: PackageJsonShape = {
    name: isString(raw['name']) ? raw['name'] : undefined,
    dependencies: extractStringRecord(raw['dependencies']),
    devDependencies: extractStringRecord(raw['devDependencies']),
  };
  const projectName = pkg.name ?? filename;
  const lines = ['graph LR'];
  const rootId = sanitizeId(projectName);

  const MAX_DEPS = 12;

  const deps = Object.keys(pkg.dependencies ?? {});
  const shownDeps = deps.slice(0, MAX_DEPS);
  for (const dep of shownDeps) {
    const depId = sanitizeId(dep);
    lines.push(`  ${rootId}[${projectName}] --> ${depId}[${dep}]`);
  }
  if (deps.length > MAX_DEPS) {
    lines.push(
      `  ${rootId}[${projectName}] --> more_deps[+${deps.length - MAX_DEPS} more]`,
    );
  }

  const devDeps = Object.keys(pkg.devDependencies ?? {});
  const shownDevDeps = devDeps.slice(0, MAX_DEPS);
  for (const dep of shownDevDeps) {
    const depId = sanitizeId(dep) + '_dev';
    lines.push(`  ${rootId}[${projectName}] -.-> ${depId}[${dep}]`);
  }
  if (devDeps.length > MAX_DEPS) {
    lines.push(
      `  ${rootId}[${projectName}] -.-> more_devdeps[+${devDeps.length - MAX_DEPS} more dev]`,
    );
  }

  if (deps.length === 0 && devDeps.length === 0) {
    lines.push(`  ${rootId}[${projectName}]`);
  }

  return lines.join('\n');
}

function parseRequirementsTxt(content: string): string {
  const lines = ['graph LR'];
  const rootId = 'project';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    // Strip version specifiers
    const name = line.split(/[>=<!~;@\s]/)[0];
    if (name) {
      const depId = sanitizeId(name);
      lines.push(`  ${rootId}[Project] --> ${depId}[${name}]`);
    }
  }

  return lines.join('\n');
}

function parseGoMod(content: string): string {
  const lines = ['graph LR'];
  let moduleName = 'module';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    const moduleMatch = line.match(/^module\s+(.+)$/);
    if (moduleMatch) {
      moduleName = moduleMatch[1];
    }
  }

  const rootId = sanitizeId(moduleName);
  const requireRegex = /^\s+(\S+)\s+/;
  let inRequire = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === 'require (') {
      inRequire = true;
      continue;
    }
    if (line === ')') {
      inRequire = false;
      continue;
    }
    if (inRequire) {
      const m = requireRegex.exec(rawLine);
      if (m) {
        const dep = m[1];
        const depId = sanitizeId(dep);
        lines.push(`  ${rootId}[${moduleName}] --> ${depId}[${dep}]`);
      }
    }
  }

  return lines.join('\n');
}
