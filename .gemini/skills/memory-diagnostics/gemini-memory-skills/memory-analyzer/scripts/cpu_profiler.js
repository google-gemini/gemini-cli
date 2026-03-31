#!/usr/bin/env node
/**
 * cpu_profiler.js
 * Records a CPU profile from a running Node.js process via CDP.
 *
 * Usage:
 *   node cpu_profiler.js --port 9229 --duration 10000
 *   node cpu_profiler.js --script <path> --duration 15000
 *
 * Output:
 *   - profile-<timestamp>.cpuprofile (loadable in Chrome DevTools)
 *   - profile-<timestamp>.txt (human-readable top functions report)
 */

import { createConnection } from 'net';
import { writeFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};

const port = parseInt(getArg('--port', '9229'), 10);
const script = getArg('--script', null);
const duration = parseInt(getArg('--duration', '10000'), 10);
const outputDir = getArg('--output', process.cwd());

async function waitForPort(host, port, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = createConnection({ host, port });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) reject(new Error(`Timeout: port ${port}`));
        else setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

async function getWsUrl(port) {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    http.default.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const t = targets.find(t => t.webSocketDebuggerUrl);
          t ? resolve(t.webSocketDebuggerUrl) : reject(new Error('No target'));
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function cdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off('message', handler);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { ws.off('message', handler); reject(new Error(`Timeout: ${method}`)); }, duration + 10000);
  });
}

function analyzeProfile(profile) {
  // Flatten call tree into samples
  const nodeMap = new Map();

  function indexNodes(node) {
    nodeMap.set(node.id, node);
    if (node.children) node.children.forEach(indexNodes);
  }
  indexNodes(profile.head);

  // Count self hits per function
  const selfHits = new Map();
  const totalHits = new Map();

  function countHits(node, depth = 0) {
    const key = `${node.callFrame.functionName || '(anonymous)'}|${node.callFrame.url}:${node.callFrame.lineNumber}`;
    selfHits.set(key, (selfHits.get(key) || 0) + (node.hitCount || 0));

    if (node.children) {
      let childHits = 0;
      for (const child of node.children) {
        countHits(child, depth + 1);
        const childKey = `${child.callFrame.functionName || '(anonymous)'}|${child.callFrame.url}:${child.callFrame.lineNumber}`;
        childHits += selfHits.get(childKey) || 0;
      }
    }
  }
  countHits(profile.head);

  // Also count from samples array if available
  const sampleCounts = new Map();
  if (profile.samples) {
    for (const nodeId of profile.samples) {
      const node = nodeMap.get(nodeId);
      if (node) {
        const key = `${node.callFrame.functionName || '(anonymous)'}|${node.callFrame.url}:${node.callFrame.lineNumber}`;
        sampleCounts.set(key, (sampleCounts.get(key) || 0) + 1);
      }
    }
  }

  const totalSamples = profile.samples?.length || 1;

  const topFunctions = [...(sampleCounts.size > 0 ? sampleCounts : selfHits).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([key, count]) => {
      const [nameAndFile] = key.split('|');
      const [, file] = key.split('|');
      return {
        name: nameAndFile,
        file: file || '',
        count,
        pct: ((count / totalSamples) * 100).toFixed(1),
      };
    });

  return { topFunctions, totalSamples, durationMs: profile.endTime - profile.startTime };
}

function fmtProfile(analysis, profilePath) {
  const lines = [];
  lines.push('═'.repeat(70));
  lines.push('  CPU PROFILE ANALYSIS');
  lines.push('═'.repeat(70));
  lines.push(`  Profile file   : ${path.basename(profilePath)}`);
  lines.push(`  Duration       : ${(analysis.durationMs / 1000).toFixed(2)}s`);
  lines.push(`  Total samples  : ${analysis.totalSamples.toLocaleString()}`);
  lines.push('');
  lines.push('─'.repeat(70));
  lines.push('  TOP 20 FUNCTIONS BY CPU TIME (self samples)');
  lines.push('─'.repeat(70));
  lines.push(`  ${'Function'.padEnd(40)} ${'Samples'.padStart(8)}  ${'CPU %'.padStart(7)}`);
  lines.push(`  ${'─'.repeat(40)} ${'─'.repeat(8)}  ${'─'.repeat(7)}`);

  for (const fn of analysis.topFunctions.slice(0, 20)) {
    const name = fn.name.slice(0, 38).padEnd(40);
    lines.push(`  ${name} ${String(fn.count).padStart(8)}  ${String(fn.pct + '%').padStart(7)}`);
    if (fn.file) {
      const shortFile = fn.file.replace(/.*node_modules\//, 'nm/').slice(0, 65);
      lines.push(`    ${shortFile}`);
    }
  }

  lines.push('');
  lines.push('─'.repeat(70));
  lines.push('  HOTSPOT ANALYSIS');
  lines.push('─'.repeat(70));

  const hot = analysis.topFunctions.filter(f => parseFloat(f.pct) > 5);
  if (hot.length === 0) {
    lines.push('  No single hotspot dominates CPU time (healthy spread)');
  } else {
    for (const f of hot) {
      lines.push(`  "${f.name}" consumes ${f.pct}% of CPU time`);
      if (f.file.includes('node_modules')) {
        lines.push(`     → In dependency: ${f.file.replace(/.*node_modules\//, '').split('/')[0]}`);
      }
    }
  }
  lines.push('═'.repeat(70));
  return lines.join('\n');
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  NODE.JS CPU PROFILER');
  console.log('═'.repeat(60));
  console.log(`  Duration : ${duration}ms`);
  console.log(`  Port     : ${port}`);

  let childProcess = null;

  if (script) {
    console.log(`\n Starting: node --inspect=${port} ${script}`);
    childProcess = spawn(process.execPath, [`--inspect=${port}`, script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    childProcess.stderr.on('data', d => {
      if (!d.toString().includes('Debugger')) process.stderr.write(`[app] ${d}`);
    });
  }

  await waitForPort('127.0.0.1', port);

  const { default: WebSocket } = await import('ws').catch(async () => {
    execSync('npm install ws --no-save', { stdio: 'inherit' });
    return import('ws');
  });

  const wsUrl = await getWsUrl(port);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

  console.log(' Connected\n');
  await cdp(ws, 'Profiler.enable');
  await cdp(ws, 'Profiler.setSamplingInterval', { interval: 100 }); // 100µs

  console.log(` Recording CPU profile for ${duration}ms...`);
  await cdp(ws, 'Profiler.start');

  // Progress bar
  const start = Date.now();
  const bar = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.min(100, Math.round((elapsed / duration) * 100));
    const filled = Math.round(pct / 2);
    process.stdout.write(`\r  [${"#".repeat(filled)}${'░'.repeat(50 - filled)}] ${pct}%`);
  }, 200);

  await new Promise(r => setTimeout(r, duration));
  clearInterval(bar);
  process.stdout.write('\n');

  console.log('\n  Stopping profiler...');
  const result = await cdp(ws, 'Profiler.stop');
  ws.close();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const profilePath = path.join(outputDir, `profile-${timestamp}.cpuprofile`);
  const reportPath = path.join(outputDir, `profile-report-${timestamp}.txt`);

  writeFileSync(profilePath, JSON.stringify(result.profile, null, 2));
  console.log(`\n Profile saved: ${profilePath}`);

  const analysis = analyzeProfile(result.profile);
  const report = fmtProfile(analysis, profilePath);
  console.log('\n' + report);

  writeFileSync(reportPath, report);
  console.log(` Report saved: ${reportPath}`);
  console.log('\nTo view visually:');
  console.log('  Chrome DevTools → Performance tab → Load profile');

  if (childProcess) childProcess.kill();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
