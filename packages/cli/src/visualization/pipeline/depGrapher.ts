/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Generates a Mermaid graph representing the internal workspace dependencies.
 */
export async function getDepMermaidGraph(rootPath: string): Promise<string> {
    try {
        const packages = new Map<string, string[]>(); // pkgName -> internal dependencies
        const allPkgNames = new Set<string>();

        // 1. Find all package.json, requirements.txt, or pyproject.toml files
        const findPackages = (dir: string, depth = 0) => {
            if (depth > 2) return;

            let files: string[] = [];
            try {
                files = readdirSync(dir);
            } catch { return; }

            // Node.js support
            if (files.includes('package.json')) {
                try {
                    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
                    if (pkg.name) {
                        allPkgNames.add(pkg.name);
                        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                        packages.set(pkg.name, Object.keys(deps));
                    }
                } catch { /* skip invalid */ }
            }

            // Python support (requirements.txt)
            if (files.includes('requirements.txt')) {
                const content = readFileSync(join(dir, 'requirements.txt'), 'utf8');
                const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                // For python, we treat the directory name as the package if no other meta exists
                const pkgName = `py:${dir === rootPath ? 'root' : resolve(dir).split(/[\\/]/).pop()}`;
                allPkgNames.add(pkgName);
                const deps = lines.map(l => l.split(/[=<>!]/)[0].trim());
                packages.set(pkgName, deps);
            }

            for (const file of files) {
                if (file === 'node_modules' || file === '.git' || file === 'brain' || file === 'venv' || file === '.venv') continue;
                const path = join(dir, file);
                try {
                    if (statSync(path).isDirectory()) {
                        findPackages(path, depth + 1);
                    }
                } catch { /* skip */ }
            }
        };

        findPackages(rootPath);

        // 2. Build graph lines
        let mermaid = 'graph LR\n';
        for (const [name, deps] of packages.entries()) {
            // Create a short name for nodes to avoid issues with scoped packages (@google/...)
            const shortName = name.replace(/[@/]/g, '_');
            mermaid += `  ${shortName}["${name}"]\n`;

            for (const dep of deps) {
                if (allPkgNames.has(dep)) {
                    const shortDep = dep.replace(/[@/]/g, '_');
                    mermaid += `  ${shortName} --> ${shortDep}\n`;
                }
            }
        }

        return mermaid;
    } catch (err) {
        return `graph TD\n  Error[Dependency Scraper Failed: ${String(err).replace(/\n/g, ' ')}]`;
    }
}
