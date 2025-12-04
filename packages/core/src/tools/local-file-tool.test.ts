/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isLocalFileDeclarativeTool } from './local-file-tool.js';
import {
  type Config,
  ShellTool,
  WebSearchTool,
  type AnyDeclarativeTool,
} from '../index.js';

describe('isLocalFileDeclarativeTool', () => {
  let mockConfig: Config;
  let shellTool: AnyDeclarativeTool;
  let webSearchTool: AnyDeclarativeTool;

  beforeEach(async () => {
    const realTmp = await fs.realpath(os.tmpdir());
    const tempRootDir = await fs.mkdtemp(
      path.join(realTmp, 'local-file-tool-root-'),
    );
    mockConfig = {
      getTargetDir: () => tempRootDir,
    } as unknown as Config;
    shellTool = new ShellTool(mockConfig);
    webSearchTool = new WebSearchTool(mockConfig);
  });

  it('returns true for ShellTool', () => {
    expect(isLocalFileDeclarativeTool(shellTool)).toBe(true);
  });

  it('returns false for WebSearchTool', () => {
    expect(isLocalFileDeclarativeTool(webSearchTool)).toBe(false);
  });
});
