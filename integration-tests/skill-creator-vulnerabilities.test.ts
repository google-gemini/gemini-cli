/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

describe('skill-creator scripts security and bug fixes', () => {
  let rig: TestRig;
  const initScript = path.resolve(
    'packages/core/src/skills/builtin/skill-creator/scripts/init_skill.cjs',
  );
  const validateScript = path.resolve(
    'packages/core/src/skills/builtin/skill-creator/scripts/validate_skill.cjs',
  );
  const packageScript = path.resolve(
    'packages/core/src/skills/builtin/skill-creator/scripts/package_skill.cjs',
  );

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should prevent command injection in package_skill.cjs', async () => {
    await rig.setup('skill-creator command injection');
    const tempDir = rig.testDir!;

    // Create a dummy skill
    const skillName = 'injection-test';
    execSync(`node "${initScript}" ${skillName} --path "${tempDir}"`);
    const skillDir = path.join(tempDir, skillName);

    // Malicious output filename with command injection
    const maliciousFilename = '"; touch injection_success; #';

    // Attempt to package with malicious filename
    // We expect this to fail or at least NOT create the 'injection_success' file
    spawnSync('node', [packageScript, skillDir, tempDir, maliciousFilename], {
      cwd: tempDir,
    });

    const injectionFile = path.join(tempDir, 'injection_success');
    expect(fs.existsSync(injectionFile)).toBe(false);
  });

  it('should prevent path traversal in init_skill.cjs', async () => {
    await rig.setup('skill-creator init path traversal');
    const tempDir = rig.testDir!;

    const maliciousName = '../traversal-success';

    const result = spawnSync(
      'node',
      [initScript, maliciousName, '--path', tempDir],
      {
        encoding: 'utf8',
      },
    );

    expect(result.stderr).toContain(
      'Error: Skill name cannot contain path separators',
    );
    const traversalDir = path.join(path.dirname(tempDir), 'traversal-success');
    expect(fs.existsSync(traversalDir)).toBe(false);
  });

  it('should prevent path traversal in validate_skill.cjs', async () => {
    await rig.setup('skill-creator validate path traversal');

    const maliciousPath = '../../../../etc/passwd';
    const result = spawnSync('node', [validateScript, maliciousPath], {
      encoding: 'utf8',
    });

    expect(result.stderr).toContain('Error: Path traversal detected');
  });

  it('should not crash on empty description in validate_skill.cjs', async () => {
    await rig.setup('skill-creator regex crash');
    const tempDir = rig.testDir!;
    const skillName = 'empty-desc-skill';

    execSync(`node "${initScript}" ${skillName} --path "${tempDir}"`);
    const skillDir = path.join(tempDir, skillName);
    const skillMd = path.join(skillDir, 'SKILL.md');

    // Set an empty quoted description
    let content = fs.readFileSync(skillMd, 'utf8');
    content = content.replace(/^description: .+$/m, 'description: ""');
    fs.writeFileSync(skillMd, content);

    const result = spawnSync('node', [validateScript, skillDir], {
      encoding: 'utf8',
    });

    // It might still fail validation (e.g. TODOs), but it should NOT crash with a stack trace
    expect(result.status).not.toBe(null);
    expect(result.stderr).not.toContain(
      "TypeError: Cannot read properties of undefined (reading 'trim')",
    );
  });
});
