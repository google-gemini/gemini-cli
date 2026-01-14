/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('skill-creator scripts e2e', () => {
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

  it('should initialize, validate, and package a skill', async () => {
    await rig.setup('skill-creator scripts e2e');
    const skillName = 'e2e-test-skill';
    const tempDir = rig.testDir!;

    // 1. Initialize
    execSync(`node "${initScript}" ${skillName} --path "${tempDir}"`, {
      stdio: 'inherit',
    });
    const skillDir = path.join(tempDir, skillName);

    expect(fs.existsSync(skillDir)).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(skillDir, 'scripts/example_script.cjs')),
    ).toBe(true);

    // 2. Validate (should have warning initially due to TODOs)
    const validateOutputInitial = execSync(
      `node "${validateScript}" "${skillDir}" 2>&1`,
      { encoding: 'utf8' },
    );
    expect(validateOutputInitial).toContain('⚠️  Found unresolved TODO');

    // 3. Package (should fail due to TODOs)
    try {
      execSync(`node "${packageScript}" "${skillDir}" "${tempDir}"`, {
        stdio: 'pipe',
      });
      throw new Error('Packaging should have failed due to TODOs');
    } catch (err: unknown) {
      expect((err as Error).message).toContain('Command failed');
    }

    // 4. Fix SKILL.md (remove TODOs)
    let content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    content = content.replace(/TODO: .+/g, 'Fixed');
    content = content.replace(/\[TODO: .+/g, 'Fixed');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);

    // Also remove TODOs from example scripts
    const exampleScriptPath = path.join(skillDir, 'scripts/example_script.cjs');
    let scriptContent = fs.readFileSync(exampleScriptPath, 'utf8');
    scriptContent = scriptContent.replace(/TODO: .+/g, 'Fixed');
    fs.writeFileSync(exampleScriptPath, scriptContent);

    // 4. Validate again (should pass now)
    const validateOutput = execSync(`node "${validateScript}" "${skillDir}"`, {
      encoding: 'utf8',
    });
    expect(validateOutput).toContain('Skill is valid!');

    // 5. Package
    execSync(`node "${packageScript}" "${skillDir}" "${tempDir}"`, {
      stdio: 'inherit',
    });
    const skillFile = path.join(tempDir, `${skillName}.skill`);
    expect(fs.existsSync(skillFile)).toBe(true);

    // 6. Verify zip content (should NOT have nested directory)
    const zipList = execSync(`unzip -l "${skillFile}"`, { encoding: 'utf8' });
    expect(zipList).toContain('SKILL.md');
    expect(zipList).not.toContain(`${skillName}/SKILL.md`);
  });
});
