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

  function execAndLog(command: string) {
    try {
      return execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    } catch (error: unknown) {
      console.error('Command failed:', command);
      const err = error as { stdout?: Buffer; stderr?: Buffer };
      if (err.stdout) console.log('STDOUT:', err.stdout.toString());
      if (err.stderr) console.error('STDERR:', err.stderr.toString());
      throw error;
    }
  }

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
    execAndLog(`node "${initScript}" ${skillName} --path "${tempDir}"`);
    const skillDir = path.join(tempDir, skillName);

    expect(fs.existsSync(skillDir)).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(skillDir, 'scripts/example_script.cjs')),
    ).toBe(true);

    // 2. Validate (should have warning initially due to TODOs)
    // redirct stderr to stdout to capture warnings in the output check
    const validateOutputInitial = execAndLog(
      `node "${validateScript}" "${skillDir}" 2>&1`,
    );
    expect(validateOutputInitial).toContain('⚠️  Found unresolved TODO');

    // 3. Package (should fail due to TODOs)
    try {
      execAndLog(`node "${packageScript}" "${skillDir}" "${tempDir}"`);
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
    const validateOutput = execAndLog(`node "${validateScript}" "${skillDir}"`);
    expect(validateOutput).toContain('Skill is valid!');

    // 5. Package
    execAndLog(`node "${packageScript}" "${skillDir}" "${tempDir}"`);
    const skillFile = path.join(tempDir, `${skillName}.skill`);
    expect(fs.existsSync(skillFile)).toBe(true);

    // 6. Verify zip content (should NOT have nested directory)
    const zipList = execAndLog(`tar -tf "${skillFile}"`);
    expect(zipList).toContain('SKILL.md');
    expect(zipList).not.toContain(`${skillName}/SKILL.md`);
  });
});
