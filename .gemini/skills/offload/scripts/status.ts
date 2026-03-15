/**
 * Offload Status Inspector (Remote)
 * 
 * Scans tmux sessions (host) and logs (container) to provide job status.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKTREE_BASE = '/home/node/dev/worktrees';

function getStatus() {
  console.log('\n🛰️  Offload Mission Control Status (Container Mode):');
  console.log(''.padEnd(100, '-'));
  console.log(`${'JOB ID'.padEnd(10)} | ${'ACTION'.padEnd(10)} | ${'STATE'.padEnd(12)} | ${'SESSION'.padEnd(25)}`);
  console.log(''.padEnd(100, '-'));

  // 1. Get active tmux sessions on the HOST
  const tmux = spawnSync('tmux', ['ls', '-F', '#{session_name}']);
  const activeSessions = tmux.stdout.toString().split('\n').filter(s => s.startsWith('offload-'));

  // 2. Scan worktrees inside the CONTAINER
  const findJobs = spawnSync('docker', ['exec', 'maintainer-worker', 'ls', WORKTREE_BASE], { stdio: 'pipe' });
  const jobs = findJobs.stdout.toString().split('\n').filter(d => d.startsWith('offload-'));

  if (jobs.length === 0 && activeSessions.length === 0) {
    console.log('   No jobs found.');
    return;
  }

  const allJobIds = Array.from(new Set([...jobs, ...activeSessions]));

  allJobIds.forEach(id => {
    if (!id) return;
    const parts = id.split('-'); // offload-123-review
    const pr = parts[1] || '???';
    const action = parts[2] || '???';
    
    let state = '💤 IDLE';
    if (activeSessions.includes(id)) {
      state = '🏃 RUNNING';
    } else {
      // Check logs inside the container
      const logCheck = spawnSync('docker', ['exec', 'maintainer-worker', 'sh', '-c', `ls ${WORKTREE_BASE}/${id}/.gemini/logs/*.log 2>/dev/null | tail -n 1`], { stdio: 'pipe' });
      const lastLogFile = logCheck.stdout.toString().trim();
      
      if (lastLogFile) {
          const logContent = spawnSync('docker', ['exec', 'maintainer-worker', 'cat', lastLogFile], { stdio: 'pipe' }).stdout.toString();
          if (logContent.includes('SUCCESS')) state = '✅ SUCCESS';
          else if (logContent.includes('FAILED')) state = '❌ FAILED';
          else state = '🏁 FINISHED';
      }
    }

    console.log(`${pr.padEnd(10)} | ${action.padEnd(10)} | ${state.padEnd(12)} | ${id.padEnd(25)}`);
    if (state === '🏃 RUNNING') {
        console.log(`           ├─ Attach: npm run offload:attach ${pr} ${action} [--local]`);
        console.log(`           ├─ Logs:   npm run offload:logs ${pr} ${action}`);
    }
    console.log(`           └─ Remove: npm run offload:remove ${pr} ${action}`);
  });
  console.log(''.padEnd(100, '-'));
}

getStatus();
