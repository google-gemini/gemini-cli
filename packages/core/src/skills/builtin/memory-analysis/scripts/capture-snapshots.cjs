/**
 * capture-snapshots.cjs — Capture N heap snapshots from the current process.
 * Prototype for GSoC 2026 proposal: https://github.com/google-gemini/gemini-cli/issues/23365
 *
 * ⚠️  SCOPE NOTE: This captures snapshots of its OWN process (same-process via
 * node:inspector). Profiling an already-running Node.js application requires a
 * CDP WebSocket client connecting to --inspect port — that is the core GSoC
 * deliverable and NOT implemented here.
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
