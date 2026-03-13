/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/cors-misconfiguration', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should harden CORS from wildcard origin to a specific allowed origin',
    category: 'debugging',
    tags: ['security', 'cors', 'http', 'typescript'],
    files: {
      'src/server.ts': `import http from 'node:http';

// BUG: Access-Control-Allow-Origin: * allows ANY domain to make credentialed
// requests in production, which is a security risk.
export function createServer() {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.writeHead(200);
    res.end('OK');
  });
}
`,
    },
    prompt:
      "src/server.ts sets Access-Control-Allow-Origin to '*' while also allowing credentials, which is rejected by browsers and is a security misconfiguration. Fix it to only allow the specific production origin 'https://app.example.com' instead of the wildcard.",
    assert: async (rig) => {
      const content = rig.readFile('src/server.ts');
      expect(content).not.toContain("'*'");
      const hasSpecificOrigin =
        content.includes('example.com') ||
        content.includes('ALLOWED_ORIGIN') ||
        content.includes('allowedOrigin');
      expect(
        hasSpecificOrigin,
        'Expected a specific origin instead of wildcard',
      ).toBe(true);
    },
  });
});
