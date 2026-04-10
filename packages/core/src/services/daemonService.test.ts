/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { DaemonService, type DaemonConfig } from './daemonService.js';
import { DaemonLogger } from './daemonLogger.js';

describe('DaemonService', () => {
  let tempDir: string;
  let configDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `daemon-test-${Date.now()}`);
    configDir = path.join(tempDir, '.gemini');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create a daemon service with default config', () => {
      const daemon = new DaemonService({
        projectRoot: tempDir,
      });
      expect(daemon).toBeDefined();
    });

    it('should accept custom config', () => {
      const daemon = new DaemonService({
        projectRoot: tempDir,
        tickIntervalMs: 60000,
        enableNotifications: false,
        configDir,
      });
      expect(daemon).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return stopped status initially', () => {
      const daemon = new DaemonService({
        projectRoot: tempDir,
        configDir,
      });
      const status = daemon.getStatus();
      expect(status.state).toBe('stopped');
      expect(status.pid).toBeNull();
      expect(status.uptime).toBeNull();
    });
  });

  describe('start and stop', () => {
    it('should start and stop the daemon', async () => {
      const daemon = new DaemonService({
        projectRoot: tempDir,
        configDir,
        tickIntervalMs: 1000,
      });

      // Start
      const started = await daemon.start();
      expect(started).toBe(true);

      const runningStatus = daemon.getStatus();
      expect(runningStatus.state).toBe('running');
      expect(runningStatus.pid).not.toBeNull();

      // Stop
      const stopped = await daemon.stop();
      expect(stopped).toBe(true);

      const stoppedStatus = daemon.getStatus();
      expect(stoppedStatus.state).toBe('stopped');
    });

    it('should not start twice', async () => {
      const daemon = new DaemonService({
        projectRoot: tempDir,
        configDir,
      });

      await daemon.start();
      const secondStart = await daemon.start();
      expect(secondStart).toBe(false);

      await daemon.stop();
    });

    it('should handle pause and resume', async () => {
      const daemon = new DaemonService({
        projectRoot: tempDir,
        configDir,
      });

      await daemon.start();

      const paused = await daemon.pause();
      expect(paused).toBe(true);
      expect(daemon.getStatus().state).toBe('paused');

      const resumed = await daemon.resume();
      expect(resumed).toBe(true);
      expect(daemon.getStatus().state).toBe('running');

      await daemon.stop();
    });
  });
});

describe('DaemonLogger', () => {
  let tempDir: string;
  let logger: DaemonLogger;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `daemon-logger-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    logger = new DaemonLogger(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('log', () => {
    it('should write log entries', async () => {
      await logger.log({
        type: 'test_action',
        timestamp: new Date().toISOString(),
        details: { foo: 'bar' },
      });

      const entries = await logger.readLog(1);
      expect(entries.length).toBe(1);
      expect(entries[0].type).toBe('test_action');
    });

    it('should create daily log files', async () => {
      await logger.log({
        type: 'action1',
        timestamp: new Date().toISOString(),
        details: {},
      });

      await logger.log({
        type: 'action2',
        timestamp: new Date().toISOString(),
        details: {},
      });

      const entries = await logger.readLog(1);
      expect(entries.length).toBe(2);
    });
  });

  describe('clearLogs', () => {
    it('should clear all log files', async () => {
      await logger.log({
        type: 'test',
        timestamp: new Date().toISOString(),
        details: {},
      });

      await logger.clearLogs();

      const entries = await logger.readLog(1);
      expect(entries.length).toBe(0);
    });
  });
});