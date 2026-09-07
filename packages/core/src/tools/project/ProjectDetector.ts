/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface ProjectInfo {
  workspacePath: string;
  displayPath: string;
  badges: string[];
  summary: string;
}

export class ProjectDetector {
  public static detect(workspaceRoot: string): ProjectInfo {
    const badges: string[] = [];
    const root = path.resolve(workspaceRoot);

    // Format display path (e.g. ~/Projects/...)
    const homedir = os.homedir();
    const displayPath = root.startsWith(homedir)
      ? `~${root.slice(homedir.length)}`
      : root;

    // Check Node / TypeScript / JavaScript
    const packageJsonPath = path.join(root, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const hasTsConfig = fs.existsSync(path.join(root, 'tsconfig.json'));
      badges.push(hasTsConfig ? 'TypeScript' : 'JavaScript');
      badges.push('Node');

      try {
        const raw = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(raw);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps['fastapi']) badges.push('FastAPI');
        if (deps['react']) badges.push('React');
        if (deps['next']) badges.push('Next.js');
        if (deps['express']) badges.push('Express');
        if (deps['ink']) badges.push('Ink');
        if (deps['vue']) badges.push('Vue');
      } catch {
        // Ignore parse error
      }
    }

    // Check Python
    const hasPyProject = fs.existsSync(path.join(root, 'pyproject.toml'));
    const hasRequirements = fs.existsSync(path.join(root, 'requirements.txt'));
    const hasSetupPy = fs.existsSync(path.join(root, 'setup.py'));

    if (hasPyProject || hasRequirements || hasSetupPy) {
      if (!badges.includes('Python')) {
        badges.push('Python');
      }

      const checkPythonDeps = (content: string) => {
        const lower = content.toLowerCase();
        if (lower.includes('fastapi') && !badges.includes('FastAPI')) badges.push('FastAPI');
        if (lower.includes('django') && !badges.includes('Django')) badges.push('Django');
        if (lower.includes('flask') && !badges.includes('Flask')) badges.push('Flask');
        if (lower.includes('pytorch') || lower.includes('torch')) badges.push('PyTorch');
      };

      if (hasPyProject) {
        try {
          checkPythonDeps(fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf-8'));
        } catch {}
      }
      if (hasRequirements) {
        try {
          checkPythonDeps(fs.readFileSync(path.join(root, 'requirements.txt'), 'utf-8'));
        } catch {}
      }
    }

    // Check Rust
    if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
      badges.push('Rust');
    }

    // Check Go
    if (fs.existsSync(path.join(root, 'go.mod'))) {
      badges.push('Go');
    }

    // Check Git
    if (fs.existsSync(path.join(root, '.git'))) {
      badges.push('Git');
    }

    // Default badge if none found
    if (badges.length === 0) {
      badges.push('Project');
    }

    return {
      workspacePath: root,
      displayPath,
      badges,
      summary: badges.join(' • '),
    };
  }
}
