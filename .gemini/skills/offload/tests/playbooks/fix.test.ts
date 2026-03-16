import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import { runFixPlaybook } from '../../scripts/playbooks/fix.ts';

vi.mock('child_process');
vi.mock('fs');

describe('Fix Playbook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
  });

  it('should launch the agentic fix-pr skill via spawnSync', async () => {
    const status = await runFixPlaybook('123', '/tmp/target', '/path/policy', '/path/gemini');
    
    expect(status).toBe(0);
    const spawnCalls = vi.mocked(spawnSync).mock.calls;
    
    expect(spawnCalls.some(c => JSON.stringify(c).includes("activate the 'fix-pr' skill"))).toBe(true);
  });
});
