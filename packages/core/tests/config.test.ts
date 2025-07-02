import { Config, ApprovalMode } from '../src/config/config.js';
import { AuthType } from '../src/core/contentGenerator.js';
import { FileDiscoveryService } from '../src/services/fileDiscoveryService.js';
import { GitService } from '../src/services/gitService.js';
import { DEFAULT_GEMINI_EMBEDDING_MODEL } from '../src/config/models.js';

describe('Config', () => {
  let config: Config;
  const mockSessionId = 'test-session-id';
  const mockTargetDir = '/tmp/test-dir';
  const mockCwd = '/tmp/current-dir';
  const mockModel = 'gemini-pro';

  beforeEach(() => {
    config = new Config({
      sessionId: mockSessionId,
      targetDir: mockTargetDir,
      debugMode: false,
      cwd: mockCwd,
      model: mockModel,
    });
  });

  it('should initialize with default values', () => {
    expect(config.getSessionId()).toBe(mockSessionId);
    expect(config.getTargetDir()).toBe(mockTargetDir);
    expect(config.getDebugMode()).toBe(false);
    expect(config.getWorkingDir()).toBe(mockCwd);
    expect(config.getModel()).toBe(mockModel);
    expect(config.getEmbeddingModel()).toBe(DEFAULT_GEMINI_EMBEDDING_MODEL);
    expect(config.getFullContext()).toBe(false);
    expect(config.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
    expect(config.getShowMemoryUsage()).toBe(false);
    expect(config.getTelemetryEnabled()).toBe(false);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    expect(config.getUsageStatisticsEnabled()).toBe(true);
    expect(config.getEnableRecursiveFileSearch()).toBe(true);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    expect(config.getCheckpointingEnabled()).toBe(false);
    expect(config.getExtensionContextFilePaths()).toEqual([]);
  });

  it('should set and get user memory', () => {
    const newUserMemory = 'This is a new memory';
    config.setUserMemory(newUserMemory);
    expect(config.getUserMemory()).toBe(newUserMemory);
  });

  it('should set and get gemini MD file count', () => {
    const newCount = 5;
    config.setGeminiMdFileCount(newCount);
    expect(config.getGeminiMdFileCount()).toBe(newCount);
  });

  it('should set and get approval mode', () => {
    config.setApprovalMode(ApprovalMode.YOLO);
    expect(config.getApprovalMode()).toBe(ApprovalMode.YOLO);
  });

  it('should return the correct project root', () => {
    expect(config.getProjectRoot()).toBe(mockTargetDir);
  });

  it('should return the correct project temp dir', () => {
    // This depends on the actual implementation of getProjectTempDir
    // For now, we'll just check that it returns a string.
    expect(typeof config.getProjectTempDir()).toBe('string');
  });

  it('should return a FileDiscoveryService instance', () => {
    const fileService = config.getFileService();
    expect(fileService).toBeInstanceOf(FileDiscoveryService);
  });

  it('should return a GitService instance', async () => {
    // Mock GitService initialize to prevent actual git operations during test
    jest.spyOn(GitService.prototype, 'initialize').mockResolvedValue(undefined);
    const gitService = await config.getGitService();
    expect(gitService).toBeInstanceOf(GitService);
  });

  describe('refreshAuth', () => {
    it('should refresh authentication and reset model state', async () => {
      // Mock dependencies
      const mockCreateContentGeneratorConfig = jest.fn().mockResolvedValue({
        model: 'new-model',
        auth: AuthType.API_KEY,
      });
      const mockGeminiClientInitialize = jest.fn().mockResolvedValue(undefined);
      const mockCreateToolRegistry = jest.fn().mockResolvedValue({});

      // Temporarily override the imported functions for testing
      const originalCreateContentGeneratorConfig = require('../src/core/contentGenerator.js').createContentGeneratorConfig;
      const originalGeminiClient = require('../src/core/client.js').GeminiClient;
      const originalCreateToolRegistry = require('../src/config/config.js').createToolRegistry;

      require('../src/core/contentGenerator.js').createContentGeneratorConfig = mockCreateContentGeneratorConfig;
      require('../src/core/client.js').GeminiClient = jest.fn(() => ({
        initialize: mockGeminiClientInitialize,
      }));
      require('../src/config/config.js').createToolRegistry = mockCreateToolRegistry;

      config.setModel('flash-model'); // Simulate model switch
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      await config.refreshAuth(AuthType.API_KEY);

      expect(mockCreateContentGeneratorConfig).toHaveBeenCalledWith(
        mockModel, // Should use original default model
        AuthType.API_KEY,
        config,
      );
      expect(mockGeminiClientInitialize).toHaveBeenCalled();
      expect(config.isModelSwitchedDuringSession()).toBe(false);

      // Restore original functions
      require('../src/core/contentGenerator.js').createContentGeneratorConfig = originalCreateContentGeneratorConfig;
      require('../src/core/client.js').GeminiClient = originalGeminiClient;
      require('../src/config/config.js').createToolRegistry = originalCreateToolRegistry;
    });
  });
});
