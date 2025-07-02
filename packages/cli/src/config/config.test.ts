import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as os from 'os';
import { loadCliConfig, CliConfig } from './config.js'; // Assuming this is the correct path
import { Settings, TelemetrySettings } from './settings.js'; // Assuming these are the correct paths
import { Extension } from './extension.js'; // Assuming this is the correct path
import * as ServerConfig from '@google/gemini-cli-core'; // Assuming this is the correct import

// --- Global Mocks ---
// Mocking os module for homedir
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(), // Will be mocked in beforeEach/beforeAll
  };
});

// Mocking 'open' library
vi.mock('open', () => ({
  default: vi.fn(),
}));

// Mocking 'read-package-up' library
vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(() =>
    Promise.resolve({ packageJson: { version: 'test-version' } }),
  ),
}));

// Mocking '@google/gemini-cli-core' for specific functions
vi.mock('@google/gemini-cli-core', async () => {
  const actualServer = await vi.importActual<typeof ServerConfig>(
    '@google/gemini-cli-core',
  );
  return {
    ...actualServer,
    // Mocking loadEnvironment to return a predictable value or do nothing if not used by loadCliConfig
    loadEnvironment: vi.fn(),                                                               // Mocking loadServerHierarchicalMemory to return a controlled response
    loadServerHierarchicalMemory: vi.fn(
      (
        cwd: string,
        showMemoryUsage: boolean,
        session: string,
        extensionPaths: string[] | undefined,
      ) => {                                                                                    // Simulate some memory content based on inputs for testing
        const memoryContent = extensionPaths?.filter(Boolean).join(',') || 'no_paths';
        const fileCount = extensionPaths?.filter(Boolean).length || 0;
        return Promise.resolve({
          memoryContent,
          fileCount,
          // Add other properties that loadServerHierarchicalMemory might return
          // if they are used by loadCliConfig and need to be controlled.                         // For example, if it returns metadata or specific parsed content.
          metadata: {
            cwd: cwd,
            showMemoryUsage: showMemoryUsage,
            session: session,
            pathsCount: fileCount,
          },
        });
      },
    ),
    // Mocking mergeMcpServers if it's a function that loadCliConfig calls internally
    // If loadCliConfig itself contains the logic, this mock is not needed for mergeMcpServers.
    // Assuming loadCliConfig uses a function from this module for merging.
    // If loadCliConfig has the merge logic, we'll test that logic directly within loadCliConfig tests.
    mergeMcpServers: vi.fn(
      (baseServers: ServerConfig.McpServers, newServers: ServerConfig.McpServers) => ({
        ...baseServers,
        ...newServers,
      }),
    ),
    // Assuming there's a default target constant
    DEFAULT_TELEMETRY_TARGET: 'default-target',
  };                                                                                    });

// --- Type Aliases for Clarity ---
type Mocked<T> = vi.Mocked<T>;
const mockedOsHomedir = vi.mocked(os.homedir);
const mockedLoadServerHierarchicalMemory = vi.mocked(ServerConfig.loadServerHierarchicalMemory);
const mockedOpen = vi.mocked(open);
const mockedReadPackageUp = vi.mocked(readPackageUp);

// --- Test Suite for loadCliConfig ---
describe('loadCliConfig', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  // --- Global Setup and Teardown ---
  beforeAll(() => {
    // Set a default home directory for all tests
    mockedOsHomedir.mockReturnValue('/mock/home/user');
  });

  beforeEach(() => {                                                                        // Reset all mocks before each test to ensure isolation
    vi.resetAllMocks();

    // Ensure API key is set for tests that might implicitly rely on it.
    // If specific tests need it absent, they should unset it.
    process.env.GEMINI_API_KEY = 'test-api-key';

    // Restore default mock behavior for homedir if it was changed in a specific test       mockedOsHomedir.mockReturnValue('/mock/home/user');

    // Reset process.argv to a minimal state before each test
    process.argv = ['node', 'script.js'];
  });

  afterEach(() => {
    // Restore original argv and env after each test                                        process.argv = originalArgv;
    process.env = originalEnv;
  });

  afterAll(() => {
    // Clean up any mocks that might have been permanently altered
    vi.restoreAllMocks();
  });                                                                                   
  // --- Test Suite: showMemoryUsage ---
  describe('showMemoryUsage', () => {
    // 18. Test Default Settings
    it('should default to false when no flag or settings are provided', async () => {
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(false);                                        expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false, // showMemoryUsage should be false
        'test-session',
        expect.any(Array),
      );
    });

    // 19. Test settings overriding CLI (implicitly tested below by prioritizing CLI)
    // 20. Test CLI overriding settings
    it('should prioritize CLI flag --show_memory_usage over settings', async () => {
      process.argv = ['node', 'script.js', '--show_memory_usage'];
      const settings: Settings = { showMemoryUsage: false };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(true);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        true, // showMemoryUsage should be true
        'test-session',
        expect.any(Array),
      );
    });

    it('should prioritize CLI flag --no-show_memory_usage over settings', async () => {
      process.argv = ['node', 'script.js', '--no-show_memory_usage'];
      const settings: Settings = { showMemoryUsage: true };                                   const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(false);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false, // showMemoryUsage should be false
        'test-session',
        expect.any(Array),
      );                                                                                    });

    it('should use settings value when no CLI flag is present', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { showMemoryUsage: true };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(true);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        true, // showMemoryUsage should be true
        'test-session',
        expect.any(Array),
      );
    });

    // 21. Test undefined showMemoryUsage in settings
    it('should default to false if settings.showMemoryUsage is undefined', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { /* showMemoryUsage is undefined */ };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(false);                                        expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false, // showMemoryUsage should be false
        'test-session',
        expect.any(Array),
      );
    });

    // 22. Test null showMemoryUsage in settings
    it('should default to false if settings.showMemoryUsage is null', async () => {           process.argv = ['node', 'script.js'];
      const settings: Settings = { showMemoryUsage: null as any }; // Cast to any for null
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(false);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false, // showMemoryUsage should be false                                               'test-session',
        expect.any(Array),
      );
    });

    // Additional tests for showMemoryUsage
    it('should set to true when only --show_memory_usage flag is present', async () => {
      process.argv = ['node', 'script.js', '--show_memory_usage'];                            const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(true);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        true,
        'test-session',
        expect.any(Array),                                                                    );
    });

    it('should set to false when only --no-show_memory_usage flag is present', async () => {
      process.argv = ['node', 'script.js', '--no-show_memory_usage'];
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getShowMemoryUsage()).toBe(false);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false,
        'test-session',
        expect.any(Array),
      );
    });
  });

  // --- Test Suite: telemetry ---
  describe('telemetry', () => {                                                             // 25. Test telemetry.enabled default
    it('should default telemetry.enabled to false when no flag or settings are provided', async () => {
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(false);
    });

    // 26. Test telemetry.enabled precedence
    it('should prioritize --telemetry CLI flag over settings', async () => {
      process.argv = ['node', 'script.js', '--telemetry'];
      const settings: Settings = { telemetry: { enabled: false } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(true);
    });

    it('should prioritize --no-telemetry CLI flag over settings', async () => {
      process.argv = ['node', 'script.js', '--no-telemetry'];
      const settings: Settings = { telemetry: { enabled: true } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(false);
    });

    it('should use telemetry.enabled from settings when no CLI flag is present', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(true);
    });

    // 27. Test telemetry.otlpEndpoint default
    it('should use default OTLP endpoint if not provided via CLI or settings', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true } }; // Enabled, but no endpoint
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
    });

    // 28. Test telemetry.otlpEndpoint precedence
    it('should prioritize --telemetry-otlp-endpoint CLI flag over settings', async () => {
      process.argv = ['node', 'script.js', '--telemetry-otlp-endpoint', 'http://cli.example.com'];
      const settings: Settings = { telemetry: { enabled: true, otlpEndpoint: 'http://settings.example.com' } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://cli.example.com');
    });

    it('should use telemetry.otlpEndpoint from settings when no CLI flag is present', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true, otlpEndpoint: 'http://settings.example.com' } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://settings.example.com');
    });

    // 29. Test telemetry.otlpEndpoint with empty settings
    it('should use default OTLP endpoint when settings.telemetry is an empty object', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: {} }; // Empty telemetry object
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
    });

    // 30. Test telemetry.target default
    it('should use default target if not provided via CLI or settings', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryTarget()).toBe(ServerConfig.DEFAULT_TELEMETRY_TARGET);
    });

    // 31. Test telemetry.target precedence
    it('should prioritize --telemetry-target CLI flag over settings', async () => {
      process.argv = ['node', 'script.js', '--telemetry-target', 'gcp'];
      const settings: Settings = { telemetry: { enabled: true, target: 'manual' } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryTarget()).toBe('gcp');
    });

    it('should use telemetry.target from settings when no CLI flag is present', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true, target: 'manual' } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryTarget()).toBe('manual');
    });

    // 32. Test telemetry.target with invalid values (if applicable)
    // This depends on how 'target' is validated. If it's just a string, this might not be applicable.
    // If there's a specific enum or set of allowed values, add tests for invalid inputs.
    // Example (assuming 'gcp' and 'default-target' are valid, and 'invalid-target' is not):
    // it('should handle invalid telemetry.target values gracefully (e.g., by defaulting)', async () => {
    //   process.argv = ['node', 'script.js', '--telemetry-target', 'invalid-target'];
    //   const settings: Settings = { telemetry: { enabled: true } };
    //   const config = await loadCliConfig(settings, [], 'test-session');
    //   expect(config.getTelemetryTarget()).toBe(ServerConfig.DEFAULT_TELEMETRY_TARGET); // Assuming it defaults
    // });

    // 33. Test telemetry.logPrompts default
    it('should use default logPrompts value (true) if not provided via CLI or settings', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    // 34. Test telemetry.logPrompts precedence
    it('should prioritize --telemetry-log-prompts CLI flag over settings', async () => {
      process.argv = ['node', 'script.js', '--telemetry-log-prompts'];
      const settings: Settings = { telemetry: { enabled: true, logPrompts: false } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('should prioritize --no-telemetry-log-prompts CLI flag over settings', async () => {
      process.argv = ['node', 'script.js', '--no-telemetry-log-prompts'];
      const settings: Settings = { telemetry: { enabled: true, logPrompts: true } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
    });

    it('should use telemetry.logPrompts from settings when no CLI flag is present', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true, logPrompts: false } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
    });

    // 35. Test telemetry.logPrompts with undefined in settings
    it('should default logPrompts to true if settings.telemetry.logPrompts is undefined', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true /* logPrompts undefined */ } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    // 36. Test telemetry.logPrompts with null in settings
    it('should default logPrompts to true if settings.telemetry.logPrompts is null', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: { enabled: true, logPrompts: null as any } };
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    // Additional telemetry tests
    it('should set telemetry.enabled to true when only --telemetry flag is present', async () => {
      process.argv = ['node', 'script.js', '--telemetry'];
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(true);
    });

    it('should set telemetry.enabled to false when only --no-telemetry flag is present', async () => {
      process.argv = ['node', 'script.js', '--no-telemetry'];
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(false);
    });

    it('should correctly set telemetry.otlpEndpoint from CLI when settings.telemetry is undefined', async () => {
      process.argv = ['node', 'script.js', '--telemetry', '--telemetry-otlp-endpoint', 'http://cli.only.com'];
      const settings: Settings = {}; // No telemetry settings
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(true);
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://cli.only.com');
    });

    it('should correctly set telemetry.target from CLI when settings.telemetry is undefined', async () => {
      process.argv = ['node', 'script.js', '--telemetry', '--telemetry-target', 'custom'];
      const settings: Settings = {}; // No telemetry settings
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(true);
      expect(config.getTelemetryTarget()).toBe('custom');
    });

    it('should correctly set telemetry.logPrompts from CLI when settings.telemetry is undefined', async () => {
      process.argv = ['node', 'script.js', '--telemetry', '--telemetry-log-prompts'];
      const settings: Settings = {}; // No telemetry settings
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(true);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('should handle telemetry settings being completely absent', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');
      expect(config.getTelemetryEnabled()).toBe(false);
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
      expect(config.getTelemetryTarget()).toBe(ServerConfig.DEFAULT_TELEMETRY_TARGET);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });
  });

  // --- Test Suite: Hierarchical Memory Loading ---
  describe('hierarchical memory loading', () => {
    const extensions1: Extension[] = [
      {
        config: { name: 'ext1', version: '1.0.0' },
        contextFiles: ['/path/to/ext1/GEMINI.md'],
      },
      {
        config: { name: 'ext2', version: '1.0.0' },
        contextFiles: [], // Empty context files
      },
      {
        config: { name: 'ext3', version: '1.0.0' },
        contextFiles: ['/path/to/ext3/context1.md', '/path/to/ext3/context2.md'],
      },
      {
        config: { name: 'ext4', version: '1.0.0' },
        contextFiles: ['/path/to/ext4/GEMINI.md', null, undefined, ''].filter(Boolean) as string[], // Test filtering bad values
      },
    ];

    // 41. Clarify Mocking: The mock is above, explaining its purpose.                      // 42. Test loadServerHierarchicalMemory arguments
    it('should call loadServerHierarchicalMemory with correct arguments', async () => {
      const session = 'test-session';
      const settings: Settings = {};
      await loadCliConfig(settings, extensions1, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      // Check that the correct arguments were passed to the mocked function
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String), // cwd - will be tested separately
        false, // showMemoryUsage - default false in this test
        session,
        // Expecting an array containing all valid context files from extensions
        expect.arrayContaining([
          '/path/to/ext1/GEMINI.md',
          '/path/to/ext3/context1.md',
          '/path/to/ext3/context2.md',
          '/path/to/ext4/GEMINI.md',
        ]),
      );
      // Ensure the array passed to the mock does not contain empty/null/undefined values
      const passedPaths = mockedLoadServerHierarchicalMemory.mock.calls[0][3] as string[];
      expect(passedPaths.every(path => path && typeof path === 'string')).toBe(true);
      expect(passedPaths.length).toBe(4); // Ensure only valid paths are counted
    });

    // 43. Test loadServerHierarchicalMemory with no extensions
    it('should call loadServerHierarchicalMemory with an empty array if no extensions are provided', async () => {
      const session = 'test-session';
      const settings: Settings = {};
      await loadCliConfig(settings, [], session); // No extensions

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false, // default showMemoryUsage
        session,
        [], // Expecting an empty array
      );
    });

    // 44. Test loadServerHierarchicalMemory with extensions having no context files
    it('should call loadServerHierarchicalMemory with an empty array if extensions have no contextFiles', async () => {
      const session = 'test-session';
      const settings: Settings = {};
      const extensionsWithoutFiles: Extension[] = [
        { config: { name: 'ext1', version: '1.0.0' }, contextFiles: [] },
        { config: { name: 'ext2', version: '1.0.0' }, contextFiles: undefined as any }, // Test undefined
        { config: { name: 'ext3', version: '1.0.0' }, contextFiles: null as any }, // Test null
      ];

      await loadCliConfig(settings, extensionsWithoutFiles, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false,
        session,
        [], // Expecting an empty array
      );
    });

    // 45. Test loadServerHierarchicalMemory with extensions having empty context files arrays
    // This is covered by the previous test case (44) which uses `contextFiles: []`.

    // 46. Test the showMemoryUsage flag's effect on loadServerHierarchicalMemory
    it('should pass showMemoryUsage=true to loadServerHierarchicalMemory when flag is present', async () => {
      process.argv = ['node', 'script.js', '--show_memory_usage'];
      const session = 'test-session';
      const settings: Settings = {};
      await loadCliConfig(settings, extensions1, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        true, // showMemoryUsage should be true
        session,
        expect.any(Array),
      );
    });

    it('should pass showMemoryUsage=false to loadServerHierarchicalMemory when --no-show_memory_usage flag is present', async () => {
      process.argv = ['node', 'script.js', '--no-show_memory_usage'];
      const session = 'test-session';
      const settings: Settings = {};
      await loadCliConfig(settings, extensions1, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        false, // showMemoryUsage should be false
        session,
        expect.any(Array),
      );
    });

    it('should pass showMemoryUsage=true to loadServerHierarchicalMemory when settings.showMemoryUsage is true', async () => {
      process.argv = ['node', 'script.js'];
      const session = 'test-session';
      const settings: Settings = { showMemoryUsage: true };
      await loadCliConfig(settings, extensions1, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        true, // showMemoryUsage should be true
        session,
        expect.any(Array),
      );
    });

    // 47. Add a test for the cwd argument
    it('should pass the correct cwd to loadServerHierarchicalMemory', async () => {
      const mockCwd = '/custom/working/directory';
      // Temporarily spy on process.cwd() for this test
      const processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      const session = 'test-session';
      const settings: Settings = {};
      await loadCliConfig(settings, extensions1, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        mockCwd, // Expecting the mocked cwd
        expect.any(Boolean),
        session,
        expect.any(Array),
      );

      // Restore the original process.cwd function
      processCwdSpy.mockRestore();
    });

    // 48. Add a test for the session argument
    it('should pass the provided session argument to loadServerHierarchicalMemory', async () => {
      const session = 'unique-test-session-id';
      const settings: Settings = {};
      await loadCliConfig(settings, extensions1, session);

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Boolean),
        session, // Expecting the provided session string
        expect.any(Array),
      );
    });

    // 49. Address the NOTE TO FUTURE DEVELOPERS
    // The current mock for loadServerHierarchicalMemory simulates its behavior.
    // If loadCliConfig *uses* the returned value of loadServerHierarchicalMemory,
    // we should test that usage. For example, if it sets a property on the CliConfig.
    it('should use the memoryContent returned by loadServerHierarchicalMemory', async () => {
      const mockMemoryContent = 'simulated-memory-content-from-mock';
      // Configure the mock to return a specific value for this test
      mockedLoadServerHierarchicalMemory.mockResolvedValueOnce({
        memoryContent: mockMemoryContent,
        fileCount: 5,
        metadata: {},
      });
                                                                                              const session = 'test-session';
      const settings: Settings = {};
      const config = await loadCliConfig(settings, extensions1, session);

      // Assuming CliConfig has a method like getMemoryContent()
      expect(config.getMemoryContent()).toBe(mockMemoryContent);
    });
                                                                                            it('should use the fileCount returned by loadServerHierarchicalMemory', async () => {
      const mockFileCount = 10;
      mockedLoadServerHierarchicalMemory.mockResolvedValueOnce({
        memoryContent: 'some-content',
        fileCount: mockFileCount,
        metadata: {},
      });                                                                               
      const session = 'test-session';
      const settings: Settings = {};
      const config = await loadCliConfig(settings, extensions1, session);

      // Assuming CliConfig has a method like getMemoryFileCount()
      expect(config.getMemoryFileCount()).toBe(mockFileCount);
    });
  });

  // --- Test Suite: mergeMcpServers ---
  describe('mergeMcpServers', () => {
    // 50. Fix the broken mergeMcpServers test
    // This assumes loadCliConfig internally calls ServerConfig.mergeMcpServers or has similar logic.
    // If loadCliConfig *itself* contains the merging logic, we'll test that logic directly.
    // For this example, let's assume loadCliConfig uses ServerConfig.mergeMcpServers and then stores the result.

    it('should correctly merge mcpServers from settings and extensions', async () => {
      const initialSettings: Settings = {
        mcpServers: {
          'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
          'override-me': { url: 'http://old.example.com', name: 'Old Server' },                 },
      };
      const extensions: Extension[] = [
        {
          config: {
            name: 'ext1',
            version: '1.0.0',
            mcpServers: {
              'ext1-server': { url: 'http://localhost:8081', name: 'Extension 1 Server' },
              'override-me': { url: 'http://new.example.com', name: 'New Server' }, // This should override 'override-me'
            },
          },
          contextFiles: [],
        },
        {
          config: { name: 'ext2', version: '1.0.0' }, // No mcpServers here
          contextFiles: [],
        },
        {
          config: {                                                                                 name: 'ext3',
            version: '1.0.0',
            mcpServers: {
              'ext3-server': { url: 'http://localhost:8082', name: 'Extension 3 Server' },
            },
          },
          contextFiles: [],                                                                     },
      ];

      // Call loadCliConfig. We assume it uses ServerConfig.mergeMcpServers internally.
      const config = await loadCliConfig(initialSettings, extensions, 'test-session');

      // Assert that the merged servers are correctly stored in the config object.
      // This assumes a method like `getMcpServers()` on the returned CliConfig.              expect(config.getMcpServers()).toEqual({
        'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
        'ext1-server': { url: 'http://localhost:8081', name: 'Extension 1 Server' },
        'override-me': { url: 'http://new.example.com', name: 'New Server' }, // Overridden value
        'ext3-server': { url: 'http://localhost:8082', name: 'Extension 3 Server' },
      });
                                                                                              // Verify that the mock for mergeMcpServers was called correctly (if applicable)
      // Note: If loadCliConfig has the merging logic directly, this mock might not be called.
      // If loadCliConfig calls ServerConfig.mergeMcpServers, then we can check its arguments.
      // Let's assume loadCliConfig calls it once with the settings and then iterates extensions.
      // This part is highly dependent on the internal implementation of loadCliConfig. 
      // Example if loadCliConfig first calls mergeMcpServers with settings, then merges each extension:
      // expect(mockedMergeMcpServers).toHaveBeenCalledTimes(1 + extensions.length);
      // expect(mockedMergeMcpServers).toHaveBeenCalledWith(
      //   initialSettings.mcpServers,
      //   expect.anything() // The servers from the first extension
      // );
      // expect(mockedMergeMcpServers).toHaveBeenCalledWith(
      //   expect.any(Object), // The result of the previous merge
      //   extensions[2].config.mcpServers // The servers from the third extension
      // );
    });

    it('should not mutate the original settings.mcpServers object', async () => {
      const initialSettings: Settings = {
        mcpServers: {
          'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
        },
      };
      // Deep copy the initial settings to compare later
      const originalSettingsClone = JSON.parse(JSON.stringify(initialSettings));

      const extensions: Extension[] = [
        {
          config: {                                                                                 name: 'ext1',
            version: '1.0.0',
            mcpServers: {
              'ext1-server': { url: 'http://localhost:8081', name: 'Extension 1 Server' },
            },
          },
          contextFiles: [],                                                                     },
      ];

      // Call the function that might modify settings
      await loadCliConfig(initialSettings, extensions, 'test-session');

      // Assert that the original settings object was not mutated
      expect(initialSettings).toEqual(originalSettingsClone);
    });

    it('should handle cases where settings.mcpServers is undefined', async () => {
      const initialSettings: Settings = {}; // No mcpServers in settings
      const extensions: Extension[] = [
        {
          config: {
            name: 'ext1',
            version: '1.0.0',
            mcpServers: {
              'ext1-server': { url: 'http://localhost:8081', name: 'Extension 1 Server' },
            },                                                                                    },
          contextFiles: [],
        },
      ];

      const config = await loadCliConfig(initialSettings, extensions, 'test-session');

      expect(config.getMcpServers()).toEqual({
        'ext1-server': { url: 'http://localhost:8081', name: 'Extension 1 Server' },
      });                                                                                   });

    it('should handle cases where an extension.config.mcpServers is undefined', async () => {
      const initialSettings: Settings = {
        mcpServers: {
          'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
        },                                                                                    };
      const extensions: Extension[] = [
        {
          config: { name: 'ext1', version: '1.0.0' }, // No mcpServers property
          contextFiles: [],
        },
      ];
                                                                                              const config = await loadCliConfig(initialSettings, extensions, 'test-session');

      expect(config.getMcpServers()).toEqual({
        'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
      });
    });

    it('should handle cases where an extension.config.mcpServers is an empty object', async () => {
      const initialSettings: Settings = {
        mcpServers: {
          'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
        },
      };
      const extensions: Extension[] = [
        {
          config: { name: 'ext1', version: '1.0.0', mcpServers: {} }, // Empty mcpServers
          contextFiles: [],
        },
      ];

      const config = await loadCliConfig(initialSettings, extensions, 'test-session');

      expect(config.getMcpServers()).toEqual({
        'default-server': { url: 'http://localhost:8080', name: 'Default Server' },
      });
    });                                                                                   });

  // --- Additional Test Suites based on your suggestions ---

  // 9. Test Edge Cases: Empty settings, no extensions, invalid CLI arguments
  describe('edge cases', () => {
    it('should handle empty settings and no extensions gracefully', async () => {
      process.argv = ['node', 'script.js']; // No flags
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session');

      // Check all default values are applied
      expect(config.getShowMemoryUsage()).toBe(false);
      expect(config.getTelemetryEnabled()).toBe(false);
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
      expect(config.getTelemetryTarget()).toBe(ServerConfig.DEFAULT_TELEMETRY_TARGET);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
      expect(config.getMcpServers()).toEqual({}); // Default empty mcpServers
      expect(config.getMemoryContent()).toBe('no_paths'); // From mocked loadServerHierarchicalMemory
      expect(config.getMemoryFileCount()).toBe(0); // From mocked loadServerHierarchicalMemory
    });

    // Invalid CLI arguments are typically handled by the CLI framework (e.g., yargs, commander).
    // If loadCliConfig itself parses arguments directly and has validation, add tests here.
    // Assuming argument parsing is handled externally, we test the *effect* of valid flags.

    it('should handle empty telemetry settings object', async () => {
      process.argv = ['node', 'script.js'];
      const settings: Settings = { telemetry: {} };
      const config = await loadCliConfig(settings, [], 'test-session');

      expect(config.getTelemetryEnabled()).toBe(false);
      expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
      expect(config.getTelemetryTarget()).toBe(ServerConfig.DEFAULT_TELEMETRY_TARGET);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('should handle extensions with malformed config objects (e.g., missing name/version)', async () => {
      const extensions: Extension[] = [
        {
          config: { name: 'valid-ext', version: '1.0.0' },
          contextFiles: ['/path/to/valid.md'],
        },
        {
          config: { version: '1.0.0' } as any, // Missing name
          contextFiles: ['/path/to/missing_name.md'],
        },
        {
          config: { name: 'missing-version' } as any, // Missing version
          contextFiles: ['/path/to/missing_version.md'],
        },
        {
          config: null as any, // Completely null config
          contextFiles: ['/path/to/null_config.md'],
        },
      ];

      // The behavior here depends on how loadCliConfig handles malformed extensions.
      // It might skip them, throw an error, or use default values.
      // Assuming it skips them and doesn't pass invalid paths to loadServerHierarchicalMemory:
      await loadCliConfig({}, extensions, 'test-session');

      expect(mockedLoadServerHierarchicalMemory).toHaveBeenCalledTimes(1);
      const passedPaths = mockedLoadServerHierarchicalMemory.mock.calls[0][3] as string[];
      expect(passedPaths).toEqual(['/path/to/valid.md']); // Only the valid one
    });
  });

  // 10. Add Comments for Complex Mocks
  // Comments have been added in the global mocks section and within tests where necessary.

  // 11. Test Default Behavior
  // Covered extensively in the 'showMemoryUsage' and 'telemetry' default tests, and the 'edge cases' suite.

  // 12. Test Environment Variable Overrides
  // Your current setup doesn't seem to explicitly test environment variables for `loadCliConfig` itself.
  // If `loadCliConfig` *does* read from env vars (e.g., `GEMINI_TELEMETRY_ENABLED`), add tests for that.
  // For example:
  it('should use GEMINI_TELEMETRY_ENABLED env var if set and no CLI flag', async () => {
    process.env.GEMINI_TELEMETRY_ENABLED = 'true';
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session');
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should prioritize CLI flag over GEMINI_TELEMETRY_ENABLED env var', async () => {
    process.env.GEMINI_TELEMETRY_ENABLED = 'false';
    process.argv = ['node', 'script.js', '--telemetry'];
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session');
    expect(config.getTelemetryEnabled()).toBe(true); // CLI takes precedence
  });

  it('should use settings over GEMINI_TELEMETRY_ENABLED env var if both are present', async () => {
    process.env.GEMINI_TELEMETRY_ENABLED = 'true';
    process.argv = ['node', 'script.js'];
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session');
    expect(config.getTelemetryEnabled()).toBe(false); // Settings take precedence over env var
  });

  // Add similar tests for GEMINI_SHOW_MEMORY_USAGE, GEMINI_OTLP_ENDPOINT, etc. if applicable.

  // 13. Test Configuration File Loading (if applicable)
  // Assuming this is handled by `@google/gemini-cli-core` or a separate mechanism.
  // If `loadCliConfig` were to load a config file itself, you'd need mocks for `fs`
  // and potentially `cosmiconfig` or similar libraries.

  // 14. Test Error Handling (if applicable)
  // If `loadCliConfig` or its internal calls (like `loadServerHierarchicalMemory`)
  // can throw specific errors (e.g., invalid API key, file not found), add tests.
  it('should throw an error if GEMINI_API_KEY is missing and required', async () => {
    delete process.env.GEMINI_API_KEY; // Ensure it's missing
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    // Assuming loadCliConfig throws if API key is needed and missing
    await expect(loadCliConfig(settings, [], 'test-session')).rejects.toThrow('API key is required');
  });

  // 15. Isolate Test Suites
  // The use of `describe` blocks for different features (showMemoryUsage, telemetry, etc.)
  // and `beforeEach`/`afterEach` with `vi.resetAllMocks()` ensures isolation.

  // 37. Test GEMINI_API_KEY presence
  // The beforeEach sets `process.env.GEMINI_API_KEY`. We've added a test for its absence (14).
  // We can also test that the presence of the API key doesn't break functionality if it's not directly used by loadCliConfig.
  it('should function correctly when GEMINI_API_KEY is present', async () => {
    process.env.GEMINI_API_KEY = 'a-valid-key';
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session');
    expect(config).toBeDefined();
    expect(config.getShowMemoryUsage()).toBe(false); // Just a basic check
  });

  // 38. Test 'open' mock usage
  // If `loadCliConfig` uses `open` for any reason (e.g., opening a help URL), test it.
  // Example: If `--help-telemetry` opens a URL.
  // it('should call open with the correct URL when --help-telemetry is used', async () => {
  //   process.argv = ['node', 'script.js', '--help-telemetry'];
  //   const settings: Settings = {};
  //   await loadCliConfig(settings, [], 'test-session');
  //   expect(mockedOpen).toHaveBeenCalledTimes(1);
  //   expect(mockedOpen).toHaveBeenCalledWith('https://example.com/telemetry-info'); // Replace with actual URL
  // });

  // 39. Test 'readPackageUp' mock usage
  // If `loadCliConfig` uses the version from `readPackageUp`, test that it's used.
  it('should use the version from readPackageUp', async () => {                             const expectedVersion = 'mocked-package-version';
    mockedReadPackageUp.mockResolvedValueOnce({
      packageJson: { version: expectedVersion },
      isEmpty: false,
      path: '/mock/path/package.json',
    });

    process.argv = ['node', 'script.js'];                                                   const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session');

    // Assuming CliConfig has a method like `getVersion()`
    expect(config.getVersion()).toBe(expectedVersion);
  });
});