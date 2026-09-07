/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DependencyFinding {
  dependency: string;
  category: 'unnecessary-dependency' | 'heavy-crutch';
  replacement: string;
  rationale: string;
  file?: string;
  line?: number;
}

export interface DependencyReplacementRule {
  dependency: string;
  category: 'unnecessary-dependency' | 'heavy-crutch';
  replacement: string;
  rationale: string;
}

export const KNOWN_REPLACEMENTS: DependencyReplacementRule[] = [
  {
    dependency: 'lodash',
    category: 'unnecessary-dependency',
    replacement: 'Array/Object native methods (map, filter, reduce, Object.entries, structuredClone)',
    rationale: 'Modern JavaScript has built-in primitives for array operations and deep cloning.',
  },
  {
    dependency: 'underscore',
    category: 'unnecessary-dependency',
    replacement: 'Array/Object native methods',
    rationale: 'Modern JavaScript has built-in primitives for functional utilities.',
  },
  {
    dependency: 'axios',
    category: 'heavy-crutch',
    replacement: 'native fetch()',
    rationale: 'Standard Web fetch is built into Node 18+, browsers, and modern JS runtimes.',
  },
  {
    dependency: 'node-fetch',
    category: 'unnecessary-dependency',
    replacement: 'native fetch()',
    rationale: 'Native global fetch is available out of the box in Node 18+.',
  },
  {
    dependency: 'request',
    category: 'unnecessary-dependency',
    replacement: 'native fetch()',
    rationale: 'The request package is deprecated; native fetch is the modern standard.',
  },
  {
    dependency: 'got',
    category: 'heavy-crutch',
    replacement: 'native fetch()',
    rationale: 'Native global fetch is available without external dependencies.',
  },
  {
    dependency: 'moment',
    category: 'heavy-crutch',
    replacement: 'Intl.DateTimeFormat & native Date',
    rationale: 'Moment is heavy and in maintenance mode; standard Intl and Date APIs handle formatting natively.',
  },
  {
    dependency: 'uuid',
    category: 'unnecessary-dependency',
    replacement: 'crypto.randomUUID()',
    rationale: 'Native crypto.randomUUID() is built into Node 15+ and Web Crypto API.',
  },
  {
    dependency: 'rimraf',
    category: 'unnecessary-dependency',
    replacement: 'fs.promises.rm(path, { recursive: true, force: true })',
    rationale: 'Native Node.js fs module supports recursive directory removal since v14.14.',
  },
  {
    dependency: 'mkdirp',
    category: 'unnecessary-dependency',
    replacement: 'fs.promises.mkdir(path, { recursive: true })',
    rationale: 'Native Node.js fs.mkdir supports recursive creation natively.',
  },
  {
    dependency: 'dotenv',
    category: 'heavy-crutch',
    replacement: 'Node.js --env-file flag or process.loadEnvFile()',
    rationale: 'Node 20+ has built-in support for loading .env files without 3rd-party dependencies.',
  },
  {
    dependency: 'querystring',
    category: 'unnecessary-dependency',
    replacement: 'URLSearchParams',
    rationale: 'Standard URLSearchParams API is universally supported and standard.',
  },
  {
    dependency: 'bluebird',
    category: 'unnecessary-dependency',
    replacement: 'native Promise & async/await',
    rationale: 'Native Promises and async/await are fast and standard in all modern runtimes.',
  },
];

export class DependencyAuditor {
  private rules: Map<string, DependencyReplacementRule>;

  constructor(customRules: DependencyReplacementRule[] = []) {
    this.rules = new Map();
    for (const rule of KNOWN_REPLACEMENTS) {
      this.rules.set(rule.dependency.toLowerCase(), rule);
    }
    for (const rule of customRules) {
      this.rules.set(rule.dependency.toLowerCase(), rule);
    }
  }

  public auditCode(code: string, filePath?: string): DependencyFinding[] {
    const findings: DependencyFinding[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match import ... from '...' or require('...')
      const importMatch = line.match(/(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/);
      if (importMatch) {
        const rawPkg = (importMatch[1] || importMatch[2]).trim();
        const basePkg = rawPkg.startsWith('@')
          ? rawPkg.split('/').slice(0, 2).join('/')
          : rawPkg.split('/')[0];

        const rule = this.rules.get(basePkg.toLowerCase());
        if (rule) {
          findings.push({
            dependency: basePkg,
            category: rule.category,
            replacement: rule.replacement,
            rationale: rule.rationale,
            file: filePath,
            line: i + 1,
          });
        }
      }
    }

    return findings;
  }

  public auditPackageJson(packageJsonContent: string | Record<string, any>, filePath?: string): DependencyFinding[] {
    const findings: DependencyFinding[] = [];
    let parsed: Record<string, any>;

    if (typeof packageJsonContent === 'string') {
      try {
        parsed = JSON.parse(packageJsonContent);
      } catch (_e) {
        return [];
      }
    } else {
      parsed = packageJsonContent;
    }

    const allDeps = {
      ...((parsed['dependencies'] as Record<string, string>) || {}),
      ...((parsed['devDependencies'] as Record<string, string>) || {}),
    };

    for (const depName of Object.keys(allDeps)) {
      const rule = this.rules.get(depName.toLowerCase());
      if (rule) {
        findings.push({
          dependency: depName,
          category: rule.category,
          replacement: rule.replacement,
          rationale: rule.rationale,
          file: filePath,
        });
      }
    }

    return findings;
  }

  public formatReport(findings: DependencyFinding[]): string {
    if (findings.length === 0) {
      return 'No redundant dependencies detected. Standard library hygiene is strong.';
    }

    const lines: string[] = [
      '### Ponytail Dependency Audit — Redundant External Packages',
      'The following third-party dependencies can be replaced with standard library / platform primitives:',
      '',
    ];

    for (const f of findings) {
      const location = f.file ? (f.line ? ` (${f.file}:${f.line})` : ` (${f.file})`) : '';
      lines.push(`- **\`${f.dependency}\`**${location}`);
      lines.push(`  - **Native Alternative**: ${f.replacement}`);
      lines.push(`  - **Rationale**: ${f.rationale}`);
    }

    return lines.join('\n');
  }
}
