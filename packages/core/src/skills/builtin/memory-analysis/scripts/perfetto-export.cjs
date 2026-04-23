/**
 * perfetto-export.cjs — Convert memory analysis results to Perfetto trace format.
 * Prototype for GSoC 2026 proposal: https://github.com/google-gemini/gemini-cli/issues/23365
 *
 * Takes the JSON output from diff-snapshots.cjs and generates a Chrome Trace
 * Event Format JSON file loadable in https://ui.perfetto.dev
 *
 * Usage:
 *   node perfetto-export.cjs --input=<leak-report.json> --output=<trace.json>
 *
 * Or pipe from diff-snapshots:
 *   node diff-snapshots.cjs --s1=a --s2=b --s3=c | node perfetto-export.cjs --output=trace.json
 *
 * Can also be called programmatically:
 *   const { generateTrace } = require('./perfetto-export.cjs');
 *   const traceJson = generateTrace(diffReport, heapSizes);
 *
 * Zero external dependencies. Uses only node:fs, node:path.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// --- Helpers ---

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([\w-]+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function parseSize(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const m = str.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  return Math.round(val * (multipliers[unit] || 1));
}

// --- Trace generation ---

/**
 * Generate a Chrome Trace Event Format object from a diff report.
 *
 * @param {object} report  — JSON output from diff-snapshots.cjs
 * @param {object} [opts]  — optional overrides
 * @param {number[]} [opts.heapBytes]  — [s1, s2, s3] heap sizes in bytes
 * @param {number[]} [opts.timestamps] — [s1, s2, s3] timestamps in ms
 * @returns {object} Chrome Trace Event Format JSON
 */
function generateTrace(report, opts = {}) {
  const events = [];
  const pid = 1; // single process

  // --- Resolve heap sizes (bytes) ---
  // Try opts.heapBytes, then parse from report.snapshots
  const heapBytes = opts.heapBytes || [
    parseSize(report.snapshots?.s1?.total_size),
    parseSize(report.snapshots?.s2?.total_size),
    parseSize(report.snapshots?.s3?.total_size),
  ];

  // --- Resolve timestamps (microseconds for Perfetto) ---
  // Default: 0s, 5s, 10s if not provided
  const tsMs = opts.timestamps || [0, 5000, 10000];
  const tsUs = tsMs.map((t) => t * 1000); // ms → μs

  // --- Track 1: Heap size counter events (draws a line chart) ---
  const snapshotLabels = ['S1 (baseline)', 'S2 (mid)', 'S3 (final)'];
  for (let i = 0; i < 3; i++) {
    events.push({
      name: 'Heap Size',
      ph: 'C',           // Counter event
      ts: tsUs[i],
      pid,
      tid: 1,
      args: {
        heapUsedBytes: heapBytes[i],
        heapUsedMB: +(heapBytes[i] / (1024 * 1024)).toFixed(2),
      },
    });
  }

  // --- Track 2: Snapshot markers (instant events) ---
  for (let i = 0; i < 3; i++) {
    events.push({
      name: snapshotLabels[i],
      ph: 'i',           // Instant event
      ts: tsUs[i],
      pid,
      tid: 2,
      s: 'g',            // global scope
      args: {
        nodes: report.snapshots?.[['s1', 's2', 's3'][i]]?.nodes,
        totalSize: report.snapshots?.[['s1', 's2', 's3'][i]]?.total_size,
      },
    });
  }

  // --- Track 3: Leaked constructors as duration bars ---
  const leaks = report.leaked_constructors || [];
  const validLeaks = leaks.filter((l) => l.name && l.count);

  for (let i = 0; i < validLeaks.length; i++) {
    const leak = validLeaks[i];
    // Each leak spans from S2 (when allocated) to S3 (still alive = leaked)
    events.push({
      name: `Leak: ${leak.name}`,
      ph: 'X',           // Complete (duration) event
      ts: tsUs[1],       // starts at S2
      dur: tsUs[2] - tsUs[1],  // lasts until S3
      pid,
      tid: 3 + i,        // each leak on its own row for clarity
      args: {
        count: leak.count,
        totalSize: leak.total_size,
        percentage: leak.pct,
      },
    });
  }

  // --- Track 4: Heap growth rate counter (bytes/sec between snapshots) ---
  // Shows how fast the heap is growing — makes the leak visible as acceleration
  for (let i = 1; i < 3; i++) {
    const dtSec = (tsMs[i] - tsMs[i - 1]) / 1000 || 1; // avoid div-by-zero
    const growthRate = Math.max(0, (heapBytes[i] - heapBytes[i - 1]) / dtSec);
    events.push({
      name: 'Heap Growth Rate',
      ph: 'C',
      ts: tsUs[i],
      pid,
      tid: 4,
      args: {
        bytesPerSec: Math.round(growthRate),
        kbPerSec: +(growthRate / 1024).toFixed(1),
      },
    });
  }

  // --- Track 5: Cumulative leaked object count ---
  const survivedCount = report.growth_stats?.survived_to_s3 || 0;
  events.push(
    { name: 'Leaked Objects', ph: 'C', ts: tsUs[0], pid, tid: 5, args: { count: 0 } },
    { name: 'Leaked Objects', ph: 'C', ts: tsUs[1], pid, tid: 5, args: { count: report.growth_stats?.new_allocations_in_s2 || 0 } },
    { name: 'Leaked Objects', ph: 'C', ts: tsUs[2], pid, tid: 5, args: { count: survivedCount } },
  );

  // --- Track 6: Growth verdict as metadata ---
  if (report.growth_stats) {
    events.push({
      name: 'Verdict',
      ph: 'i',
      ts: tsUs[2],
      pid,
      tid: 2,
      s: 'g',
      args: {
        verdict: report.growth_stats.verdict,
        s1_to_s2: report.growth_stats.s1_to_s2,
        s2_to_s3: report.growth_stats.s2_to_s3,
        survived: report.growth_stats.survived_to_s3,
      },
    });
  }

  // --- Metadata events (process/thread names for Perfetto UI) ---
  events.push(
    { name: 'process_name', ph: 'M', pid, tid: 0, args: { name: 'Memory Analysis' } },
    { name: 'thread_name',  ph: 'M', pid, tid: 1, args: { name: 'Heap Size' } },
    { name: 'thread_name',  ph: 'M', pid, tid: 2, args: { name: 'Snapshots' } },
    { name: 'thread_name',  ph: 'M', pid, tid: 4, args: { name: 'Growth Rate (bytes/sec)' } },
    { name: 'thread_name',  ph: 'M', pid, tid: 5, args: { name: 'Leaked Object Count' } },
  );
  for (let i = 0; i < validLeaks.length; i++) {
    events.push({
      name: 'thread_name',
      ph: 'M',
      pid,
      tid: 3 + i,
      args: { name: `Leaked: ${validLeaks[i].name}` },
    });
  }

  return {
    traceEvents: events,
    metadata: {
      source: 'gemini-cli-memory-analysis',
      technique: report.technique || '3-snapshot',
      generatedAt: new Date().toISOString(),
    },
  };
}

// --- CLI entry point ---

function main() {
  const args = parseArgs(process.argv);

  let report;

  if (args.input) {
    // Read from file
    const inputPath = path.resolve(args.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`File not found: ${inputPath}`);
      process.exit(1);
    }
    report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } else {
    // Read from stdin
    const chunks = [];
    const fd = fs.openSync('/dev/stdin', 'r');
    const buf = Buffer.alloc(65536);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf)) > 0) {
      chunks.push(buf.slice(0, bytesRead).toString());
    }
    fs.closeSync(fd);
    report = JSON.parse(chunks.join(''));
  }

  if (report.error) {
    console.error(`Input contains error: ${report.error}`);
    process.exit(1);
  }

  // Optional: override heap sizes and timestamps
  const opts = {};
  if (args['s1-heap'] && args['s2-heap'] && args['s3-heap']) {
    opts.heapBytes = [
      parseInt(args['s1-heap'], 10),
      parseInt(args['s2-heap'], 10),
      parseInt(args['s3-heap'], 10),
    ];
  }
  if (args['s1-time'] && args['s2-time'] && args['s3-time']) {
    opts.timestamps = [
      parseInt(args['s1-time'], 10),
      parseInt(args['s2-time'], 10),
      parseInt(args['s3-time'], 10),
    ];
  }

  const trace = generateTrace(report, opts);
  const outputPath = path.resolve(args.output || 'trace.json');
  fs.writeFileSync(outputPath, JSON.stringify(trace, null, 2));
  console.log(`Perfetto trace written: ${outputPath}`);
  console.log(`Open https://ui.perfetto.dev and drag the file to visualize.`);
}

// Export for programmatic use + run as CLI
module.exports = { generateTrace };
if (require.main === module) main();
