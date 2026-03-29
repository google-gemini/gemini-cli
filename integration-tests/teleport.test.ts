/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TeleportService,
  Config,
  ChatRecordingService,
} from '@google/gemini-cli-core';

describe('Teleport E2E Integration', () => {
  let tmpDir: string;
  let machineA_Home: string;
  let machineB_Home: string;
  let projectDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-teleport-e2e-'));
    machineA_Home = path.join(tmpDir, 'machineA');
    machineB_Home = path.join(tmpDir, 'machineB');
    projectDir = path.join(tmpDir, 'my-project');

    await fs.mkdir(machineA_Home, { recursive: true });
    await fs.mkdir(machineB_Home, { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should round-trip a session between two simulated machines', async () => {
    // --- STEP 1: Setup Machine A and create a session ---
    const configA = new Config({
      sessionId: 'session-123',
      targetDir: projectDir,
      cwd: projectDir,
      model: 'test-model',
    });
    const machineA_TempDir = path.join(machineA_Home, 'tmp');
    await fs.mkdir(machineA_TempDir, { recursive: true });
    vi.spyOn(configA.storage, 'getProjectTempDir').mockReturnValue(
      machineA_TempDir,
    );

    const recordingServiceA = new ChatRecordingService(configA);
    recordingServiceA.initialize();

    recordingServiceA.recordMessage({
      model: 'test-model',
      type: 'user',
      content: [{ text: 'Hello from Machine A' }],
    });

    const realSessionId = configA.getSessionId();
    const chatFilePathA = recordingServiceA.getConversationFilePath();
    expect(chatFilePathA).not.toBeNull();

    // --- STEP 2: Export from Machine A ---
    const teleportServiceA = new TeleportService(configA);
    const tarballPath = path.join(tmpDir, 'teleport.tar.gz');
    await teleportServiceA.exportSession(realSessionId, tarballPath);

    // --- STEP 3: Setup Machine B and Import ---
    const configB = new Config({
      sessionId: 'new-session',
      targetDir: projectDir,
      cwd: projectDir,
      model: 'test-model',
    });
    const machineB_TempDir = path.join(machineB_Home, 'tmp');
    await fs.mkdir(machineB_TempDir, { recursive: true });
    vi.spyOn(configB.storage, 'getProjectTempDir').mockReturnValue(
      machineB_TempDir,
    );

    const teleportServiceB = new TeleportService(configB);
    const importResult = await teleportServiceB.importSession(tarballPath);

    expect(importResult.sessionId).toBe(realSessionId);

    // --- STEP 4: Verify Machine B can "see" the session ---
    const chatFiles = await configB.storage.listProjectChatFiles();
    expect(chatFiles.length).toBe(1);

    // storage.listProjectChatFiles returns relative paths
    const importedFile = path.join(machineB_TempDir, chatFiles[0].filePath);
    const conversationData = JSON.parse(
      await fs.readFile(importedFile, 'utf8'),
    );

    const recordingServiceB = new ChatRecordingService(configB);
    recordingServiceB.initialize({
      filePath: importedFile,
      conversation: conversationData,
    });

    const conversation = recordingServiceB.getConversation();
    expect(conversation).not.toBeNull();
    expect(conversation?.messages[0].content[0].text).toBe(
      'Hello from Machine A',
    );
  });

  it('should handle encrypted sessions in E2E', async () => {
    const secret = 'password123';
    const configA = new Config({
      sessionId: 'enc-session',
      targetDir: projectDir,
      cwd: projectDir,
      model: 'm',
    });
    const machineA_TempDir = path.join(machineA_Home, 'tmp');
    await fs.mkdir(machineA_TempDir, { recursive: true });
    vi.spyOn(configA.storage, 'getProjectTempDir').mockReturnValue(
      machineA_TempDir,
    );

    const recordingServiceA = new ChatRecordingService(configA);
    recordingServiceA.initialize();
    recordingServiceA.recordMessage({
      model: 'm',
      type: 'user',
      content: [{ text: 'Encrypted message' }],
    });

    const realSessionId = configA.getSessionId();
    const teleportServiceA = new TeleportService(configA);
    const tarballPath = path.join(tmpDir, 'encrypted.tar.gz');
    await teleportServiceA.exportSession(realSessionId, tarballPath, secret);

    // Machine B
    const configB = new Config({
      sessionId: 'b',
      targetDir: projectDir,
      cwd: projectDir,
      model: 'm',
    });
    const machineB_TempDir = path.join(machineB_Home, 'tmp');
    await fs.mkdir(machineB_TempDir, { recursive: true });
    vi.spyOn(configB.storage, 'getProjectTempDir').mockReturnValue(
      machineB_TempDir,
    );

    const teleportServiceB = new TeleportService(configB);
    await teleportServiceB.importSession(tarballPath, secret);

    const chatFiles = await configB.storage.listProjectChatFiles();
    const importedFile = path.join(machineB_TempDir, chatFiles[0].filePath);
    const conversationData = JSON.parse(
      await fs.readFile(importedFile, 'utf8'),
    );

    const recordingServiceB = new ChatRecordingService(configB);
    recordingServiceB.initialize({
      filePath: importedFile,
      conversation: conversationData,
    });

    const conversation = recordingServiceB.getConversation();
    expect(conversation?.messages[0].content[0].text).toBe('Encrypted message');
  });
});
