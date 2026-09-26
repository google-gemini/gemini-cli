/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getProjectHash } from '@google/gemini-cli-core';
import {
  formatTurnForDisplay,
  fromLog,
  inspectLog,
} from '../utils/eval-from-log.js';

const tempDirectories: string[] = [];

function makeTempDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function metadata(projectHash: string): Record<string, unknown> {
  return {
    sessionId: 'session-1',
    projectHash,
    startTime: '2026-01-01T00:00:00.000Z',
    lastUpdated: '2026-01-01T00:00:00.000Z',
  };
}

function userMessage(): Record<string, unknown> {
  return {
    id: 'user-1',
    type: 'user',
    timestamp: '2026-01-01T00:00:00.000Z',
    content: [{ text: 'Please inspect the source file.' }],
  };
}

function writeJsonlShapedSession(
  directory: string,
  extension: '.jsonl' | '.json',
  projectHash: string,
  extraLines: string[] = [],
): string {
  const sessionPath = path.join(directory, `session${extension}`);
  fs.writeFileSync(
    sessionPath,
    [
      JSON.stringify(metadata(projectHash)),
      JSON.stringify(userMessage()),
      ...extraLines,
    ].join('\n'),
    'utf8',
  );
  return sessionPath;
}

function makeRepository(): string {
  const repoRoot = makeTempDirectory('eval-from-log-repo-');
  fs.mkdirSync(path.join(repoRoot, 'evals'));
  return repoRoot;
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    fs.rmSync(tempDirectories.pop() as string, {
      recursive: true,
      force: true,
    });
  }
});

describe('session format validation', () => {
  it('refuses malformed records in a .jsonl session', async () => {
    const directory = makeTempDirectory('eval-from-log-session-');
    const sessionPath = writeJsonlShapedSession(
      directory,
      '.jsonl',
      'project-hash',
      ['{truncated'],
    );

    await expect(inspectLog(sessionPath)).rejects.toThrow(/malformed/);
  });

  it('refuses malformed records in a JSONL-shaped .json session', async () => {
    const directory = makeTempDirectory('eval-from-log-session-');
    const sessionPath = writeJsonlShapedSession(
      directory,
      '.json',
      'project-hash',
      ['{truncated'],
    );

    await expect(inspectLog(sessionPath)).rejects.toThrow(/malformed/);
  });

  it('accepts a pretty-printed legacy .json session', async () => {
    const directory = makeTempDirectory('eval-from-log-session-');
    const sessionPath = path.join(directory, 'legacy.json');
    fs.writeFileSync(
      sessionPath,
      JSON.stringify(
        {
          ...metadata('legacy-project-hash'),
          messages: [userMessage()],
        },
        null,
        2,
      ),
      'utf8',
    );

    const result = await inspectLog(sessionPath);

    expect(result.projectHash).toBe('legacy-project-hash');
    expect(result.analysis.turns).toHaveLength(1);
  });
});

describe('candidate path display', () => {
  it('maps paths recorded under a user-visible workspace alias', () => {
    const realWorkspace = makeTempDirectory('eval-from-log-real-');
    const linkParent = makeTempDirectory('eval-from-log-link-');
    const linkedWorkspace = path.join(linkParent, 'workspace');
    fs.symlinkSync(
      realWorkspace,
      linkedWorkspace,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const displayed = formatTurnForDisplay(
      {
        messageId: 'user-1',
        prompt: 'Inspect the source file.',
        observedTools: [],
        candidatePaths: [path.join(linkedWorkspace, 'src', 'a.ts')],
      },
      linkedWorkspace,
    );

    expect(displayed.candidatePaths).toEqual(['src/a.ts']);
  });

  it('maps paths recorded under the real workspace root', () => {
    const realWorkspace = makeTempDirectory('eval-from-log-real-');
    const linkParent = makeTempDirectory('eval-from-log-link-');
    const linkedWorkspace = path.join(linkParent, 'workspace');
    fs.symlinkSync(
      realWorkspace,
      linkedWorkspace,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const displayed = formatTurnForDisplay(
      {
        messageId: 'user-1',
        prompt: 'Inspect the source file.',
        observedTools: [],
        candidatePaths: [
          path.join(fs.realpathSync(realWorkspace), 'src', 'a.ts'),
        ],
      },
      linkedWorkspace,
    );

    expect(displayed.candidatePaths).toEqual(['src/a.ts']);
  });

  it('marks genuinely external paths as outside the workspace', () => {
    const workspace = makeTempDirectory('eval-from-log-workspace-');
    const external = makeTempDirectory('eval-from-log-external-');

    const displayed = formatTurnForDisplay(
      {
        messageId: 'user-1',
        prompt: 'Inspect the source file.',
        observedTools: [],
        candidatePaths: [path.join(external, 'secret.txt')],
      },
      workspace,
    );

    expect(displayed.candidatePaths).toEqual(['<outside-workspace>']);
  });
});

describe('fromLog', () => {
  it('previews, writes explicitly, and refuses to overwrite a draft', async () => {
    const repoRoot = makeRepository();
    const workspace = makeTempDirectory('eval-from-log-workspace-');
    fs.writeFileSync(
      path.join(workspace, 'fixture.txt'),
      'safe fixture',
      'utf8',
    );
    const sessionPath = writeJsonlShapedSession(
      makeTempDirectory('eval-from-log-session-'),
      '.jsonl',
      getProjectHash(workspace),
    );
    const commonOptions = {
      name: 'Source inspection',
      expectedTools: ['read_file'],
      fixturePaths: ['fixture.txt'],
      workspaceRoot: workspace,
      repoRoot,
    };

    const preview = await fromLog(sessionPath, commonOptions);
    expect(preview.wroteFile).toBe(false);
    expect(fs.existsSync(preview.outputPath)).toBe(false);
    expect(preview.fixturePaths).toEqual(['fixture.txt']);
    expect(preview.skeleton).toContain('safe fixture');

    const outputPath = 'evals/source-inspection.eval.ts';
    const written = await fromLog(sessionPath, {
      ...commonOptions,
      outputPath,
      write: true,
    });
    expect(written.wroteFile).toBe(true);
    expect(fs.readFileSync(written.outputPath, 'utf8')).toBe(written.skeleton);

    await expect(
      fromLog(sessionPath, {
        ...commonOptions,
        outputPath,
        write: true,
      }),
    ).rejects.toThrow(/Refusing to overwrite/);
  });

  it('refuses fixtures from a workspace that does not match the session', async () => {
    const repoRoot = makeRepository();
    const workspace = makeTempDirectory('eval-from-log-workspace-');
    const otherWorkspace = makeTempDirectory('eval-from-log-other-');
    fs.writeFileSync(
      path.join(workspace, 'fixture.txt'),
      'safe fixture',
      'utf8',
    );
    const sessionPath = writeJsonlShapedSession(
      makeTempDirectory('eval-from-log-session-'),
      '.jsonl',
      getProjectHash(otherWorkspace),
    );

    await expect(
      fromLog(sessionPath, {
        name: 'Mismatched workspace',
        expectedTools: ['read_file'],
        fixturePaths: ['fixture.txt'],
        workspaceRoot: workspace,
        repoRoot,
      }),
    ).rejects.toThrow(/does not match the session project hash/);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses a symbolic-link fixture',
    async () => {
      const repoRoot = makeRepository();
      const workspace = makeTempDirectory('eval-from-log-workspace-');
      fs.writeFileSync(
        path.join(workspace, 'target.txt'),
        'safe fixture',
        'utf8',
      );
      fs.symlinkSync('target.txt', path.join(workspace, 'fixture.txt'), 'file');
      const sessionPath = writeJsonlShapedSession(
        makeTempDirectory('eval-from-log-session-'),
        '.jsonl',
        getProjectHash(workspace),
      );

      await expect(
        fromLog(sessionPath, {
          name: 'Symlink fixture',
          expectedTools: ['read_file'],
          fixturePaths: ['fixture.txt'],
          workspaceRoot: workspace,
          repoRoot,
        }),
      ).rejects.toThrow(/symbolic link/);
    },
  );
});
