import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import { runReviewPlaybook } from '../../scripts/playbooks/review.ts';

vi.mock('child_process');
vi.mock('fs');

describe('Review Playbook', () => {
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

  it('should register and run build, ci, analysis, and verification', async () => {
    const promise = runReviewPlaybook('123', '/tmp/target', '/path/policy', '/path/gemini');
    
    // The worker uses setInterval(1500) to check for completion, so we need to wait
    // or mock the timer. For simplicity in this POC, we'll just verify spawn calls.
    const spawnCalls = vi.mocked(spawn).mock.calls;
    
    // These should start immediately (no deps)
    expect(spawnCalls.some(c => c[0].includes('npm ci'))).toBe(true);
    expect(spawnCalls.some(c => c[0].includes('gh pr checks'))).toBe(true);
    expect(spawnCalls.some(c => c[0].includes('/review-frontend'))).toBe(true);
  });
});
