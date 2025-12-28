/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockSpawn = vi.fn(() => ({ on: vi.fn(), pid: 123 }));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  openSync: vi.fn(() => 1),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../telemetry_utils.js', () => ({
  ensureBinary: vi.fn(() => Promise.resolve('/fake/path/to/otelcol-contrib')),
  waitForPort: vi.fn(() => Promise.resolve()),
  manageTelemetrySettings: vi.fn(),
  registerCleanup: vi.fn(),
  fileExists: vi.fn(() => true), // Assume all files exist for simplicity
  OTEL_DIR: '/tmp/otel',
  BIN_DIR: '/tmp/bin',
}));

describe('telemetry_gcp.js', () => {
  beforeEach(() => {
    vi.resetModules(); // This is key to re-run the script
    vi.clearAllMocks();
    process.env.OTLP_GOOGLE_CLOUD_PROJECT = 'test-project';
    // Clear the env var before each test
    delete process.env.GEMINI_CLI_CREDENTIALS_PATH;
  });

  afterEach(() => {
    delete process.env.OTLP_GOOGLE_CLOUD_PROJECT;
  });

  it('should not set GOOGLE_APPLICATION_CREDENTIALS when env var is not set', async () => {
    await import('../telemetry_gcp.js');

    expect(mockSpawn).toHaveBeenCalled();
    const spawnOptions = mockSpawn.mock.calls[0][2];
    expect(spawnOptions?.env).not.toHaveProperty(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
  });
});
