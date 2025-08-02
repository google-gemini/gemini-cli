/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { jest } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadEnvironment } from '../config.js';
import { GEMINI_CONFIG_DIR as GEMINI_DIR } from '@google/gemini-cli-core';

// Mock modules
jest.mock('node:fs');
jest.mock('dotenv');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockDotenv = jest.mocked(await import('dotenv'));

describe('loadEnvironment', () => {
  const originalCwd = process.cwd();
  const homeDir = os.homedir();
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.cwd to original
    process.chdir(originalCwd);
  });

  describe('when ignoreLocalEnv is false (default)', () => {
    it('should load .env from current directory if it exists', () => {
      const projectEnvPath = path.join('/project', '.env');
      mockFs.existsSync.mockImplementation((p) => p === projectEnvPath);
      
      process.chdir('/project');
      loadEnvironment(false);
      
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: projectEnvPath,
        quiet: true
      });
    });

    it('should load .env from parent directory if not in current', () => {
      const parentEnvPath = path.join('/parent', '.env');
      mockFs.existsSync.mockImplementation((p) => p === parentEnvPath);
      
      process.chdir('/parent/child');
      loadEnvironment(false);
      
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: parentEnvPath,
        quiet: true
      });
    });

    it('should prefer .gemini/.env over regular .env in project', () => {
      const geminiEnvPath = path.join('/project', GEMINI_DIR, '.env');
      const regularEnvPath = path.join('/project', '.env');
      
      mockFs.existsSync.mockImplementation((p) => 
        p === geminiEnvPath || p === regularEnvPath
      );
      
      process.chdir('/project');
      loadEnvironment(false);
      
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: geminiEnvPath,
        quiet: true
      });
    });

    it('should fallback to home directory .env if no project .env found', () => {
      const homeEnvPath = path.join(homeDir, '.env');
      mockFs.existsSync.mockImplementation((p) => p === homeEnvPath);
      
      process.chdir('/some/project');
      loadEnvironment(false);
      
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: homeEnvPath,
        quiet: true
      });
    });

    it('should prefer home .gemini/.env over home .env', () => {
      const homeGeminiEnvPath = path.join(homeDir, GEMINI_DIR, '.env');
      const homeEnvPath = path.join(homeDir, '.env');
      
      mockFs.existsSync.mockImplementation((p) => 
        p === homeGeminiEnvPath || p === homeEnvPath
      );
      
      process.chdir('/some/project');
      loadEnvironment(false);
      
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: homeGeminiEnvPath,
        quiet: true
      });
    });
  });

  describe('when ignoreLocalEnv is true', () => {
    it('should only load from global Gemini CLI locations', () => {
      const projectEnvPath = path.join('/project', '.env');
      const homeGeminiEnvPath = path.join(homeDir, GEMINI_DIR, '.env');
      
      mockFs.existsSync.mockImplementation((p) => 
        p === projectEnvPath || p === homeGeminiEnvPath
      );
      
      process.chdir('/project');
      loadEnvironment(true);
      
      // Should NOT load the project .env
      expect(mockDotenv.config).not.toHaveBeenCalledWith({
        path: projectEnvPath,
        quiet: true
      });
      
      // Should load the home Gemini .env
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: homeGeminiEnvPath,
        quiet: true
      });
    });

    it('should ignore project .env files completely', () => {
      const projectEnvPath = path.join('/project', '.env');
      const projectGeminiEnvPath = path.join('/project', GEMINI_DIR, '.env');
      const homeEnvPath = path.join(homeDir, '.env');
      
      mockFs.existsSync.mockImplementation((p) => 
        p === projectEnvPath || p === projectGeminiEnvPath || p === homeEnvPath
      );
      
      process.chdir('/project');
      loadEnvironment(true);
      
      // Should NOT load any project .env files
      expect(mockDotenv.config).not.toHaveBeenCalledWith({
        path: projectEnvPath,
        quiet: true
      });
      expect(mockDotenv.config).not.toHaveBeenCalledWith({
        path: projectGeminiEnvPath,
        quiet: true
      });
      
      // Should load the home .env
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: homeEnvPath,
        quiet: true
      });
    });

    it('should prefer home .gemini/.env over home .env when ignoring local', () => {
      const homeGeminiEnvPath = path.join(homeDir, GEMINI_DIR, '.env');
      const homeEnvPath = path.join(homeDir, '.env');
      
      mockFs.existsSync.mockImplementation((p) => 
        p === homeGeminiEnvPath || p === homeEnvPath
      );
      
      loadEnvironment(true);
      
      expect(mockDotenv.config).toHaveBeenCalledWith({
        path: homeGeminiEnvPath,
        quiet: true
      });
      expect(mockDotenv.config).toHaveBeenCalledTimes(1);
    });

    it('should not load any .env if none exist in global locations', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      loadEnvironment(true);
      
      expect(mockDotenv.config).not.toHaveBeenCalled();
    });
  });
});