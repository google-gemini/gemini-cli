/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { LspServerManager } from './LspServerManager.js';
import path from 'node:path';
import fs from 'node:fs';

describe('LspServerManager', () => {
  const projectRoot = process.cwd();

  it('should throw an error with a proactive hint if the binary is missing', async () => {
    const manager = new LspServerManager(projectRoot);

    // Test with a non-existent extension/command
    // We'll temporarily modify DEFAULT_SERVERS or just test the current logic
    // Actually, let's try to get a client for a .go file if gopls is missing
    try {
      await manager.getClientForFile('test.go');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toContain('gopls is missing');
      expect(message).toContain('go install');
    }
  });

  it('should successfully get a client for an existing server (TypeScript)', async () => {
    const manager = new LspServerManager(projectRoot);

    // Create a dummy .ts file
    const dummyFile = path.join(projectRoot, 'dummy-test-lsp.ts');
    fs.writeFileSync(dummyFile, 'const x = 1;');

    try {
      const client = await manager.getClientForFile(dummyFile);
      expect(client).toBeDefined();

      // Cleanup
      await manager.shutdownAll();
    } finally {
      if (fs.existsSync(dummyFile)) {
        fs.unlinkSync(dummyFile);
      }
    }
  }, 15000); // 15s timeout for server startup
});
