/**
 * Offload Status Inspector (Remote)
 * 
 * Scans tmux sessions and logs to provide a real-time status of offload jobs.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKTREE_BASE = path.join(os.homedir(), 'dev/worktrees');

function getStatus() {
  console.log('\n🛰️  Offload Mission Control Status:');
  console.log(''.padEnd(80, '-'));
  console.log(`${'JOB ID'.padEnd(10)} | ${'ACTION'.padEnd(10)} | ${'STATE'.padEnd(12)} | ${'SESSION'.padEnd(25)}`);
  console.log(''.padEnd(80, '-'));

  // 1. Get active tmux sessions
  const tmux = spawnSync('tmux', ['ls', '-F', '#{session_name}']);
  const activeSessions = tmux.stdout.toString().split('\n').filter(s => s.startsWith('offload-'));

  // 2. Scan worktrees for job history
  if (!fs.existsSync(WORKTREE_BASE)) {
    console.log('   No jobs found.');
    return;
  }

  const jobs = fs.readdirSync(WORKTREE_BASE).filter(d => d.startsWith('offload-'));

  if (jobs.length === 0 && activeSessions.length === 0) {
    console.log('   No jobs found.');
    return;
  }

  const allJobIds = new Set([...jobs, ...activeSessions.map(s => s)]);

  allJobIds.forEach(id => {
    const parts = id.split('-'); // offload-123-review
    const pr = parts[1] || '???';
    const action = parts[2] || '???';
    
    let state = '💤 IDLE';
    if (activeSessions.includes(id)) {
      state = '🏃 RUNNING';
    } else {
      // Check logs for final state
      const logDir = path.join(WORKTREE_BASE, id, '.gemini/logs');
      if (fs.existsSync(logDir)) {
          const logFiles = fs.readdirSync(logDir).sort();
          if (logFiles.length > 0) {
              const lastLog = fs.readFileSync(path.join(logDir, logFiles[logFiles.length - 1]), 'utf8');
              if (lastLog.includes('SUCCESS')) state = '✅ SUCCESS';
              else if (lastLog.includes('FAILED')) state = '❌ FAILED';
              else state = '🏁 FINISHED';
          }
      }
    }

    console.log(`${pr.padEnd(10)} | ${action.padEnd(10)} | ${state.padEnd(12)} | ${id.padEnd(25)}`);
    if (state === '🏃 RUNNING') {
        console.log(`           └─ Attach: npm run offload:attach ${pr} ${action} [--local]`);
        console.log(`           └─ Logs:   npm run offload:logs ${pr} ${action}`);
    }
  });
  console.log(''.padEnd(80, '-'));
}

getStatus();
