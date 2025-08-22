/**
 * vitest unit tests for sandbox parsing and safe spawn helpers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child from 'node:child_process';

// import named helpers for testing
import {
  parseAndFilterSandboxEnv,
  buildSafeEnv,
  parseCommandString,
  safeSpawnProxy,
} from './sandbox_helpers';

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
    delete process.env.GEMINI_SANDBOX_PROXY_COMMAND;
    delete process.env.SANDBOX_ENV;
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
    expect(parsed.GOOD).toBe('hello');
    expect(parsed).not.toHaveProperty('EVIL');
    expect(parsed).not.toHaveProperty('BAD2');
    expect(parsed).not.toHaveProperty('EMPTY'); // empty values are treated as absent
    expect(parsed).toHaveProperty('VALID2');
    expect(parsed.VALID2).toBe('ok.value');
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
    expect(safe.PATH).toBeDefined();
    expect(safe.LANG).toBe('en_US.UTF-8');
    expect(safe.HOME).toBe('/home/test');
    expect((safe as any).LD_PRELOAD).toBeUndefined();
    expect((safe as any).IFS).toBeUndefined();
    expect(safe.S1).toBe('one');
    expect(safe.GOOD).toBe('ok');
  });

  it('safeSpawnProxy spawns with shell:false and tokenized args for plain string', () => {
    process.env.GEMINI_SANDBOX_PROXY_COMMAND = '/usr/bin/socat "ARG WITH SPACE" -';
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
    process.env.GEMINI_SANDBOX_PROXY_COMMAND = '["/usr/bin/echo", "hello", "world"]';
    const cp = safeSpawnProxy();
    expect((child as any).spawn).toHaveBeenCalled();
    const [cmd, args, opts] = (child as any).spawn.mock.calls[0];
    expect(cmd).toBe('/usr/bin/echo');
    expect(args).toEqual(['hello', 'world']);
    expect(opts.shell).toBe(false);
    expect(cp).toBeDefined();
  });
});
