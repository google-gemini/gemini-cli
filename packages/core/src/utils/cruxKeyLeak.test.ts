/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Google CrUX API Key Leak Detection', () => {
  const LEAKED_KEY = Buffer.from(
    'QUl6YVN5Q0NTT3gyNXZyYjV6MHRiZWRDQjNfSlJ6emJWVzZVd2d3',
    'base64',
  ).toString('utf8');

  it('should verify the raw node_modules dependency contains the hardcoded Google CrUX API key', () => {
    const dependencyPath = path.resolve(
      __dirname,
      '../../../../node_modules/chrome-devtools-mcp/build/src/third_party/index.js',
    );

    if (fs.existsSync(dependencyPath)) {
      const content = fs.readFileSync(dependencyPath, 'utf8');
      expect(content).toContain(LEAKED_KEY);
    } else {
      throw new Error(
        `Expected chrome-devtools-mcp source file to exist at: ${dependencyPath}`,
      );
    }
  });

  it('should not contain the hardcoded Google CrUX API key in bundled chrome-devtools-mcp.mjs', () => {
    const bundleMcpPath = path.resolve(
      __dirname,
      '../../dist/bundled/chrome-devtools-mcp.mjs',
    );

    if (fs.existsSync(bundleMcpPath)) {
      const content = fs.readFileSync(bundleMcpPath, 'utf8');
      expect(content).not.toContain(LEAKED_KEY);
    }
  });

  it('should not contain the hardcoded Google CrUX API key in bundled third_party assets', () => {
    const thirdPartyPath = path.resolve(
      __dirname,
      '../../dist/bundled/third_party/index.js',
    );

    if (fs.existsSync(thirdPartyPath)) {
      const content = fs.readFileSync(thirdPartyPath, 'utf8');
      expect(content).not.toContain(LEAKED_KEY);
    }
  });

  it('should not contain the hardcoded Google CrUX API key in final bundle/bundled/ directory if exists', () => {
    const finalBundleMcpPath = path.resolve(
      __dirname,
      '../../../../bundle/bundled/chrome-devtools-mcp.mjs',
    );
    const finalThirdPartyPath = path.resolve(
      __dirname,
      '../../../../bundle/bundled/third_party/index.js',
    );

    if (fs.existsSync(finalBundleMcpPath)) {
      const content = fs.readFileSync(finalBundleMcpPath, 'utf8');
      expect(content).not.toContain(LEAKED_KEY);
    }

    if (fs.existsSync(finalThirdPartyPath)) {
      const content = fs.readFileSync(finalThirdPartyPath, 'utf8');
      expect(content).not.toContain(LEAKED_KEY);
    }
  });
});
