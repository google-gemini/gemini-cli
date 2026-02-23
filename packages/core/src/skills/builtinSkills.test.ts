/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { loadSkillFromFile } from './skillLoader.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Built-in Skills', () => {
  it('should load software-engineering skill correctly', async () => {
    const skillPath = path.join(
      __dirname,
      'builtin',
      'software-engineering',
      'SKILL.md',
    );
    const skill = await loadSkillFromFile(skillPath);

    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('software-engineering');
    expect(skill?.description).toContain(
      'Expert procedural guidance for software engineering tasks',
    );
    expect(skill?.body).toContain(
      '# `software-engineering` skill instructions',
    );
    expect(skill?.body).toContain('Phase 1: Research');
    expect(skill?.body).toContain('Phase 3: Execution (Iterative Cycle)');
  });

  it('should load new-application skill correctly', async () => {
    const skillPath = path.join(
      __dirname,
      'builtin',
      'new-application',
      'SKILL.md',
    );
    const skill = await loadSkillFromFile(skillPath);

    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('new-application');
    expect(skill?.description).toContain(
      'Expert guidance for building new applications from scratch',
    );
    expect(skill?.body).toContain('# `new-application` skill instructions');
    expect(skill?.body).toContain('Phase 1: Mandatory Planning');
    expect(skill?.body).toContain('Phase 2: Implementation');
  });
});
