
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalAgentExecutor } from './local-executor.js';
import type { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';

// Mock dependencies to avoid schemaValidator crash
vi.mock('../services/chatCompressionService.js', () => ({
  ChatCompressionService: vi.fn().mockImplementation(() => ({
    compress: vi.fn(),
  })),
}));

vi.mock('../core/geminiChat.js', () => ({
  GeminiChat: vi.fn(),
  StreamEventType: { CHUNK: 'chunk' },
}));

vi.mock('../core/nonInteractiveToolExecutor.js', () => ({
  executeToolCall: vi.fn(),
}));

vi.mock('../utils/version.js', () => ({
  getVersion: vi.fn().mockResolvedValue('1.2.3'),
}));

vi.mock('../utils/environmentContext.js', () => ({
    getDirectoryContextString: vi.fn().mockResolvedValue('dir context'),
}));

vi.mock('../telemetry/loggers.js', () => ({
  logAgentStart: vi.fn(),
  logAgentFinish: vi.fn(),
  logRecoveryAttempt: vi.fn(),
}));

vi.mock('../utils/promptIdContext.js', () => ({
    promptIdContext: {
        getStore: vi.fn(),
        run: vi.fn((_id, fn) => fn()),
    }
}));

// Mock telemetry types to avoid loading mcp-tool -> tools -> schemaValidator
vi.mock('../telemetry/types.js', () => ({
  AgentStartEvent: class {},
  AgentFinishEvent: class {},
  RecoveryAttemptEvent: class {},
}));

vi.mock('../core/turn.js', () => ({
  CompressionStatus: {
    NOOP: 'NOOP',
    COMPRESSED: 'COMPRESSED',
    COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
      'COMPRESSION_FAILED_INFLATED_TOKEN_COUNT',
  },
}));

// Mock ToolRegistry to avoid loading tools.js
const mockRegisterTool = vi.fn();
const mockGetAllToolNames = vi.fn();
const mockGetTool = vi.fn();
const mockSortTools = vi.fn();

vi.mock('../tools/tool-registry.js', () => {
  return {
    ToolRegistry: class MockToolRegistry {
      constructor() {}
      registerTool = mockRegisterTool;
      getAllToolNames = mockGetAllToolNames;
      getTool = mockGetTool;
      sortTools = mockSortTools;
    }
  };
});

vi.mock('./registry.js', () => ({
    getModelConfigAlias: () => 'mock-alias',
}));

// Mock config
const mockConfig = {
    getMessageBus: () => ({}),
    getToolRegistry: () => new ToolRegistry(),
    getAgentRegistry: () => ({ getAllAgentNames: () => [] }),
} as unknown as Config;


describe('LocalAgentExecutor Fix Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should default to ALL tools when toolConfig is undefined', async () => {
    const definition: any = {
      kind: 'local',
      name: 'TestAgent',
      description: 'Test',
      inputConfig: { inputSchema: {} },
      modelConfig: {},
      promptConfig: { systemPrompt: 'foo' },
      runConfig: {},
      toolConfig: undefined, // THE KEY
    };

    // Setup parent registry to have some tools
    mockGetAllToolNames.mockReturnValue(['tool1', 'tool2', 'subagent1']);
    mockGetTool.mockImplementation((name) => {
        if (name === 'tool1') return { name: 'tool1' };
        if (name === 'tool2') return { name: 'tool2' };
        if (name === 'subagent1') return { name: 'subagent1' }; 
        return undefined;
    });

    // Mock agent registry to identify subagent
    const mockAgentRegistry = {
        getAllAgentNames: () => ['subagent1'],
    };
    vi.spyOn(mockConfig, 'getAgentRegistry').mockReturnValue(mockAgentRegistry as any);

    await LocalAgentExecutor.create(definition, mockConfig);

    // Verification:
    // agentToolRegistry.registerTool should have been called for 'tool1' and 'tool2'
    
    const registeredTools = mockRegisterTool.mock.calls.map(args => args[0].name);
    expect(registeredTools).toContain('tool1');
    expect(registeredTools).toContain('tool2');
    expect(registeredTools).not.toContain('subagent1');
  });
});
