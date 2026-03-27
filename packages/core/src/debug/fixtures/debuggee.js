/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* global console */
function add(a, b) {
  return a + b;
}

function main() {
  const x = 10;
  const y = 20;
  const result = add(x, y);
  console.log(`Result: ${result}`);
  return result;
}

main();
