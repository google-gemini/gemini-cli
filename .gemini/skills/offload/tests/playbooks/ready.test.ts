import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import { runReadyPlaybook } from '../../scripts/playbooks/ready.ts';

vi.mock('child_process');
vi.mock('fs');

describe('Ready Playbook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined as any);
    vi.mocked(fs.createWriteStream).mockReturnValue({ pipe: vi.fn() } as any);
    
    vi.mocked(spawn).mockImplementation(() => {
        return {
            stdout: { pipe: vi.fn(), on: vi.fn() },
            stderr: { pipe: vi.fn(), on: vi.fn() },
            on: vi.fn((event, cb) => { if (event === 'close') cb(0); })
        } as any;
    });
  });

  it('should register and run clean, preflight, and conflict checks', async () => {
    runReadyPlaybook('123', '/tmp/target', '/path/policy', '/path/gemini');
    
    const spawnCalls = vi.mocked(spawn).mock.calls;
    
    expect(spawnCalls.some(c => c[0].includes('npm run clean'))).toBe(true);
    expect(spawnCalls.some(c => c[0].includes('git fetch origin main'))).toBe(true);
  });
});
