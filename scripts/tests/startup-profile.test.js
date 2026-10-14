/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createPhaseCollector,
  getProcessLabel,
  summarizeProfiles,
} from '../startup-profile.js';
import { getPreloadOption, runStartupProfile } from '../profile-startup.js';

vi.unmock('fs');
vi.unmock('node:fs');

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const wrapper = fileURLToPath(
  new URL('../profile-startup.js', import.meta.url),
);
const preload = new URL('../startup-profile-preload.js', import.meta.url).href;

describe('startup timing collection', () => {
  it('records only correlated startup phases, without performance details', () => {
    const collector = createPhaseCollector(100);
    collector.collect([
      {
        entryType: 'measure',
        name: 'cli_startup',
        startTime: 20,
        duration: 50,
        detail: { prompt: 'private prompt' },
      },
      { entryType: 'mark', name: 'startup:cli_startup:start', startTime: 20 },
      {
        entryType: 'mark',
        name: 'startup:private prompt:start',
        startTime: 30,
      },
      {
        entryType: 'measure',
        name: 'private prompt',
        startTime: 30,
        duration: 1,
      },
      {
        entryType: 'measure',
        name: 'authenticate',
        startTime: 0,
        duration: 99,
      },
    ]);
    expect(collector.snapshot()).toEqual([
      { name: 'cli_startup', startMs: 120, durationMs: 50 },
    ]);
  });

  it('bounds repeated phase storage and ignores nonmatching measures', () => {
    const collector = createPhaseCollector(0);
    collector.collect([
      { entryType: 'mark', name: 'startup:authenticate:start', startTime: 5 },
      {
        entryType: 'measure',
        name: 'authenticate',
        startTime: 6,
        duration: 10,
      },
      {
        entryType: 'measure',
        name: 'authenticate',
        startTime: 5,
        duration: 10,
      },
      { entryType: 'mark', name: 'startup:authenticate:start', startTime: 30 },
      {
        entryType: 'measure',
        name: 'authenticate',
        startTime: 30,
        duration: 20,
      },
    ]);
    expect(collector.snapshot()).toEqual([
      { name: 'authenticate', startMs: 5, durationMs: 10 },
    ]);
  });

  it('reports initialization boundary without summing nested phases or idle time', () => {
    const summary = summarizeProfiles([
      {
        schemaVersion: 1,
        pid: 2,
        ppid: 1,
        entrypoint: 'cli',
        processStartMs: 100,
        sessionDurationMs: 100000,
        secret: 'private token',
        phases: [
          { name: 'cli_startup', startMs: 120, durationMs: 50 },
          {
            name: 'authenticate',
            startMs: 125,
            durationMs: 40,
            detail: 'private',
          },
        ],
      },
    ]);
    expect(summary).toMatchObject({
      launchToCliMainMs: 120,
      preMainMs: 20,
      cliStartupEndMs: 170,
    });
    expect(JSON.stringify(summary)).not.toContain('private');
    expect(summary.processes[0].phases).toHaveLength(2);
  });

  it('does not replace missing initialization with process lifetime', () => {
    expect(
      summarizeProfiles([
        {
          schemaVersion: 1,
          pid: 2,
          ppid: 1,
          entrypoint: 'cli',
          processStartMs: 100,
          sessionDurationMs: 100000,
          phases: [],
        },
      ]),
    ).not.toHaveProperty('cliStartupEndMs');
  });

  it('skips damaged records while retaining healthy process timings', () => {
    expect(
      summarizeProfiles([
        null,
        {
          schemaVersion: 1,
          pid: 2,
          ppid: 1,
          entrypoint: 'cli',
          processStartMs: 100,
          phases: [null, { name: 'cli_startup', startMs: 120, durationMs: 50 }],
        },
      ]).cliStartupEndMs,
    ).toBe(170);
  });

  it('recognizes launch paths without exposing or accepting arbitrary entrypoints', () => {
    expect(
      getProcessLabel(join(projectRoot, 'packages/cli'), '', projectRoot),
    ).toBe('cli');
    expect(
      getProcessLabel(
        '/private/npm-cli.js',
        '/private/npm-cli.js',
        projectRoot,
      ),
    ).toBe('npm');
    expect(
      getProcessLabel('/private/start.js', '', projectRoot),
    ).toBeUndefined();
    expect(getProcessLabel('/private/mcp.js', '', projectRoot)).toBeUndefined();
  });
});

describe('npm start profiling wrapper', () => {
  let temporary;
  let npmEntrypoint;
  let output;
  let messages;

  beforeEach(() => {
    temporary = mkdtempSync(join(tmpdir(), 'gemini-startup-profile-test-'));
    npmEntrypoint = join(temporary, 'npm-cli.cjs');
    messages = '';
    output = { write: (value) => (messages += value) };
    vi.stubEnv('npm_execpath', npmEntrypoint);
    vi.stubEnv('GEMINI_STARTUP_PROFILE_DIR', join(temporary, 'profiles'));
    vi.stubEnv('GEMINI_STARTUP_PROFILE_RUN_DIR', '');
    vi.stubEnv('NODE_OPTIONS', '--no-warnings');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(temporary, { recursive: true, force: true });
  });

  const fakeNpm = (source) => writeFileSync(npmEntrypoint, source);
  const profileDirectory = () => {
    const parent = join(temporary, 'profiles');
    return join(parent, readdirSync(parent)[0]);
  };

  it('forwards literal arguments and auth environment, preserving options and exit code', async () => {
    const captured = join(temporary, 'captured.json');
    vi.stubEnv('GEMINI_API_KEY', 'private-token');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'private-project');
    vi.stubEnv('GEMINI_TEST_CAPTURE', captured);
    fakeNpm(`
      const fs = require('node:fs');
      const { performance } = require('node:perf_hooks');
      fs.writeFileSync(process.env.GEMINI_TEST_CAPTURE, JSON.stringify({
        args: process.argv.slice(2),
        key: process.env.GEMINI_API_KEY,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        options: process.env.NODE_OPTIONS,
      }));
      performance.mark('startup:cli_startup:start', { detail: 'private prompt' });
      performance.mark('startup:cli_startup:end');
      performance.measure('cli_startup', 'startup:cli_startup:start', 'startup:cli_startup:end');
      process.exit(7);
    `);
    const args = ['--model', 'literal $(echo secret)', 'space and "quote"'];
    expect(await runStartupProfile({ args, output })).toBe(7);
    const forwarded = JSON.parse(readFileSync(captured, 'utf8'));
    expect(forwarded.args).toEqual(['start', '--', ...args]);
    expect(forwarded).toMatchObject({
      key: 'private-token',
      project: 'private-project',
    });
    expect(forwarded.options).toMatch(/^--no-warnings --import=data:/);
    expect(process.env.NODE_OPTIONS).toBe('--no-warnings');
    const directory = profileDirectory();
    const reports = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readFileSync(join(directory, name), 'utf8'))
      .join('');
    expect(reports).not.toContain('private');
    expect(reports).not.toContain('literal');
    const summary = JSON.parse(
      readFileSync(join(directory, 'summary.json'), 'utf8'),
    );
    expect(summary.processes[0].phases[0].startMs).toBeGreaterThan(0);
    expect(summary.processes[0].phases[0].name).toBe('cli_startup');
    expect(summary).not.toHaveProperty('cliStartupEndMs');
  });

  it('continues normal npm start if report storage cannot be created', async () => {
    const unavailable = join(temporary, 'regular-file');
    writeFileSync(unavailable, 'file');
    vi.stubEnv('GEMINI_STARTUP_PROFILE_DIR', join(unavailable, 'profiles'));
    fakeNpm(
      'process.exit(process.env.NODE_OPTIONS === "--no-warnings" ? 9 : 99);',
    );
    expect(await runStartupProfile({ args: [], output })).toBe(9);
    expect(messages).toContain('Cannot create reports');
  });

  it('preserves CLI failure when final report writing fails', async () => {
    fakeNpm(`
      require('node:fs').rmSync(process.env.GEMINI_STARTUP_PROFILE_RUN_DIR, { recursive: true });
      process.exit(11);
    `);
    expect(await runStartupProfile({ args: [], output })).toBe(11);
    expect(messages).toContain('Could not write the timing summary');
  });

  it('does not claim initialization was measured for a version-only exit', async () => {
    fakeNpm('process.exit(0);');
    expect(await runStartupProfile({ args: ['--version'], output })).toBe(0);
    expect(messages).toContain('No completed cli_startup phase');
    const summary = JSON.parse(
      readFileSync(join(profileDirectory(), 'summary.json'), 'utf8'),
    );
    expect(summary).not.toHaveProperty('cliStartupEndMs');
  });

  it('preserves npm launcher failure instead of treating it as success', async () => {
    vi.stubEnv('npm_execpath', join(temporary, 'does-not-exist.cjs'));
    expect(await runStartupProfile({ args: [], output })).toBe(1);
  });

  it.skipIf(process.platform === 'win32')(
    'preserves signal-derived child exit status',
    async () => {
      fakeNpm('process.kill(process.pid, "SIGTERM");');
      expect(await runStartupProfile({ args: [], output })).toBe(143);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'waits for foreground-group shutdown and writes a summary',
    async () => {
      fakeNpm(
        'process.stderr.write("FAKE_NPM_READY\\n"); setInterval(() => {}, 1000);',
      );
      const child = spawn(process.execPath, [wrapper], {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: process.env,
      });
      let stderr = '';
      const closed = new Promise((resolveClosed) =>
        child.once('close', (code) => resolveClosed(code)),
      );
      let deadline;
      const timedOut = new Promise((_resolveUnused, reject) => {
        deadline = setTimeout(
          () =>
            reject(new Error('Signal fixture did not start or stop in time')),
          3000,
        );
        child.once('error', reject);
      });
      try {
        const ready = new Promise((resolveReady) => {
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
            if (stderr.includes('FAKE_NPM_READY')) resolveReady();
          });
        });
        await Promise.race([ready, timedOut]);
        process.kill(-child.pid, 'SIGTERM');
        expect(await Promise.race([closed, timedOut])).toBe(143);
        expect(stderr).toContain('Summary:');
        expect(readdirSync(profileDirectory())).toContain('summary.json');
      } finally {
        clearTimeout(deadline);
        // Keep this fixture's process group isolated and clean up on assertion
        // failure as well as success. ESRCH means the group has already exited.
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          // The group normally exits before this best-effort cleanup.
        }
      }
    },
  );

  it('allows sandbox startup when the host preload is unavailable or profiling env absent', () => {
    const missing = pathToFileURL(join(temporary, 'unavailable.js')).href;
    const option = getPreloadOption(missing);
    for (const active of ['', temporary]) {
      const result = spawnSync(process.execPath, ['-e', 'process.exit(13)'], {
        env: {
          ...process.env,
          NODE_OPTIONS: option,
          GEMINI_STARTUP_PROFILE_RUN_DIR: active,
        },
      });
      expect(result.status).toBe(13);
      expect(result.stderr.toString()).toBe('');
    }
  });

  it('captures timings when the preload path has spaces, quotes, and URL characters', () => {
    const fixture = join(
      temporary,
      process.platform === 'win32'
        ? "profile 'quoted' directory #"
        : 'profile "quoted" directory #',
    );
    const scripts = join(fixture, 'scripts');
    const directory = join(fixture, 'reports');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(directory);
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
    for (const name of ['startup-profile-preload.js', 'startup-profile.js']) {
      copyFileSync(join(projectRoot, 'scripts', name), join(scripts, name));
    }
    fakeNpm(`
      const { performance } = require('node:perf_hooks');
      performance.mark('startup:load_settings:start');
      performance.mark('startup:load_settings:end');
      performance.measure('load_settings', 'startup:load_settings:start', 'startup:load_settings:end');
      process.exit(17);
    `);
    const result = spawnSync(process.execPath, [npmEntrypoint], {
      env: {
        ...process.env,
        NODE_OPTIONS: getPreloadOption(
          pathToFileURL(join(scripts, 'startup-profile-preload.js')).href,
        ),
        GEMINI_STARTUP_PROFILE_RUN_DIR: directory,
        GEMINI_STARTUP_PROFILE_LAUNCH_TIME: String(Date.now()),
      },
    });
    expect(result.status).toBe(17);
    expect(result.stderr.toString()).toBe('');
    const record = JSON.parse(
      readFileSync(join(directory, readdirSync(directory)[0]), 'utf8'),
    );
    expect(record.phases[0].name).toBe('load_settings');
    expect(record.phases[0].startMs).toBeGreaterThan(0);
  });

  it('does not record unrelated Node tools or worker threads', async () => {
    const directory = join(temporary, 'process-reports');
    mkdirSync(directory);
    const tool = join(temporary, 'tool.cjs');
    writeFileSync(tool, 'process.exit(0);');
    const result = spawnSync(process.execPath, ['--import', preload, tool], {
      env: {
        ...process.env,
        GEMINI_STARTUP_PROFILE_RUN_DIR: directory,
        GEMINI_STARTUP_PROFILE_LAUNCH_TIME: String(Date.now()),
      },
    });
    expect(result.status).toBe(0);
    expect(readdirSync(directory)).toEqual([]);
    // Also exercise recognized npm plus a worker with shared PID.
    fakeNpm(`
      const { Worker } = require('node:worker_threads');
      const worker = new Worker('process.exit(0)', { eval: true });
      worker.on('exit', () => process.exit(0));
    `);
    expect(await runStartupProfile({ args: [], output })).toBe(0);
    const files = readdirSync(profileDirectory());
    expect(
      files.filter((name) => /^process-\d+\.json$/.test(name)),
    ).toHaveLength(1);
    expect(files).not.toContain('undefined');
  });
});
