/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { isMainThread } from 'node:worker_threads';
import {
  createPhaseCollector,
  getProcessLabel,
  milliseconds,
} from './startup-profile.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = process.env['GEMINI_STARTUP_PROFILE_RUN_DIR'];
const launchTime = Number(process.env['GEMINI_STARTUP_PROFILE_LAUNCH_TIME']);
const entrypoint = getProcessLabel(
  process.argv[1],
  process.env['npm_execpath'],
  root,
);

// NODE_OPTIONS also reaches tools and workers. Only the launch chain should
// observe performance entries or write reports; workers share their parent's PID.
if (isMainThread && directory && Number.isFinite(launchTime) && entrypoint) {
  const processStartMs = performance.timeOrigin - launchTime;
  const collector = createPhaseCollector(processStartMs);
  const target = join(directory, `process-${process.pid}.json`);
  let scheduled;
  let disabled = false;

  const snapshot = () => {
    if (disabled) return;
    const record = {
      schemaVersion: 1,
      pid: process.pid,
      ppid: process.ppid,
      entrypoint,
      processStartMs: milliseconds(processStartMs),
      phases: collector.snapshot(),
    };
    try {
      writeFileSync(`${target}.tmp`, JSON.stringify(record, null, 2) + '\n', {
        mode: 0o600,
      });
      renameSync(`${target}.tmp`, target);
    } catch {
      // Reporting must never prevent startup or change the CLI's exit status.
      disabled = true;
    }
  };

  const observer = new PerformanceObserver((list) => {
    if (collector.collect(list.getEntries()) && !scheduled) {
      // Debounce writes outside the mark callback and never keep the CLI alive.
      scheduled = setTimeout(() => {
        scheduled = undefined;
        snapshot();
      }, 100);
      scheduled.unref();
    }
  });
  observer.observe({ entryTypes: ['mark', 'measure'] });
  process.on('exit', () => {
    clearTimeout(scheduled);
    collector.collect(observer.takeRecords());
    observer.disconnect();
    snapshot();
  });
}
