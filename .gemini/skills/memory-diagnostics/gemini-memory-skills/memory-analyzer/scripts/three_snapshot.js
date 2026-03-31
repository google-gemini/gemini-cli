#!/usr/bin/env node
/**
 * three_snapshot.js
 * Automates the 3-snapshot leak detection technique.
 *
 * Usage:
 *   node three_snapshot.js --port 9229 --interval 5000
 *   node three_snapshot.js --script <path> --interval 3000
 *
 * The 3-snapshot technique:
 *   1. Snapshot A (baseline)
 *   2. Wait / perform action
 *   3. Snapshot B
 *   4. Wait / perform action again
 *   5. Snapshot C
 *   6. Objects in B AND C but NOT A = leaked objects
 *
 * Output:
 *   - heap-A-<ts>.heapsnapshot
 *   - heap-B-<ts>.heapsnapshot
 *   - heap-C-<ts>.heapsnapshot
 *   - leak-report-<ts>.txt (human-readable diff)
 */

import { createConnection } from 'net';
import { writeFileSync, mkdirSync } from 'fs';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};

const port = parseInt(getArg('--port', '9229'), 10);
const script = getArg('--script', null);
const intervalMs = parseInt(getArg('--interval', '5000'), 10);
const outputDir = getArg('--output', process.cwd());
const gcBetween = !args.includes('--no-gc');

mkdirSync(outputDir, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPort(host, port, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = createConnection({ host, port });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) reject(new Error(`Timeout waiting for port ${port}`));
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
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function sendCdpCommand(ws, method, params = {}) {
  const { default: WebSocket } = await import('ws').catch(async () => {
    execSync('npm install ws --no-save', { stdio: 'inherit' });
    return import('ws');
  });

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
    setTimeout(() => { ws.off('message', handler); reject(new Error(`Timeout: ${method}`)); }, 30000);
  });
}

async function takeSnapshot(ws, WebSocket, label) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `heap-${label}-${timestamp}.heapsnapshot`);
  const chunks = [];

  console.log(`\n📸 Taking snapshot ${label}...`);

  return new Promise((resolve, reject) => {
    const chunkHandler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
        chunks.push(msg.params.chunk);
        process.stdout.write('.');
      }
    };

    ws.on('message', chunkHandler);

    const id = Math.floor(Math.random() * 100000);
    const doneHandler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off('message', chunkHandler);
        ws.off('message', doneHandler);
        process.stdout.write('\n');
        const snapshot = chunks.join('');
        writeFileSync(outputPath, snapshot);
        const sizeMB = (snapshot.length / 1024 / 1024).toFixed(2);
        console.log(`✅ Snapshot ${label} saved: ${path.basename(outputPath)} (${sizeMB} MB)`);
        resolve(outputPath);
      }
    };
    ws.on('message', doneHandler);
    ws.send(JSON.stringify({ id, method: 'HeapProfiler.takeHeapSnapshot', params: { reportProgress: false } }));
  });
}

async function forceGC(ws) {
  try {
    console.log('🗑️  Forcing garbage collection...');
    await sendCdpCommand(ws, 'HeapProfiler.collectGarbage');
    await sleep(500);
  } catch (e) {
    console.log('  (GC trigger not available, continuing)');
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  3-SNAPSHOT MEMORY LEAK DETECTOR');
  console.log('═'.repeat(60));
  console.log(`  Port     : ${port}`);
  console.log(`  Interval : ${intervalMs}ms between snapshots`);
  console.log(`  Output   : ${outputDir}`);
  console.log(`  Force GC : ${gcBetween}`);
  console.log('');

  let childProcess = null;

  if (script) {
    console.log(`🚀 Starting: node --inspect=${port} ${script}`);
    childProcess = spawn(process.execPath, [`--inspect=${port}`, '--expose-gc', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    childProcess.stdout.on('data', d => process.stdout.write(`[app] ${d}`));
    childProcess.stderr.on('data', d => {
      if (!d.toString().includes('Debugger listening')) process.stderr.write(`[app] ${d}`);
    });
  }

  await waitForPort('127.0.0.1', port);
  console.log('✓ Inspector ready');

  const { default: WebSocket } = await import('ws').catch(async () => {
    execSync('npm install ws --no-save', { stdio: 'inherit' });
    return import('ws');
  });

  const wsUrl = await getWsUrl(port);
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  console.log('✓ Connected to inspector\n');

  // Enable heap profiler
  await sendCdpCommand(ws, 'HeapProfiler.enable');

  const snapshotFiles = [];

  // ── SNAPSHOT A (baseline) ──────────────────────────────────────────────────
  if (gcBetween) await forceGC(ws);
  const snapA = await takeSnapshot(ws, WebSocket, 'A-baseline');
  snapshotFiles.push(snapA);

  // ── WAIT ───────────────────────────────────────────────────────────────────
  console.log(`\n⏳ Waiting ${intervalMs}ms... (perform your action now if testing manually)`);
  await sleep(intervalMs);

  // ── SNAPSHOT B ─────────────────────────────────────────────────────────────
  if (gcBetween) await forceGC(ws);
  const snapB = await takeSnapshot(ws, WebSocket, 'B-after-first');
  snapshotFiles.push(snapB);

  // ── WAIT AGAIN ────────────────────────────────────────────────────────────
  console.log(`\n⏳ Waiting ${intervalMs}ms again...`);
  await sleep(intervalMs);

  // ── SNAPSHOT C ─────────────────────────────────────────────────────────────
  if (gcBetween) await forceGC(ws);
  const snapC = await takeSnapshot(ws, WebSocket, 'C-after-second');
  snapshotFiles.push(snapC);

  ws.close();

  // ── ANALYSIS ───────────────────────────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(60));
  console.log('  ANALYZING SNAPSHOTS...');
  console.log('═'.repeat(60));

  const analyzeScript = path.join(__dirname, 'analyze_snapshot.js');
  try {
    const { execFileSync } = await import('child_process');
    const result = execFileSync(process.execPath, [analyzeScript, snapA, snapB, snapC], {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
    });
    console.log(result);

    // Save report
    const reportTs = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(outputDir, `leak-report-${reportTs}.txt`);
    writeFileSync(reportPath, result);
    console.log(`📄 Report saved: ${reportPath}`);
    console.log('\nTo view snapshots visually:');
    console.log('  1. Open Chrome → DevTools → Memory tab');
    console.log('  2. Click "Load" and select the .heapsnapshot files');
    console.log('  Or open: https://ui.perfetto.dev');

  } catch (e) {
    console.error('Analysis failed:', e.message);
    console.log('\nSnapshots saved. Run manually:');
    console.log(`  node ${analyzeScript} ${snapshotFiles.join(' ')}`);
  }

  if (childProcess) childProcess.kill();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
