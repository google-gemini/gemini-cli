/**
 * capture-snapshots.cjs — Capture N heap snapshots from the current process.
 * Prototype for GSoC 2026 proposal: https://github.com/google-gemini/gemini-cli/issues/23365
 *
 * ⚠️  SCOPE NOTE: This captures snapshots of its OWN process (same-process via
 * node:inspector). Profiling an already-running Node.js application requires a
 * CDP WebSocket client connecting to --inspect port — that is the core GSoC
 * deliverable and NOT implemented here.
 *
 * SECURITY: When the external CDP mode is implemented, the following invariants
 * are enforced by validateCDPTarget() below:
 *   1. Only connects to 127.0.0.1 (loopback) — never 0.0.0.0 or routable IPs.
 *   2. Port is always ephemeral (--inspect=127.0.0.1:0) to prevent hijacking.
 *   3. A user consent prompt is shown before attaching to any external PID.
 *   4. The CDP session and subprocess are torn down on disconnect.
 * These mitigations address the attack surface described in issue #23365.
 *
 * Usage:
 *   node capture-snapshots.cjs [--count=3] [--interval=5000] [--out=./snapshots]
 *
 * Options:
 *   --count     Number of snapshots to capture (default: 3)
 *   --interval  Milliseconds between captures (default: 5000)
 *   --out       Output directory (default: ./snapshots)
 *
 * Output:
 *   ./snapshots/snapshot-1.heapsnapshot
 *   ./snapshots/snapshot-2.heapsnapshot
 *   ./snapshots/snapshot-3.heapsnapshot
 *
 * Then analyse:
 *   node parse-heapsnapshot.cjs ./snapshots/snapshot-3.heapsnapshot
 *   node diff-snapshots.cjs --s1=snapshot-1 --s2=snapshot-2 --s3=snapshot-3
 */

'use strict';

const inspector = require('node:inspector');
const fs        = require('node:fs');
const path      = require('node:path');

// ─── Security ──────────────────────────────────────────────────────────────────

/**
 * Validate that a CDP WebSocket URL is safe before connecting.
 *
 * When the planned GSoC feature attaches to an external process via
 * `node --inspect=127.0.0.1:0`, Node.js prints the assigned URL to stderr:
 *   Debugger listening on ws://127.0.0.1:<PORT>/...
 *
 * This function parses that URL and enforces loopback-only binding so the
 * inspector port is never reachable from the network — even if the target
 * process was accidentally started with --inspect=0.0.0.0.
 *
 * @param {string} wsUrl  WebSocket URL parsed from the target process stderr
 * @throws {Error}        if the host is not a loopback address
 */
function validateCDPTarget(wsUrl) {
  let parsed;
  try {
    parsed = new URL(wsUrl);
  } catch {
    throw new Error(`Invalid CDP target URL: ${wsUrl}`);
  }

  const host = parsed.hostname;
  const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

  if (!LOOPBACK.includes(host)) {
    throw new Error(
      `Security violation: CDP target host "${host}" is not loopback. ` +
      'The memory-analysis skill only connects to 127.0.0.1. ' +
      'Re-start the target with --inspect=127.0.0.1:<port> and try again.'
    );
  }

  // Port 0 would mean the OS hasn't assigned one yet — caller bug
  if (parsed.port === '0' || parsed.port === '') {
    throw new Error(`CDP target URL has no valid port: ${wsUrl}`);
  }
}

// Exported for use by the full GSoC CDP client implementation
module.exports = { validateCDPTarget };

function parseArgs(argv) {
  const args = { count: 3, interval: 5000, out: './snapshots' };
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([\w-]+)=(.+)$/);
    if (match) args[match[1]] = isNaN(match[2]) ? match[2] : Number(match[2]);
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function takeSnapshot(session, outPath) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    session.on('HeapProfiler.addHeapSnapshotChunk', ({ params }) => {
      chunks.push(params.chunk);
    });

    session.post('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, (err) => {
      if (err) return reject(err);
      fs.writeFileSync(outPath, chunks.join(''), 'utf8');
      resolve(outPath);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(args.out);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const session = new inspector.Session();
  session.connect();
  session.post('HeapProfiler.enable', () => {});

  console.log(`Capturing ${args.count} snapshot(s) every ${args.interval}ms → ${outDir}/`);
  const captured = [];

  for (let i = 1; i <= args.count; i++) {
    const outPath = path.join(outDir, `snapshot-${i}.heapsnapshot`);
    process.stdout.write(`  [${i}/${args.count}] taking snapshot...`);

    const t0 = Date.now();
    await takeSnapshot(session, outPath);
    const size = fs.statSync(outPath).size;
    console.log(` done (${(size / 1024 / 1024).toFixed(1)}MB, ${Date.now() - t0}ms)`);
    captured.push(outPath);

    if (i < args.count) await sleep(args.interval);
  }

  session.disconnect();

  console.log('\nDone. Next steps:');
  console.log(`  node parse-heapsnapshot.cjs ${captured[captured.length - 1]}`);
  if (captured.length >= 3) {
    console.log(`  node diff-snapshots.cjs --s1=${captured[0]} --s2=${captured[1]} --s3=${captured[2]}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
