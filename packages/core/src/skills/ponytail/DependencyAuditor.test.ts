/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DependencyAuditor } from './DependencyAuditor.js';

describe('DependencyAuditor', () => {
  it('detects redundant dependencies in code imports', () => {
    const auditor = new DependencyAuditor();
    const sampleCode = `
import _ from 'lodash';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import * as fs from 'node:fs';
`;
    const findings = auditor.auditCode(sampleCode, 'sample.ts');
    expect(findings.length).toBe(4);

    const deps = findings.map((f) => f.dependency);
    expect(deps).toContain('lodash');
    expect(deps).toContain('axios');
    expect(deps).toContain('uuid');
    expect(deps).toContain('moment');

    const axiosFinding = findings.find((f) => f.dependency === 'axios');
    expect(axiosFinding?.replacement).toContain('native fetch()');

    const uuidFinding = findings.find((f) => f.dependency === 'uuid');
    expect(uuidFinding?.replacement).toContain('crypto.randomUUID()');
  });

  it('detects redundant dependencies in package.json', () => {
    const auditor = new DependencyAuditor();
    const pkgJson = JSON.stringify({
      dependencies: {
        rimraf: '^5.0.0',
        mkdirp: '^3.0.0',
        dotenv: '^16.0.0',
        express: '^4.18.0',
      },
      devDependencies: {
        lodash: '^4.17.21',
      },
    });

    const findings = auditor.auditPackageJson(pkgJson, 'package.json');
    expect(findings.length).toBe(4);

    const rimrafFinding = findings.find((f) => f.dependency === 'rimraf');
    expect(rimrafFinding?.replacement).toContain('fs.promises.rm');

    const mkdirpFinding = findings.find((f) => f.dependency === 'mkdirp');
    expect(mkdirpFinding?.replacement).toContain('fs.promises.mkdir');

    const dotenvFinding = findings.find((f) => f.dependency === 'dotenv');
    expect(dotenvFinding?.replacement).toContain('--env-file');
  });

  it('formats clean audit report when no findings are detected', () => {
    const auditor = new DependencyAuditor();
    const report = auditor.formatReport([]);
    expect(report).toContain('No redundant dependencies detected');
  });

  it('formats markdown report with native alternatives', () => {
    const auditor = new DependencyAuditor();
    const findings = auditor.auditCode(`import axios from 'axios';`, 'api.ts');
    const report = auditor.formatReport(findings);
    expect(report).toContain('Ponytail Dependency Audit');
    expect(report).toContain('**`axios`**');
    expect(report).toContain('native fetch()');
  });
});
