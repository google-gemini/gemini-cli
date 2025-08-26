/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '@google-cloud/storage';
import * as fse from 'fs-extra';
import { promises as fsPromises, createReadStream } from 'node:fs';
import * as tar from 'tar';
import { gzipSync, gunzipSync } from 'node:zlib';
import { v4 as uuidv4 } from 'uuid';
import type { Task as SDKTask } from '@a2a-js/sdk';
import type { TaskStore } from '@a2a-js/sdk/server';
import type { Mocked, MockedClass, Mock } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GCSTaskStore, NoOpTaskStore } from './gcs.js';
import { logger } from './logger.js';
import * as configModule from './config.js';
import * as metadataModule from './metadata_types.js';

// Mock dependencies
vi.mock('@google-cloud/storage');
vi.mock('fs-extra', () => ({
  pathExists: vi.fn(),
  readdir: vi.fn(),
  remove: vi.fn(),
  ensureDir: vi.fn(),
}));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
    },
    createReadStream: vi.fn(),
  };
});
vi.mock('tar');
vi.mock('zlib');
vi.mock('uuid');
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('./config');
vi.mock('./metadata_types');
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn(),
}));

const mockStorage = Storage as MockedClass<typeof Storage>;
const mockFse = fse as Mocked<typeof fse>;
const mockCreateReadStream = createReadStream as Mock;
const mockTar = tar as Mocked<typeof tar>;
const mockGzipSync = gzipSync as Mock;
const mockGunzipSync = gunzipSync as Mock;
const mockUuidv4 = uuidv4 as Mock;
const mockSetTargetDir = configModule.setTargetDir as Mock;
const mockGetPersistedState = metadataModule.getPersistedState as Mock;
const METADATA_KEY = metadataModule.METADATA_KEY || '__persistedState';

type MockWriteStream = {
  on: Mock<
    (event: string, cb: (error?: Error | null) => void) => MockWriteStream
  >;
  destroy: Mock<() => void>;
  destroyed: boolean;
};

type MockFile = {
  save: Mock<(data: Buffer | string) => Promise<void>>;
  download: Mock<() => Promise<[Buffer]>>;
  exists: Mock<() => Promise<[boolean]>>;
  createWriteStream: Mock<() => MockWriteStream>;
};

type MockBucket = {
  exists: Mock<() => Promise<[boolean]>>;
  file: Mock<(path: string) => MockFile>;
  name: string;
};

type MockStorageInstance = {
  bucket: Mock<(name: string) => MockBucket>;
  getBuckets: Mock<() => Promise<[Array<{ name: string }>]>>;
  createBucket: Mock<(name: string) => Promise<[MockBucket]>>;
};

describe('GCSTaskStore', () => {
  let bucketName: string;
  let mockBucket: MockBucket;
  let mockFile: MockFile;
  let mockWriteStream: MockWriteStream;
  let mockStorageInstance: MockStorageInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    bucketName = 'test-bucket';

    mockWriteStream = {
      on: vi.fn((event, cb) => {
        if (event === 'finish') setTimeout(cb, 0); // Simulate async finish
        return mockWriteStream;
      }),
      destroy: vi.fn(),
      destroyed: false,
    };

    mockFile = {
      save: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue([Buffer.from('')]),
      exists: vi.fn().mockResolvedValue([true]),
      createWriteStream: vi.fn().mockReturnValue(mockWriteStream),
    };

    mockBucket = {
      exists: vi.fn().mockResolvedValue([true]),
      file: vi.fn().mockReturnValue(mockFile),
      name: bucketName,
    };

    mockStorageInstance = {
      bucket: vi.fn().mockReturnValue(mockBucket),
      getBuckets: vi.fn().mockResolvedValue([[{ name: bucketName }]]),
      createBucket: vi.fn().mockResolvedValue([mockBucket]),
    };
    mockStorage.mockReturnValue(mockStorageInstance as unknown as Storage);

    mockUuidv4.mockReturnValue('test-uuid');
    mockSetTargetDir.mockReturnValue('/tmp/workdir');
    mockGetPersistedState.mockReturnValue({
      _agentSettings: {},
      _taskState: 'submitted',
    });
    (fse.pathExists as Mock).mockResolvedValue(true);
    (fsPromises.readdir as Mock).mockResolvedValue(['file1.txt']);
    mockTar.c.mockResolvedValue(undefined);
    mockTar.x.mockResolvedValue(undefined);
    mockFse.remove.mockResolvedValue(undefined);
    mockFse.ensureDir.mockResolvedValue(undefined);
    mockGzipSync.mockReturnValue(Buffer.from('compressed'));
    mockGunzipSync.mockReturnValue(Buffer.from('{}'));
    mockCreateReadStream.mockReturnValue({ on: vi.fn(), pipe: vi.fn() });
  });

  describe('Constructor & Initialization', () => {
    it('should initialize and check bucket existence', async () => {
      const store = new GCSTaskStore(bucketName);
      await store['ensureBucketInitialized']();
      expect(mockStorage).toHaveBeenCalledTimes(1);
      expect(mockStorageInstance.getBuckets).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Bucket test-bucket exists'),
      );
    });

    it('should create bucket if it does not exist', async () => {
      mockStorageInstance.getBuckets.mockResolvedValue([[]]);
      const store = new GCSTaskStore(bucketName);
      await store['ensureBucketInitialized']();
      expect(mockStorageInstance.createBucket).toHaveBeenCalledWith(bucketName);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Bucket test-bucket created successfully'),
      );
    });

    it('should throw if bucket creation fails', async () => {
      mockStorageInstance.getBuckets.mockResolvedValue([[]]);
      mockStorageInstance.createBucket.mockRejectedValue(
        new Error('Create failed'),
      );
      const store = new GCSTaskStore(bucketName);
      await expect(store['ensureBucketInitialized']()).rejects.toThrow(
        'Failed to create GCS bucket test-bucket: Error: Create failed',
      );
    });
  });

  describe('save', () => {
    const mockTask: SDKTask = {
      id: 'task1',
      contextId: 'ctx1',
      kind: 'task',
      status: { state: 'working' },
      metadata: {},
    };

    it('should save metadata and workspace', async () => {
      const store = new GCSTaskStore(bucketName);
      await store.save(mockTask);

      expect(mockFile.save).toHaveBeenCalledTimes(1);
      expect(mockTar.c).toHaveBeenCalledTimes(1);
      expect(mockCreateReadStream).toHaveBeenCalledTimes(1);
      expect(mockFse.remove).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('metadata saved to GCS'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('workspace saved to GCS'),
      );
    });

    it('should handle tar creation failure', async () => {
      mockFse.pathExists.mockImplementation(
        async (path) =>
          !path.toString().includes('task-task1-workspace-test-uuid.tar.gz'),
      );
      const store = new GCSTaskStore(bucketName);
      await expect(store.save(mockTask)).rejects.toThrow(
        'tar.c command failed to create',
      );
    });
  });

  describe('load', () => {
    it('should load task metadata and workspace', async () => {
      mockGunzipSync.mockReturnValue(
        Buffer.from(
          JSON.stringify({
            [METADATA_KEY]: { _agentSettings: {}, _taskState: 'submitted' },
            _contextId: 'ctx1',
          }),
        ),
      );
      mockFile.download.mockResolvedValue([Buffer.from('compressed metadata')]);
      mockFile.download.mockResolvedValueOnce([
        Buffer.from('compressed metadata'),
      ]);
      mockBucket.file = vi.fn((path) => {
        const newMockFile = { ...mockFile };
        if (path.includes('metadata')) {
          newMockFile.download = vi
            .fn()
            .mockResolvedValue([Buffer.from('compressed metadata')]);
          newMockFile.exists = vi.fn().mockResolvedValue([true]);
        } else {
          newMockFile.download = vi
            .fn()
            .mockResolvedValue([Buffer.from('compressed workspace')]);
          newMockFile.exists = vi.fn().mockResolvedValue([true]);
        }
        return newMockFile;
      });

      const store = new GCSTaskStore(bucketName);
      const task = await store.load('task1');

      expect(task).toBeDefined();
      expect(task?.id).toBe('task1');
      expect(mockBucket.file).toHaveBeenCalledWith(
        'tasks/task1/metadata.tar.gz',
      );
      expect(mockBucket.file).toHaveBeenCalledWith(
        'tasks/task1/workspace.tar.gz',
      );
      expect(mockTar.x).toHaveBeenCalledTimes(1);
      expect(mockFse.remove).toHaveBeenCalledTimes(1);
    });

    it('should return undefined if metadata not found', async () => {
      mockFile.exists.mockResolvedValue([false]);
      const store = new GCSTaskStore(bucketName);
      const task = await store.load('task1');
      expect(task).toBeUndefined();
      expect(mockBucket.file).toHaveBeenCalledWith(
        'tasks/task1/metadata.tar.gz',
      );
    });

    it('should load metadata even if workspace not found', async () => {
      mockGunzipSync.mockReturnValue(
        Buffer.from(
          JSON.stringify({
            [METADATA_KEY]: { _agentSettings: {}, _taskState: 'submitted' },
            _contextId: 'ctx1',
          }),
        ),
      );

      mockBucket.file = vi.fn((path) => {
        const newMockFile = { ...mockFile };
        if (path.includes('workspace.tar.gz')) {
          newMockFile.exists = vi.fn().mockResolvedValue([false]);
        } else {
          newMockFile.exists = vi.fn().mockResolvedValue([true]);
          newMockFile.download = vi
            .fn()
            .mockResolvedValue([Buffer.from('compressed metadata')]);
        }
        return newMockFile;
      });

      const store = new GCSTaskStore(bucketName);
      const task = await store.load('task1');

      expect(task).toBeDefined();
      expect(mockTar.x).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('workspace archive not found'),
      );
    });
  });
});

describe('NoOpTaskStore', () => {
  let realStore: TaskStore;
  let noOpStore: NoOpTaskStore;

  beforeEach(() => {
    // Create a mock of the real store to delegate to
    realStore = {
      save: vi.fn(),
      load: vi.fn().mockResolvedValue({ id: 'task-123' } as SDKTask),
    };
    noOpStore = new NoOpTaskStore(realStore);
  });

  it("should not call the real store's save method", async () => {
    const mockTask: SDKTask = { id: 'test-task' } as SDKTask;
    await noOpStore.save(mockTask);
    expect(realStore.save).not.toHaveBeenCalled();
  });

  it('should delegate the load method to the real store', async () => {
    const taskId = 'task-123';
    const result = await noOpStore.load(taskId);
    expect(realStore.load).toHaveBeenCalledWith(taskId);
    expect(result).toBeDefined();
    expect(result?.id).toBe(taskId);
  });
});
