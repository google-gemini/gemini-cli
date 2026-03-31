#!/usr/bin/env node

import { createConnection } from 'net';
import { writeFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const pid = getArg('--pid');
const port = parseInt(getArg('--port') || '9229', 10);
const script = getArg('--script');
const label = getArg('--label') || 'snapshot';
const outputDir = getArg('--output') || process.cwd();

async function waitForPort(host, port, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = createConnection({ host, port });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
    };
    tryConnect();
  });
}

async function getWebSocketUrl(port) {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    http.default.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const target = targets.find(t => t.webSocketDebuggerUrl);
          if (!target) reject(new Error('No debuggable target found'));
          else resolve(target.webSocketDebuggerUrl);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function captureSnapshot(wsUrl, outputPath) {
  const { default: WebSocket } = await import('ws').catch(() => {
    console.error('ws package not found. Installing...');
    execSync('npm install ws --no-save', { stdio: 'inherit' });
    return import('ws');
  });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const chunks = [];

    ws.on('open', () => {
      console.log('Connected to Node.js inspector');
      console.log('Taking heap snapshot (this may take a moment)...');
      ws.send(JSON.stringify({ id: msgId++, method: 'HeapProfiler.takeHeapSnapshot', params: { reportProgress: true } }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
        chunks.push(msg.params.chunk);
        process.stdout.write('.');
        return;
      }

      if (msg.method === 'HeapProfiler.reportHeapSnapshotProgress') {
        const pct = Math.round((msg.params.done / msg.params.total) * 100);
        process.stdout.write(`\rSnapshotting: ${pct}%   `);
        return;
      }

      if (msg.method === 'HeapProfiler.heapSnapshotChunkEnd' || 
          (msg.id && chunks.length > 0)) {
        process.stdout.write('\n');
        const snapshot = chunks.join('');
        writeFileSync(outputPath, snapshot);
        console.log(`Snapshot saved: ${outputPath}`);
        console.log(`Size: ${(snapshot.length / 1024 / 1024).toFixed(2)} MB`);
        ws.close();
        resolve(outputPath);
      }
    });

    ws.on('error', reject);

    setTimeout(() => {
      if (chunks.length > 0) {
        const snapshot = chunks.join('');
        writeFileSync(outputPath, snapshot);
        console.log(`\nSnapshot saved: ${outputPath}`);
        ws.close();
        resolve(outputPath);
      }
    }, 30000);
  });
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `heap-${label}-${timestamp}.heapsnapshot`);

  let childProcess = null;

  try {
    if (script) {
      console.log(`Launching ${script} with --inspect on port ${port}...`);
      childProcess = spawn(process.execPath, [`--inspect=${port}`, script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      childProcess.stderr.on('data', (d) => {
        if (d.toString().includes('Debugger listening')) {
          console.log('Inspector ready');
        }
      });
      await waitForPort('127.0.0.1', port);
    } else if (pid) {
      console.log(`Connecting to PID ${pid} on port ${port}...`);
      try {
        process.kill(parseInt(pid), 'SIGUSR1');
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log('Note: SIGUSR1 not sent (Windows), assuming --inspect already active');
      }
      await waitForPort('127.0.0.1', port, 5000);
    } else {
      console.log(`Connecting to inspector on port ${port}...`);
      await waitForPort('127.0.0.1', port, 5000);
    }

    const wsUrl = await getWebSocketUrl(port);
    console.log(`WebSocket: ${wsUrl}`);
    await captureSnapshot(wsUrl, outputPath);

  } catch (err) {
    console.error(`\nError: ${err.message}`);
    console.error('\nTroubleshooting:');
    console.error('  1. Start your Node.js process with: node --inspect <script.js>');
    console.error('  2. Or use: node capture_snapshot.js --script <path>');
    console.error('  3. Ensure no firewall blocks port', port);
    process.exit(1);
  } finally {
    if (childProcess) {
      console.log('\nPress Ctrl+C to stop the inspected process.');
    }
  }
}

main();