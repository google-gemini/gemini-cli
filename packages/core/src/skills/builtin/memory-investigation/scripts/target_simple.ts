/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * target_simple.ts — Simple target process for CDP snapshot testing.
 * Stays alive and leaks objects so there's something to snapshot.
 */

console.log('[target] PID:', process.pid);
console.log('[target] Waiting for inspector connection...');

interface LeakedObject {
  ts: number;
  data: string;
}

const leaks: LeakedObject[] = [];
setInterval(() => {
  for (let i = 0; i < 100; i++) {
    leaks.push({ ts: Date.now(), data: 'x'.repeat(1000) });
  }
  console.log(`[target] objects: ${leaks.length}`);
}, 2000);
