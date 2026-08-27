/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* global console */

/**
 * @fileoverview A simple tutorial script demonstrating how to interact with Gemini CLI.
 */

function runTutorial() {
  console.log('=== Gemini CLI Developer Tutorial ===');
  console.log(
    'Gemini CLI is an interactive terminal interface powered by Gemini.',
  );
  console.log('\nKey Directories:');
  console.log('- packages/cli: User-facing terminal UI and Ink rendering.');
  console.log(
    '- packages/core: Core business logic, prompt construction, and tools.',
  );
  console.log('- packages/sdk: Programmatic SDK.');
  console.log('\nGet started by running: npm run start');
  console.log('====================================');
}

runTutorial();
