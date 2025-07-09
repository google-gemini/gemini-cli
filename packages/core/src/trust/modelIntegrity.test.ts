/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';
import { ModelIntegrityChecker } from './modelIntegrity.js';
import * as crypto from 'crypto';

vi.mock('fs/promises');
vi.mock('fs');

describe('ModelIntegrityChecker', () => {
  let checker: ModelIntegrityChecker;
  const testConfigDir = '/test/config';
  const testModelPath = '/test/models/test-model.gguf';
  
  beforeEach(() => {
    vi.clearAllMocks();
    checker = new ModelIntegrityChecker(testConfigDir);
  });

  describe('initialize', () => {
    it('should load existing trusted registry', async () => {
      const mockRegistry = {
        models: {
          'test-model': {
            sha256: 'abc123',
            size: 1000,
            source: 'test-source',
            addedDate: '2025-01-01',
            lastUpdated: '2025-01-01'
          }
        },
        version: '1.0.0',
        lastUpdated: '2025-01-01'
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      await checker.initialize();

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(testConfigDir, 'trusted-models.json'),
        'utf-8'
      );
    });

    it('should create default registry if none exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();

      await checker.initialize();

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('computeFileHashes', () => {
    it('should compute SHA-256 hash with progress', async () => {
      const mockStats = { size: 1000 } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const progressUpdates: number[] = [];
      const hashPromise = checker.computeFileHashes(
        testModelPath,
        ['sha256'],
        (processed, total) => progressUpdates.push(processed)
      );

      // Simulate streaming data
      mockStream.emit('data', Buffer.from('test data chunk 1'));
      mockStream.emit('data', Buffer.from('test data chunk 2'));
      mockStream.emit('end');

      const result = await hashPromise;

      expect(result).toHaveProperty('sha256');
      expect(typeof result.sha256).toBe('string');
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should handle multiple hash algorithms', async () => {
      const mockStats = { size: 100 } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const hashPromise = checker.computeFileHashes(
        testModelPath,
        ['sha256', 'md5']
      );

      mockStream.emit('data', Buffer.from('test data'));
      mockStream.emit('end');

      const result = await hashPromise;

      expect(result).toHaveProperty('sha256');
      expect(result).toHaveProperty('md5');
    });
  });

  describe('verifyModel', () => {
    it('should verify model successfully with matching hash', async () => {
      const mockStats = { 
        size: 1000,
        isFile: () => true 
      } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      // Initialize with trusted model
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        models: {
          'test-model': {
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            size: 1000,
            source: 'test',
            addedDate: '2025-01-01',
            lastUpdated: '2025-01-01'
          }
        },
        version: '1.0.0',
        lastUpdated: '2025-01-01'
      }));

      await checker.initialize();

      const verifyPromise = checker.verifyModel(
        testModelPath,
        'test-model',
        'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
      );

      // Simulate file content that produces the expected hash
      mockStream.emit('data', Buffer.from('test'));
      mockStream.emit('end');

      const result = await verifyPromise;

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('verified successfully');
    });

    it('should fail verification with hash mismatch', async () => {
      const mockStats = { 
        size: 1000,
        isFile: () => true 
      } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const verifyPromise = checker.verifyModel(
        testModelPath,
        'test-model',
        'sha256:wronghash123'
      );

      mockStream.emit('data', Buffer.from('test data'));
      mockStream.emit('end');

      const result = await verifyPromise;

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Hash mismatch');
    });

    it('should fail if file does not exist', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

      const result = await checker.verifyModel(
        testModelPath,
        'test-model'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Verification error');
    });

    it('should update registry for first verification', async () => {
      const mockStats = { 
        size: 1000,
        isFile: () => true 
      } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      // Initialize with pending verification
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        models: {
          'test-model': {
            sha256: 'pending_verification',
            size: 1000,
            source: 'test',
            addedDate: '2025-01-01',
            lastUpdated: '2025-01-01'
          }
        },
        version: '1.0.0',
        lastUpdated: '2025-01-01'
      }));

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();

      await checker.initialize();

      const verifyPromise = checker.verifyModel(
        testModelPath,
        'test-model'
      );

      mockStream.emit('data', Buffer.from('test'));
      mockStream.emit('end');

      await verifyPromise;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('trusted-models.json'),
        expect.stringContaining('"sha256"')
      );
    });
  });

  describe('addTrustedModel', () => {
    it('should add new model to registry', async () => {
      const mockStats = { size: 2000 } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();

      await checker.initialize();

      const addPromise = checker.addTrustedModel(
        'new-model',
        '/path/to/new-model.gguf',
        'https://example.com/model'
      );

      mockStream.emit('data', Buffer.from('model data'));
      mockStream.emit('end');

      await addPromise;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('new-model')
      );
    });
  });

  describe('generateIntegrityReport', () => {
    it('should generate complete integrity report', async () => {
      const mockStats = { 
        size: 1500,
        isFile: () => true,
        birthtime: new Date('2025-01-01')
      } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      // Initialize with trusted model
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        models: {
          'test-model': {
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            size: 1500,
            source: 'test',
            addedDate: '2025-01-01',
            lastUpdated: '2025-01-01'
          }
        },
        version: '1.0.0',
        lastUpdated: '2025-01-01'
      }));

      await checker.initialize();

      const reportPromise = checker.generateIntegrityReport(
        testModelPath,
        'test-model'
      );

      mockStream.emit('data', Buffer.from('test'));
      mockStream.emit('end');

      const report = await reportPromise;

      expect(report).toMatchObject({
        modelName: 'test-model',
        filePath: testModelPath,
        fileSize: 1500,
        sha256Hash: expect.stringContaining('sha256:'),
        trustedSource: true,
        signatureValid: true
      });
    });
  });

  describe('createModelManifest', () => {
    it('should create manifest file with metadata', async () => {
      const mockStats = { 
        size: 1000,
        isFile: () => true,
        birthtime: new Date('2025-01-01')
      } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      vi.mocked(fs.writeFile).mockResolvedValue();

      const manifestPromise = checker.createModelManifest(
        testModelPath,
        'test-model',
        { version: '1.0', author: 'test' }
      );

      mockStream.emit('data', Buffer.from('test'));
      mockStream.emit('end');

      const manifestPath = await manifestPromise;

      expect(manifestPath).toBe(`${testModelPath}.manifest.json`);
      expect(fs.writeFile).toHaveBeenCalledWith(
        manifestPath,
        expect.stringContaining('"version": "1.0"')
      );
    });
  });

  describe('verifyAllModels', () => {
    it('should verify all GGUF files in directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'model1.gguf',
        'model2.gguf',
        'other.txt'
      ] as any);

      const mockStats = { 
        size: 1000,
        isFile: () => true 
      } as any;
      vi.mocked(fs.stat).mockResolvedValue(mockStats);

      const mockStream = new Readable();
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const resultsPromise = checker.verifyAllModels('/models');

      // Emit data for each verification
      for (let i = 0; i < 2; i++) {
        mockStream.emit('data', Buffer.from('test'));
        mockStream.emit('end');
      }

      const results = await resultsPromise;

      expect(results.size).toBe(2);
      expect(results.has('model1')).toBe(true);
      expect(results.has('model2')).toBe(true);
    });
  });

  describe('export/import integrity database', () => {
    it('should export database to file', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await checker.exportIntegrityDatabase('/backup/integrity.json');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/backup/integrity.json',
        expect.stringContaining('"exportDate"')
      );
    });

    it('should import database from file', async () => {
      const backupData = {
        trustedRegistry: {
          models: { 'imported-model': { sha256: 'xyz789' } },
          version: '1.0.0',
          lastUpdated: '2025-01-01'
        },
        exportDate: '2025-01-01',
        version: '1.0'
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(backupData));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();

      await checker.importIntegrityDatabase('/backup/integrity.json');

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('trusted-models.json'),
        expect.stringContaining('imported-model')
      );
    });
  });
});