import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import { runFixPlaybook } from '../../scripts/playbooks/fix.ts';

vi.mock('child_process');
vi.mock('fs');

describe('Fix Playbook', () => {
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

  it('should register and run initial build, failure analysis, and fixer', async () => {
    runFixPlaybook('123', '/tmp/target', '/path/policy', '/path/gemini');
    
    const spawnCalls = vi.mocked(spawn).mock.calls;
    
    expect(spawnCalls.some(c => c[0].includes('npm ci'))).toBe(true);
    expect(spawnCalls.some(c => c[0].includes('gh run view --log-failed'))).toBe(true);
    expect(spawnCalls.some(c => c[0].includes('Gemini Fixer'))).toBe(false); // Should wait for build
  });
});
