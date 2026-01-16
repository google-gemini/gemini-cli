/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { TestRig } from './test-helper.js';

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
    await rig.runRawCommand(
      'node',
      [initScript, skillName, '--path', tempDir],
      {
        timeout: 60000,
      },
    );
    const skillDir = path.join(tempDir, skillName);

    expect(fs.existsSync(skillDir)).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(skillDir, 'scripts/example_script.cjs')),
    ).toBe(true);

    // 2. Validate (should have warning initially due to TODOs)
    const { stdout: stdoutInitial, stderr: stderrInitial } =
      await rig.runRawCommand('node', [validateScript, skillDir], {
        timeout: 30000,
      });
    const validateOutputInitial = stdoutInitial + stderrInitial;
    expect(validateOutputInitial).toContain('⚠️  Found unresolved TODO');

    // 3. Package (should fail due to TODOs)
    try {
      await rig.runRawCommand('node', [packageScript, skillDir, tempDir], {
        timeout: 30000,
      });
      throw new Error('Packaging should have failed due to TODOs');
    } catch (err: unknown) {
      expect((err as Error).message).toContain('Process exited with code 1');
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
    const { stdout: stdoutVal, stderr: stderrVal } = await rig.runRawCommand(
      'node',
      [validateScript, skillDir],
      { timeout: 30000 },
    );
    const validateOutput = stdoutVal + stderrVal;
    expect(validateOutput).toContain('Skill is valid!');

    // 5. Package
    await rig.runRawCommand('node', [packageScript, skillDir, tempDir], {
      timeout: 60000,
    });
    const skillFile = path.join(tempDir, `${skillName}.skill`);
    expect(fs.existsSync(skillFile)).toBe(true);

    // 6. Verify zip content (should NOT have nested directory)
    const { stdout: zipList } = await rig.runRawCommand(
      'unzip',
      ['-l', skillFile],
      {
        timeout: 30000,
      },
    );
    expect(zipList).toContain('SKILL.md');
    expect(zipList).not.toContain(`${skillName}/SKILL.md`);
  });
});
