/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = path.join(
  process.cwd(),
  '.github/workflows/gemini-cli-bot-brain.yml',
);

function extractGeneratePatchScript() {
  const workflow = fs.readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');
  const match = workflow.match(
    /^[ ]{6}- name: 'Generate Patch'[\s\S]*?^[ ]{8}run: \|\n([\s\S]*?)\n\n^[ ]{6}- name: 'Archive Brain Data'/m,
  );

  if (!match) {
    throw new Error('Could not find Generate Patch script');
  }

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[ ]{10}/, ''))
    .join('\n');
}

function withTempGitRepo(callback: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-bot-workflow-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: dir,
    });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'README.md'), 'initial\n');
    execFileSync('git', ['add', 'README.md'], { cwd: dir });
    execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: dir });
    callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('gemini-cli bot brain workflow', () => {
  it('removes stale patch artifacts when critique rejects changes', () => {
    const script = extractGeneratePatchScript();

    withTempGitRepo((dir) => {
      fs.writeFileSync(
        path.join(dir, 'bot-changes.patch'),
        'diff --git a/README.md b/README.md\n',
      );
      fs.writeFileSync(path.join(dir, 'bot-changes.approved'), 'approved\n');
      fs.writeFileSync(path.join(dir, 'pr-description.md'), 'stale title\n');
      fs.writeFileSync(path.join(dir, 'branch-name.txt'), 'bot/stale\n');
      fs.writeFileSync(path.join(dir, 'critique_result.txt'), '[REJECTED]\n');

      execFileSync('bash', ['-c', script], { cwd: dir });

      expect(fs.existsSync(path.join(dir, 'bot-changes.patch'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'bot-changes.approved'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'pr-description.md'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'branch-name.txt'))).toBe(false);
    });
  });

  it('creates a publishable patch marker only after critique approves', () => {
    const script = extractGeneratePatchScript();

    withTempGitRepo((dir) => {
      const readmePath = path.join(dir, 'README.md');
      fs.writeFileSync(
        readmePath,
        `${fs.readFileSync(readmePath, 'utf8')}approved change\n`,
      );
      execFileSync('git', ['add', readmePath], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'critique_result.txt'), '[APPROVED]\n');

      execFileSync('bash', ['-c', script], { cwd: dir });

      expect(
        fs.readFileSync(path.join(dir, 'bot-changes.patch'), 'utf8'),
      ).toContain('approved change');
      expect(
        fs.readFileSync(path.join(dir, 'bot-changes.approved'), 'utf8'),
      ).toBe('approved\n');
    });
  });

  it('requires the approval marker before publishing patch artifacts', () => {
    const workflow = fs
      .readFileSync(workflowPath, 'utf8')
      .replace(/\r\n/g, '\n');

    expect(workflow).toContain('bot-changes.approved');
    expect(workflow).toContain(
      '[ -s "${{ runner.temp }}/brain-data/bot-changes.patch" ] && [ -f "${{ runner.temp }}/brain-data/bot-changes.approved" ] && grep -qx "approved" "${{ runner.temp }}/brain-data/bot-changes.approved"',
    );
  });
});
