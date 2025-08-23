/**
 * vitest unit tests for sandbox parsing and safe spawn helpers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child from 'node:child_process';

// import named helpers for testing
import {
  parseAndFilterSandboxEnv,
  buildSafeEnv,
  parseCommandString,
  safeSpawnProxy,
  validateSandboxMounts,
} from './sandbox_helpers.js';

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(() => {
      return { on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, pid: 12345 };
    }),
  };
});

describe('sandbox_helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // clear env changes between tests
    delete process.env['GEMINI_SANDBOX_PROXY_COMMAND'];
    delete process.env['SANDBOX_ENV'];
  });

  it('parseCommandString respects quoted tokens', () => {
    const s = '/usr/bin/socat "TCP-LISTEN:9999,bind=127.0.0.1,reuseaddr" -';
    const tokens = parseCommandString(s);
    expect(tokens[0]).toBe('/usr/bin/socat');
    expect(tokens[1]).toBe('TCP-LISTEN:9999,bind=127.0.0.1,reuseaddr');
    expect(tokens[2]).toBe('-');
  });

  it('parseAndFilterSandboxEnv rejects dangerous values', () => {
    const raw = 'GOOD=hello,EVIL=1;rm -rf /,BAD2=`echo hi`,EMPTY=,VALID2=ok.value';
    const parsed = parseAndFilterSandboxEnv(raw);
    expect(parsed).toHaveProperty('GOOD');
    expect(parsed['GOOD']).toBe('hello');
    expect(parsed).not.toHaveProperty('EVIL');
    expect(parsed).not.toHaveProperty('BAD2');
    expect(parsed).not.toHaveProperty('EMPTY'); // empty values are treated as absent
    expect(parsed).toHaveProperty('VALID2');
    expect(parsed['VALID2']).toBe('ok.value');
  });

  it('buildSafeEnv drops dangerous parent env vars', () => {
    const parent = {
      PATH: '/usr/bin',
      LD_PRELOAD: '/tmp/mal.so',
      IFS: ';',
      LANG: 'en_US.UTF-8',
      HOME: '/home/test',
      SANDBOX_ENV: 'S1=one,GOOD=ok',
    } as NodeJS.ProcessEnv;
    const safe = buildSafeEnv(parent);
    expect(safe['PATH']).toBeDefined();
    expect(safe['LANG']).toBe('en_US.UTF-8');
    expect(safe['HOME']).toBe('/home/test');
    expect((safe as any).LD_PRELOAD).toBeUndefined();
    expect((safe as any).IFS).toBeUndefined();
    expect(safe['S1']).toBe('one');
    expect(safe['GOOD']).toBe('ok');
  });

  it('safeSpawnProxy spawns with shell:false and tokenized args for plain string', () => {
    process.env['GEMINI_SANDBOX_PROXY_COMMAND'] = '/usr/bin/socat "ARG WITH SPACE" -';
    const cp = safeSpawnProxy();
    // spawn must have been called
    expect((child as any).spawn).toHaveBeenCalled();
    const call = (child as any).spawn.mock.calls[0];
    const [cmd, args, opts] = call;
    expect(cmd).toBe('/usr/bin/socat');
    expect(Array.isArray(args)).toBe(true);
    expect(args[0]).toBe('ARG WITH SPACE');
    expect(opts && opts.shell).toBe(false);
    // cp should be returned (mock)
    expect(cp).toBeDefined();
  });

  it('safeSpawnProxy accepts JSON array form', () => {
    process.env['GEMINI_SANDBOX_PROXY_COMMAND'] = '["/usr/bin/echo", "hello", "world"]';
    const cp = safeSpawnProxy();
    expect((child as any).spawn).toHaveBeenCalled();
    const [cmd, args, opts] = (child as any).spawn.mock.calls[0];
    expect(cmd).toBe('/usr/bin/echo');
    expect(args).toEqual(['hello', 'world']);
    expect(opts.shell).toBe(false);
    expect(cp).toBeDefined();
  });
});

describe('Information Disclosure Prevention', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear sensitive environment variables between tests
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['SANDBOX_ENV'];
  });

  it('filters sensitive environment variables from SANDBOX_ENV', () => {
    const raw = 'SAFE_VAR=hello,GEMINI_API_KEY=secret123,GOOGLE_API_KEY=secret456,ANOTHER_SAFE=test';
    const parsed = parseAndFilterSandboxEnv(raw);
    expect(parsed).toHaveProperty('SAFE_VAR');
    expect(parsed).toHaveProperty('ANOTHER_SAFE');
    expect(parsed).not.toHaveProperty('GEMINI_API_KEY');
    expect(parsed).not.toHaveProperty('GOOGLE_API_KEY');
    expect(parsed.SAFE_VAR).toBe('hello');
    expect(parsed.ANOTHER_SAFE).toBe('test');
  });

  it('filters sensitive environment variables with pattern matching', () => {
    const raw = 'USER_TOKEN=abc123,PASSWORD=secret,DATABASE_URL=postgres://...';
    const parsed = parseAndFilterSandboxEnv(raw);
    expect(parsed).not.toHaveProperty('USER_TOKEN');
    expect(parsed).not.toHaveProperty('PASSWORD');
    expect(parsed).not.toHaveProperty('DATABASE_URL');
  });

  it('buildSafeEnv filters sensitive parent environment variables', () => {
    const parent = {
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
      GEMINI_API_KEY: 'secret-key-123',
      GOOGLE_API_KEY: 'google-secret-456',
      AWS_ACCESS_KEY_ID: 'aws-key',
      GITHUB_TOKEN: 'github-token',
      SAFE_VAR: 'this-is-safe',
    } as NodeJS.ProcessEnv;

    const safe = buildSafeEnv(parent);

    // Safe variables should be preserved
    expect(safe.PATH).toBeDefined();
    expect(safe.LANG).toBe('en_US.UTF-8');

    // Sensitive variables should be filtered out
    expect((safe as any).GEMINI_API_KEY).toBeUndefined();
    expect((safe as any).GOOGLE_API_KEY).toBeUndefined();
    expect((safe as any).AWS_ACCESS_KEY_ID).toBeUndefined();
    expect((safe as any).GITHUB_TOKEN).toBeUndefined();
  });

  it('validateSandboxMounts allows only safe paths', () => {
    const mounts = '/usr/bin,/tmp,/home/user/secret,/etc/passwd,/bin';
    const validMounts = validateSandboxMounts(mounts);

    expect(validMounts).toContain('/usr/bin');
    expect(validMounts).toContain('/tmp');
    expect(validMounts).toContain('/bin');
    expect(validMounts).not.toContain('/home/user/secret');
    expect(validMounts).not.toContain('/etc/passwd');
  });

  it('validateSandboxMounts handles complex mount specifications', () => {
    const mounts = '/usr/bin:/usr/bin:ro,/tmp:/tmp:rw,/unsafe/path:/unsafe';
    const validMounts = validateSandboxMounts(mounts);

    expect(validMounts).toContain('/usr/bin:/usr/bin:ro');
    expect(validMounts).toContain('/tmp:/tmp:rw');
    expect(validMounts).not.toContain('/unsafe/path:/unsafe');
  });

  it('validateSandboxMounts returns empty array for undefined input', () => {
    const validMounts = validateSandboxMounts(undefined);
    expect(validMounts).toEqual([]);
  });

  it('validateSandboxMounts normalizes Windows paths', () => {
    const mounts = 'C:\\Windows\\System32';
    const validMounts = validateSandboxMounts(mounts);
    expect(validMounts).toEqual([]); // Should be filtered out
  });

  it('buildSafeEnv preserves essential system variables', () => {
    const parent = {
      PATH: '/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      HOME: '/home/user',
      TERM: 'xterm-256color',
      SHELL: '/bin/bash',
      USER: 'testuser',
      LOGNAME: 'testuser',
      LC_ALL: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
    } as NodeJS.ProcessEnv;

    const safe = buildSafeEnv(parent);

    expect(safe.PATH).toBe('/usr/bin:/bin');
    expect(safe.LANG).toBe('en_US.UTF-8');
    expect(safe.HOME).toBe('/home/user');
    expect(safe.TERM).toBe('xterm-256color');
    expect(safe.SHELL).toBe('/bin/bash');
    expect(safe.USER).toBe('testuser');
    expect(safe.LOGNAME).toBe('testuser');
    expect(safe.LC_ALL).toBe('en_US.UTF-8');
    expect(safe.LC_CTYPE).toBe('UTF-8');
  });

  it('buildSafeEnv filters out dangerous environment variables', () => {
    const parent = {
      PATH: '/usr/bin',
      LD_PRELOAD: '/tmp/mal.so',
      BASH_ENV: '/tmp/bash_env',
      ENV: '/tmp/env',
      IFS: ':',
      NODE_OPTIONS: '--inspect',
    } as NodeJS.ProcessEnv;

    const safe = buildSafeEnv(parent);

    expect(safe.PATH).toBeDefined();
    expect((safe as any).LD_PRELOAD).toBeUndefined();
    expect((safe as any).BASH_ENV).toBeUndefined();
    expect((safe as any).ENV).toBeUndefined();
    expect((safe as any).IFS).toBeUndefined();
    expect((safe as any).NODE_OPTIONS).toBeUndefined();
  });
});
