#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * to-perfetto.cjs
 *
 * Converts a V8 .cpuprofile to Perfetto-compatible JSON trace format.
 * The output can be loaded at https://ui.perfetto.dev for visual exploration.
 *
 * Perfetto JSON trace format uses Chrome Trace Event Format:
 * https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
 *
 * Usage:
 *   node to-perfetto.cjs --input profile.cpuprofile --output trace.perfetto-trace
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { input: null, output: './trace.perfetto-trace' };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--help':
        console.log(
          'Usage: node to-perfetto.cjs [options]\n\n' +
            'Options:\n' +
            '  --input <file>       Path to .cpuprofile file\n' +
            '  --output <file>      Output trace file (default: ./trace.perfetto-trace)\n' +
            '  --help               Show this help message\n',
        );
        process.exit(0);
        break;
    }
  }

  if (!args.input) {
    console.error('Error: --input is required.');
    process.exit(1);
  }

  return args;
}

/**
 * Convert a V8 CPU profile to Chrome Trace Event Format (for Perfetto).
 *
 * The V8 CPU profile format contains:
 * - nodes: array of call tree nodes with {id, callFrame, children}
 * - samples: array of node IDs (leaf nodes hit during sampling)
 * - timeDeltas: array of microsecond intervals between samples
 * - startTime/endTime: profile boundaries in microseconds
 *
 * We convert this to Trace Event Format with:
 * - "B" (begin) and "E" (end) events for function call durations
 * - "I" (instant) events for individual samples
 */
function convertToTraceEvents(profile) {
  const nodes = profile.nodes;
  const samples = profile.samples || [];
  const timeDeltas = profile.timeDeltas || [];
  const startTime = profile.startTime || 0;

  // Build a map of node ID to node data
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Build parent map
  const parentMap = new Map();
  for (const node of nodes) {
    if (node.children) {
      for (const childId of node.children) {
        parentMap.set(childId, node.id);
      }
    }
  }

  // Get the full call stack for a node (bottom-up)
  function getCallStack(nodeId) {
    const stack = [];
    let current = nodeId;
    while (current != null) {
      const node = nodeMap.get(current);
      if (node) {
        stack.unshift(node);
      }
      current = parentMap.get(current);
    }
    return stack;
  }

  const traceEvents = [];
  const pid = 1;
  const tid = 1;

  // Track active stack frames for proper begin/end events
  let currentTime = startTime;
  let prevStack = [];

  for (let i = 0; i < samples.length; i++) {
    const sampleNodeId = samples[i];
    const delta = timeDeltas[i] || 0;
    currentTime += delta;

    const newStack = getCallStack(sampleNodeId);

    // Find the common prefix length
    let commonLen = 0;
    while (
      commonLen < prevStack.length &&
      commonLen < newStack.length &&
      prevStack[commonLen].id === newStack[commonLen].id
    ) {
      commonLen++;
    }

    // End frames that are no longer active (in reverse order)
    for (let j = prevStack.length - 1; j >= commonLen; j--) {
      const node = prevStack[j];
      const cf = node.callFrame;
      traceEvents.push({
        ph: 'E',
        pid,
        tid,
        ts: currentTime,
        name: cf.functionName || '(anonymous)',
        cat: 'cpu',
      });
    }

    // Begin new frames
    for (let j = commonLen; j < newStack.length; j++) {
      const node = newStack[j];
      const cf = node.callFrame;
      traceEvents.push({
        ph: 'B',
        pid,
        tid,
        ts: currentTime,
        name: cf.functionName || '(anonymous)',
        cat: 'cpu',
        args: {
          url: cf.url || '',
          lineNumber: cf.lineNumber,
          columnNumber: cf.columnNumber,
        },
      });
    }

    prevStack = newStack;
  }

  // Close remaining open frames
  for (let j = prevStack.length - 1; j >= 0; j--) {
    const node = prevStack[j];
    const cf = node.callFrame;
    traceEvents.push({
      ph: 'E',
      pid,
      tid,
      ts: currentTime,
      name: cf.functionName || '(anonymous)',
      cat: 'cpu',
    });
  }

  // Add metadata event
  traceEvents.push({
    ph: 'M',
    pid,
    tid,
    ts: 0,
    name: 'process_name',
    cat: '__metadata',
    args: { name: 'Node.js CPU Profile' },
  });

  traceEvents.push({
    ph: 'M',
    pid,
    tid,
    ts: 0,
    name: 'thread_name',
    cat: '__metadata',
    args: { name: 'Main Thread' },
  });

  return traceEvents;
}

function main() {
  const args = parseArgs(process.argv);

  console.log(`Perfetto Trace Generator`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Input:  ${args.input}`);
  console.log(`Output: ${path.resolve(args.output)}\n`);

  // Read the CPU profile
  console.log(`Reading CPU profile...`);
  const raw = fs.readFileSync(args.input, 'utf8');
  const profile = JSON.parse(raw);

  // Convert to trace events
  console.log(`Converting to Perfetto trace format...`);
  const events = convertToTraceEvents(profile);

  // Write the trace file
  const traceData = JSON.stringify({ traceEvents: events }, null, 2);

  const outputDir = path.dirname(path.resolve(args.output));
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(args.output, traceData);

  const sizeKB = (Buffer.byteLength(traceData) / 1024).toFixed(1);
  console.log(`\n✓ Perfetto trace saved: ${args.output} (${sizeKB} KB)`);
  console.log(`  Generated ${events.length} trace events`);
  console.log(`\nTo explore visually:`);
  console.log(`  1. Open https://ui.perfetto.dev`);
  console.log(
    `  2. Click "Open trace file" or drag-and-drop the .perfetto-trace file`,
  );
  console.log(`  3. Navigate the flame chart to identify hot paths`);
}

main();
