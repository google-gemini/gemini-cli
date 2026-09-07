/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ProjectDetector } from './ProjectDetector.js';

describe('ProjectDetector', () => {
  it('detects current workspace stack', () => {
    const workspaceRoot = path.resolve(process.cwd());
    const info = ProjectDetector.detect(workspaceRoot);

    expect(info.badges).toContain('TypeScript');
    expect(info.badges).toContain('Node');
    expect(info.badges).toContain('Git');
    expect(info.summary).toContain('TypeScript');
    expect(info.displayPath.length).toBeGreaterThan(0);
  });
});
