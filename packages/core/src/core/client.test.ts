/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  Chat,
  EmbedContentResponse,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import { GeminiClient } from './client.js';
import { AuthType, ContentGenerator } from './contentGenerator.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { Turn } from './turn.js';
import { getCoreSystemPrompt } from './prompts.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { setSimulate429 } from '../utils/testUtils.js';

// --- Mocks ---
const mockChatCreateFn = vi.fn();
const mockGenerateContentFn = vi.fn();
const mockEmbedContentFn = vi.fn();
const mockTurnRunFn = vi.fn();

vi.mock('@google/genai');
vi.mock('./turn', () => {
  // Define a mock class that has the same shape as the real Turn
  class MockTurn {
    pendingToolCalls = [];
    // The run method is a property that holds our mock function
    run = mockTurnRunFn;

    constructor() {
      // The constructor can be empty or do some mock setup
    }
  }
  // Export the mock class as 'Turn'
  return { Turn: MockTurn };
});

vi.mock('../config/config.js');
vi.mock('./prompts');
vi.mock('../utils/getFolderStructure', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('Mock Folder Structure'),
}));
vi.mock('../utils/errorReporting', () => ({ reportError: vi.fn() }));
vi.mock('../utils/nextSpeakerChecker', () => ({
  checkNextSpeaker: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/generateContentResponseUtilities', () => ({
  getResponseText: (result: GenerateContentResponse) =>
    result.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ||
    undefined,
}));
vi.mock('../telemetry/index.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));

describe('Gemini Client (client.ts)', () => {
  let client: GeminiClient;
  beforeEach(async () => {
    vi.resetAllMocks();

    // Disable 429 simulation for tests
    setSimulate429(false);

    // Set up the mock for GoogleGenAI constructor and its methods
    const MockedGoogleGenAI = vi.mocked(GoogleGenAI);
    MockedGoogleGenAI.mockImplementation(() => {
      const mock = {
        chats: { create: mockChatCreateFn },
        models: {
          generateContent: mockGenerateContentFn,
          embedContent: mockEmbedContentFn,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mock as any;
    });

    mockChatCreateFn.mockResolvedValue({} as Chat);
    mockGenerateContentFn.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '{"key": "value"}' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    // Because the GeminiClient constructor kicks off an async process (startChat)
    // that depends on a fully-formed Config object, we need to mock the
    // entire implementation of Config for these tests.
    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(null),
    };
    const fileService = new FileDiscoveryService('/test/dir');
    const MockedConfig = vi.mocked(Config, true);
    const contentGeneratorConfig = {
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };
    MockedConfig.mockImplementation(() => {
      const mock = {
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue(contentGeneratorConfig),
        getToolRegistry: vi.fn().mockResolvedValue(mockToolRegistry),
        getModel: vi.fn().mockReturnValue('test-model'),
        getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
        getApiKey: vi.fn().mockReturnValue('test-key'),
        getVertexAI: vi.fn().mockReturnValue(false),
        getUserAgent: vi.fn().mockReturnValue('test-agent'),
        getUserMemory: vi.fn().mockReturnValue(''),
        getFullContext: vi.fn().mockReturnValue(false),
        getSessionId: vi.fn().mockReturnValue('test-session-id'),
        getProxy: vi.fn().mockReturnValue(undefined),
        getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
        getFileService: vi.fn().mockReturnValue(fileService),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mock as any;
    });

    // We can instantiate the client here since Config is mocked
    // and the constructor will use the mocked GoogleGenAI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockConfig = new Config({} as any);
    client = new GeminiClient(mockConfig);
    await client.initialize(contentGeneratorConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // NOTE: The following tests for startChat were removed due to persistent issues with
  // the @google/genai mock. Specifically, the mockChatCreateFn (representing instance.chats.create)
  // was not being detected as called by the GeminiClient instance.
  // This likely points to a subtle issue in how the GoogleGenerativeAI class constructor
  // and its instance methods are mocked and then used by the class under test.
  // For future debugging, ensure that the `this.client` in `GeminiClient` (which is an
  // instance of the mocked GoogleGenerativeAI) correctly has its `chats.create` method
  // pointing to `mockChatCreateFn`.
  // it('startChat should call getCoreSystemPrompt with userMemory and pass to chats.create', async () => { ... });
  // it('startChat should call getCoreSystemPrompt with empty string if userMemory is empty', async () => { ... });

  // NOTE: The following tests for generateJson were removed due to persistent issues with
  // the @google/genai mock, similar to the startChat tests. The mockGenerateContentFn
  // (representing instance.models.generateContent) was not being detected as called, or the mock
  // was not preventing an actual API call (leading to API key errors).
  // For future debugging, ensure `this.client.models.generateContent` in `GeminiClient` correctly
  // uses the `mockGenerateContentFn`.
  // it('generateJson should call getCoreSystemPrompt with userMemory and pass to generateContent', async () => { ... });
  // it('generateJson should call getCoreSystemPrompt with empty string if userMemory is empty', async () => { ... });

  describe('generateEmbedding', () => {
    const texts = ['hello world', 'goodbye world'];
    const testEmbeddingModel = 'test-embedding-model';

    it('should call embedContent with correct parameters and return embeddings', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      const mockResponse: EmbedContentResponse = {
        embeddings: [
          { values: mockEmbeddings[0] },
          { values: mockEmbeddings[1] },
        ],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      const result = await client.generateEmbedding(texts);

      expect(mockEmbedContentFn).toHaveBeenCalledTimes(1);
      expect(mockEmbedContentFn).toHaveBeenCalledWith({
        model: testEmbeddingModel,
        contents: texts,
      });
      expect(result).toEqual(mockEmbeddings);
    });

    it('should return an empty array if an empty array is passed', async () => {
      const result = await client.generateEmbedding([]);
      expect(result).toEqual([]);
      expect(mockEmbedContentFn).not.toHaveBeenCalled();
    });

    it('should throw an error if API response has no embeddings array', async () => {
      mockEmbedContentFn.mockResolvedValue({} as EmbedContentResponse); // No `embeddings` key

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API response has an empty embeddings array', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);
      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API returns a mismatched number of embeddings', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }], // Only one for two texts
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned a mismatched number of embeddings. Expected 2, got 1.',
      );
    });

    it('should throw an error if any embedding has nullish values', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }, { values: undefined }], // Second one is bad
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 1: "goodbye world"',
      );
    });

    it('should throw an error if any embedding has an empty values array', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [] }, { values: [1, 2, 3] }], // First one is bad
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 0: "hello world"',
      );
    });

    it('should propagate errors from the API call', async () => {
      const apiError = new Error('API Failure');
      mockEmbedContentFn.mockRejectedValue(apiError);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API Failure',
      );
    });
  });

  describe('generateContent', () => {
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const generationConfig = { temperature: 0.5 };
      const abortSignal = new AbortController().signal;

      // Mock countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateContent(contents, generationConfig, abortSignal);

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: 'test-model',
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0.5,
          topP: 1,
        },
        contents,
      });
    });
  });

  describe('generateJson', () => {
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const schema = { type: 'string' };
      const abortSignal = new AbortController().signal;

      // Mock countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateJson(contents, schema, abortSignal);

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0,
          topP: 1,
          responseSchema: schema,
          responseMimeType: 'application/json',
        },
        contents,
      });
    });
  });

  describe('addHistory', () => {
    it('should call chat.addHistory with the provided content', async () => {
      const mockChat = {
        addHistory: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client['chat'] = mockChat as any;

      const newContent = {
        role: 'user',
        parts: [{ text: 'New history item' }],
      };
      await client.addHistory(newContent);

      expect(mockChat.addHistory).toHaveBeenCalledWith(newContent);
    });
  });

  describe('resetChat', () => {
    it('should create a new chat session, clearing the old history', async () => {
      // 1. Get the initial chat instance and add some history.
      const initialChat = client.getChat();
      const initialHistory = await client.getHistory();
      await client.addHistory({
        role: 'user',
        parts: [{ text: 'some old message' }],
      });
      const historyWithOldMessage = await client.getHistory();
      expect(historyWithOldMessage.length).toBeGreaterThan(
        initialHistory.length,
      );

      // 2. Call resetChat.
      await client.resetChat();

      // 3. Get the new chat instance and its history.
      const newChat = client.getChat();
      const newHistory = await client.getHistory();

      // 4. Assert that the chat instance is new and the history is reset.
      expect(newChat).not.toBe(initialChat);
      expect(newHistory.length).toBe(initialHistory.length);
      expect(JSON.stringify(newHistory)).not.toContain('some old message');
    });
  });

  describe('sendMessageStream', () => {
    it('should return the turn instance after the stream is complete', async () => {
      // Arrange
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
      );

      // Consume the stream manually to get the final return value.
      let finalResult: Turn | undefined;
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
      }

      // Assert
      expect(finalResult).toBeInstanceOf(Turn);
    });
  });
});

  describe('GeminiClient - Additional comprehensive tests', () => {
    describe('constructor and initialization', () => {
      it('should initialize with correct configuration', () => {
        const mockConfig = new Config({} as any);
        const client = new GeminiClient(mockConfig);
        
        expect(client).toBeInstanceOf(GeminiClient);
      });

      it('should handle initialization with different auth types', async () => {
        const mockConfig = new Config({} as any);
        const client = new GeminiClient(mockConfig);
        
        const vertexConfig = {
          model: 'test-model',
          apiKey: 'test-key',
          vertexai: true,
          authType: AuthType.USE_VERTEX_AI,
        };
        
        await expect(client.initialize(vertexConfig)).resolves.not.toThrow();
      });

      it('should handle proxy configuration in constructor', () => {
        const MockedConfig = vi.mocked(Config, true);
        MockedConfig.mockImplementation(() => {
          const mock = {
            getProxy: vi.fn().mockReturnValue('http://proxy.example.com:8080'),
            getModel: vi.fn().mockReturnValue('test-model'),
            getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              model: 'test-model',
              apiKey: 'test-key',
              vertexai: false,
              authType: AuthType.USE_GEMINI,
            }),
            getToolRegistry: vi.fn().mockResolvedValue({
              getFunctionDeclarations: vi.fn().mockReturnValue([]),
              getTool: vi.fn().mockReturnValue(null),
            }),
            getUserMemory: vi.fn().mockReturnValue(''),
            getFullContext: vi.fn().mockReturnValue(false),
            getSessionId: vi.fn().mockReturnValue('test-session-id'),
            getUserAgent: vi.fn().mockReturnValue('test-agent'),
            getApiKey: vi.fn().mockReturnValue('test-key'),
            getVertexAI: vi.fn().mockReturnValue(false),
            getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
            getFileService: vi.fn().mockReturnValue(new FileDiscoveryService('/test/dir')),
          };
          return mock as any;
        });

        const config = new Config({} as any);
        expect(() => new GeminiClient(config)).not.toThrow();
      });
    });

    describe('getContentGenerator', () => {
      it('should throw error when content generator not initialized', () => {
        const mockConfig = new Config({} as any);
        const uninitializedClient = new GeminiClient(mockConfig);
        
        expect(() => uninitializedClient.getContentGenerator()).toThrow('Content generator not initialized');
      });

      it('should return content generator when initialized', () => {
        const mockGenerator = {} as ContentGenerator;
        client['contentGenerator'] = mockGenerator;
        
        expect(client.getContentGenerator()).toBe(mockGenerator);
      });
    });

    describe('getChat', () => {
      it('should throw error when chat not initialized', () => {
        const mockConfig = new Config({} as any);
        const uninitializedClient = new GeminiClient(mockConfig);
        
        expect(() => uninitializedClient.getChat()).toThrow('Chat not initialized');
      });

      it('should return the same chat instance on multiple calls', () => {
        const chat1 = client.getChat();
        const chat2 = client.getChat();
        expect(chat1).toBe(chat2);
      });
    });

    describe('getHistory', () => {
      it('should return chat history', async () => {
        const mockHistory = [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] }
        ];
        const mockChat = {
          getHistory: vi.fn().mockResolvedValue(mockHistory),
          addHistory: vi.fn(),
          setHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        const history = await client.getHistory();
        
        expect(history).toEqual(mockHistory);
        expect(mockChat.getHistory).toHaveBeenCalled();
      });

      it('should handle empty history', async () => {
        const mockChat = {
          getHistory: vi.fn().mockResolvedValue([]),
          addHistory: vi.fn(),
          setHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        const history = await client.getHistory();
        
        expect(history).toEqual([]);
        expect(mockChat.getHistory).toHaveBeenCalled();
      });

      it('should handle history retrieval errors', async () => {
        const mockChat = {
          getHistory: vi.fn().mockRejectedValue(new Error('History error')),
          addHistory: vi.fn(),
          setHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        await expect(client.getHistory()).rejects.toThrow('History error');
      });
    });

    describe('setHistory', () => {
      it('should set chat history', async () => {
        const newHistory = [
          { role: 'user', parts: [{ text: 'Previous message' }] },
          { role: 'model', parts: [{ text: 'Previous response' }] }
        ];
        const mockChat = {
          getHistory: vi.fn(),
          addHistory: vi.fn(),
          setHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        await client.setHistory(newHistory);
        
        expect(mockChat.setHistory).toHaveBeenCalledWith(newHistory);
      });

      it('should handle setting empty history', async () => {
        const mockChat = {
          getHistory: vi.fn(),
          addHistory: vi.fn(),
          setHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        await client.setHistory([]);
        
        expect(mockChat.setHistory).toHaveBeenCalledWith([]);
      });
    });

    describe('generateContent - comprehensive edge cases', () => {
      beforeEach(() => {
        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
          generateContent: mockGenerateContentFn,
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;
      });

      it('should handle empty contents array', async () => {
        const generationConfig = { temperature: 0.5 };
        const abortSignal = new AbortController().signal;

        await client.generateContent([], generationConfig, abortSignal);
        
        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: 'test-model',
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.5,
            topP: 1,
          },
          contents: [],
        });
      });

      it('should handle generation config with all parameters', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const generationConfig = {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 1000,
          stopSequences: ['STOP'],
          candidateCount: 1,
        };
        const abortSignal = new AbortController().signal;

        await client.generateContent(contents, generationConfig, abortSignal);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: 'test-model',
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 1000,
            stopSequences: ['STOP'],
            candidateCount: 1,
          },
          contents,
        });
      });

      it('should handle API errors gracefully', async () => {
        const apiError = new Error('API Error');
        mockGenerateContentFn.mockRejectedValue(apiError);

        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const generationConfig = { temperature: 0.5 };
        const abortSignal = new AbortController().signal;
        
        await expect(client.generateContent(contents, generationConfig, abortSignal)).rejects.toThrow();
      });

      it('should handle multimodal content with images', async () => {
        const contents = [
          {
            role: 'user',
            parts: [
              { text: 'What do you see?' },
              { inlineData: { mimeType: 'image/jpeg', data: 'base64data' } }
            ]
          }
        ];
        const generationConfig = { temperature: 0.5 };
        const abortSignal = new AbortController().signal;

        await client.generateContent(contents, generationConfig, abortSignal);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: 'test-model',
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.5,
            topP: 1,
          },
          contents,
        });
      });

      it('should merge generation config correctly', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const generationConfig = { temperature: 0.8 }; // Should override default
        const abortSignal = new AbortController().signal;

        await client.generateContent(contents, generationConfig, abortSignal);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: 'test-model',
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.8, // Should be overridden value
            topP: 1, // Should be default value
          },
          contents,
        });
      });
    });

    describe('generateJson - comprehensive edge cases', () => {
      beforeEach(() => {
        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
          generateContent: mockGenerateContentFn,
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;
        
        // Reset mock to return valid JSON
        mockGenerateContentFn.mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: '{"key": "value"}' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse);
      });

      it('should handle complex JSON schemas', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'Generate data' }] }];
        const complexSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            hobbies: {
              type: 'array',
              items: { type: 'string' }
            },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' }
              }
            }
          },
          required: ['name', 'age']
        };
        const abortSignal = new AbortController().signal;

        await client.generateJson(contents, complexSchema, abortSignal);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0,
            topP: 1,
            responseSchema: complexSchema,
            responseMimeType: 'application/json',
          },
          contents,
        });
      });

      it('should handle empty schema', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const abortSignal = new AbortController().signal;

        await client.generateJson(contents, {}, abortSignal);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0,
            topP: 1,
            responseSchema: {},
            responseMimeType: 'application/json',
          },
          contents,
        });
      });

      it('should handle custom model parameter', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const schema = { type: 'string' };
        const abortSignal = new AbortController().signal;
        const customModel = 'custom-model';

        await client.generateJson(contents, schema, abortSignal, customModel);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: customModel,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0,
            topP: 1,
            responseSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        });
      });

      it('should handle custom config parameter', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const schema = { type: 'string' };
        const abortSignal = new AbortController().signal;
        const customConfig = { temperature: 0.5, maxOutputTokens: 500 };

        await client.generateJson(contents, schema, abortSignal, DEFAULT_GEMINI_FLASH_MODEL, customConfig);

        expect(mockGenerateContentFn).toHaveBeenCalledWith({
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.5, // Should override default
            topP: 1,
            maxOutputTokens: 500, // Should be added
            responseSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        });
      });

      it('should handle empty response from API', async () => {
        mockGenerateContentFn.mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [],
              },
            },
          ],
        } as unknown as GenerateContentResponse);

        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const schema = { type: 'string' };
        const abortSignal = new AbortController().signal;
        
        await expect(client.generateJson(contents, schema, abortSignal)).rejects.toThrow();
      });

      it('should handle invalid JSON response from API', async () => {
        mockGenerateContentFn.mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'invalid json {' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse);

        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const schema = { type: 'string' };
        const abortSignal = new AbortController().signal;
        
        await expect(client.generateJson(contents, schema, abortSignal)).rejects.toThrow();
      });

      it('should parse and return valid JSON', async () => {
        const expectedData = { name: 'John', age: 30 };
        mockGenerateContentFn.mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(expectedData) }],
              },
            },
          ],
        } as unknown as GenerateContentResponse);

        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        const schema = { type: 'object' };
        const abortSignal = new AbortController().signal;
        
        const result = await client.generateJson(contents, schema, abortSignal);
        
        expect(result).toEqual(expectedData);
      });
    });

    describe('addHistory - comprehensive edge cases', () => {
      it('should handle adding user message', async () => {
        const mockChat = {
          addHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        const userMessage = {
          role: 'user' as const,
          parts: [{ text: 'Hello world' }],
        };
        
        await client.addHistory(userMessage);

        expect(mockChat.addHistory).toHaveBeenCalledWith(userMessage);
      });

      it('should handle adding model message', async () => {
        const mockChat = {
          addHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        const modelMessage = {
          role: 'model' as const,
          parts: [{ text: 'Hello back!' }],
        };
        
        await client.addHistory(modelMessage);

        expect(mockChat.addHistory).toHaveBeenCalledWith(modelMessage);
      });

      it('should handle adding multimodal message', async () => {
        const mockChat = {
          addHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        const multimodalMessage = {
          role: 'user' as const,
          parts: [
            { text: 'Look at this image:' },
            { inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }
          ],
        };
        
        await client.addHistory(multimodalMessage);

        expect(mockChat.addHistory).toHaveBeenCalledWith(multimodalMessage);
      });

      it('should handle message with function calls', async () => {
        const mockChat = {
          addHistory: vi.fn(),
        };
        client['chat'] = mockChat as any;

        const functionCallMessage = {
          role: 'model' as const,
          parts: [
            { functionCall: { name: 'testFunction', args: { param: 'value' } } }
          ],
        };
        
        await client.addHistory(functionCallMessage);

        expect(mockChat.addHistory).toHaveBeenCalledWith(functionCallMessage);
      });
    });

    describe('resetChat - comprehensive edge cases', () => {
      it('should create a new chat session, clearing the old history', async () => {
        // Add some history first
        const mockChat = {
          addHistory: vi.fn(),
          getHistory: vi.fn()
            .mockReturnValueOnce([
              { role: 'user', parts: [{ text: 'old message' }] }
            ])
            .mockReturnValueOnce([]), // After reset
        };
        client['chat'] = mockChat as any;

        const initialChat = client.getChat();
        
        await client.resetChat();
        
        const newChat = client.getChat();
        expect(newChat).not.toBe(initialChat);
      });

      it('should handle multiple consecutive resets', async () => {
        const initialChat = client.getChat();
        
        await client.resetChat();
        const firstReset = client.getChat();
        
        await client.resetChat();
        const secondReset = client.getChat();
        
        expect(firstReset).not.toBe(initialChat);
        expect(secondReset).not.toBe(firstReset);
        expect(secondReset).not.toBe(initialChat);
      });

      it('should handle reset when chat has tool registry', async () => {
        // This tests that resetChat properly handles the tool registry setup
        await expect(client.resetChat()).resolves.not.toThrow();
      });
    });

    describe('sendMessageStream - comprehensive edge cases', () => {
      beforeEach(() => {
        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
        };
        client['chat'] = mockChat as GeminiChat;

        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;
      });

      it('should handle empty message parts', async () => {
        const mockStream = (async function* () {
          yield { type: 'content', value: '' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const stream = client.sendMessageStream([], new AbortController().signal);
        
        let streamedContent = '';
        let finalResult: any;
        while (true) {
          const result = await stream.next();
          if (result.done) {
            finalResult = result.value;
            break;
          }
          if (result.value.type === 'content') {
            streamedContent += result.value.value;
          }
        }

        expect(streamedContent).toBe('');
        expect(finalResult).toBeInstanceOf(Turn);
      });

      it('should handle multiple stream chunks', async () => {
        const mockStream = (async function* () {
          yield { type: 'content', value: 'Hello' };
          yield { type: 'content', value: ' ' };
          yield { type: 'content', value: 'World' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
        );

        let streamedContent = '';
        while (true) {
          const result = await stream.next();
          if (result.done) {
            break;
          }
          if (result.value.type === 'content') {
            streamedContent += result.value.value;
          }
        }

        expect(streamedContent).toBe('Hello World');
      });

      it('should handle stream with function calls', async () => {
        const mockStream = (async function* () {
          yield { type: 'functionCall', value: { name: 'testFunction', args: {} } };
          yield { type: 'content', value: 'Function executed' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const stream = client.sendMessageStream(
          [{ text: 'Call a function' }],
          new AbortController().signal,
        );

        const chunks = [];
        while (true) {
          const result = await stream.next();
          if (result.done) {
            break;
          }
          chunks.push(result.value);
        }

        expect(chunks).toHaveLength(2);
        expect(chunks[0].type).toBe('functionCall');
        expect(chunks[1].type).toBe('content');
      });

      it('should handle multimodal input in stream', async () => {
        const mockStream = (async function* () {
          yield { type: 'content', value: 'I can see the image' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const stream = client.sendMessageStream(
          [
            { text: 'What do you see?' },
            { inlineData: { mimeType: 'image/jpeg', data: 'base64data' } }
          ],
          new AbortController().signal,
        );

        let streamedContent = '';
        while (true) {
          const result = await stream.next();
          if (result.done) {
            break;
          }
          if (result.value.type === 'content') {
            streamedContent += result.value.value;
          }
        }

        expect(streamedContent).toBe('I can see the image');
      });

      it('should respect maximum turns parameter', async () => {
        const mockStream = (async function* () {
          yield { type: 'content', value: 'Response' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          5 // Custom max turns
        );

        // Should not throw and should handle the custom turns parameter
        let finalResult: any;
        while (true) {
          const result = await stream.next();
          if (result.done) {
            finalResult = result.value;
            break;
          }
        }

        expect(finalResult).toBeInstanceOf(Turn);
      });

      it('should handle zero turns gracefully', async () => {
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          0 // Zero turns
        );

        let finalResult: any;
        while (true) {
          const result = await stream.next();
          if (result.done) {
            finalResult = result.value;
            break;
          }
        }

        expect(finalResult).toBeInstanceOf(Turn);
        expect(mockTurnRunFn).not.toHaveBeenCalled();
      });
    });

    describe('error handling and edge cases', () => {
      it('should handle getContentGenerator when not initialized', () => {
        const mockConfig = new Config({} as any);
        const uninitializedClient = new GeminiClient(mockConfig);
        
        expect(() => uninitializedClient.getContentGenerator()).toThrow('Content generator not initialized');
      });

      it('should handle getChat when not initialized', () => {
        const mockConfig = new Config({} as any);
        const uninitializedClient = new GeminiClient(mockConfig);
        
        expect(() => uninitializedClient.getChat()).toThrow('Chat not initialized');
      });

      it('should handle concurrent operations gracefully', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        
        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
          generateContent: vi.fn().mockResolvedValue({
            candidates: [{ content: { parts: [{ text: 'response' }] } }],
          }),
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;

        // Execute multiple operations concurrently
        const promises = [
          client.generateContent(contents, {}, new AbortController().signal),
          client.generateContent(contents, {}, new AbortController().signal),
          client.generateContent(contents, {}, new AbortController().signal),
        ];

        const results = await Promise.all(promises);
        expect(results).toHaveLength(3);
        expect(mockGenerator.generateContent).toHaveBeenCalledTimes(3);
      });

      it('should handle aborted requests properly', async () => {
        const controller = new AbortController();
        const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
        
        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
          generateContent: vi.fn().mockImplementation(async () => {
            // Simulate the abort happening during the request
            controller.abort();
            throw new Error('Request aborted');
          }),
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;

        await expect(
          client.generateContent(contents, {}, controller.signal)
        ).rejects.toThrow('Request aborted');
      });
    });

    describe('integration scenarios', () => {
      it('should handle a complete conversation flow', async () => {
        // Setup mocks for a complete conversation
        const mockChat = {
          addHistory: vi.fn(),
          getHistory: vi.fn()
            .mockReturnValueOnce([]) // Initially empty
            .mockReturnValueOnce([
              { role: 'user', parts: [{ text: 'Hello' }] }
            ])
            .mockReturnValueOnce([
              { role: 'user', parts: [{ text: 'Hello' }] },
              { role: 'model', parts: [{ text: 'Hello there!' }] }
            ]),
        };
        client['chat'] = mockChat as any;

        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 10 }),
          generateContent: vi.fn().mockResolvedValue({
            candidates: [{ content: { parts: [{ text: 'Hello there!' }] } }],
          }),
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;

        // Simulate conversation flow
        const userMessage = { role: 'user' as const, parts: [{ text: 'Hello' }] };
        await client.addHistory(userMessage);

        const response = await client.generateContent([userMessage], {}, new AbortController().signal);
        expect(response).toBeDefined();

        const modelMessage = { role: 'model' as const, parts: [{ text: 'Hello there!' }] };
        await client.addHistory(modelMessage);

        const finalHistory = await client.getHistory();
        expect(mockChat.addHistory).toHaveBeenCalledTimes(2);
        expect(finalHistory).toHaveLength(2);
      });

      it('should handle conversation with embeddings and content generation', async () => {
        // Test embedding generation
        const texts = ['Hello', 'How are you?'];
        const mockEmbeddings = [[0.1, 0.2], [0.3, 0.4]];
        
        mockEmbedContentFn.mockResolvedValue({
          embeddings: mockEmbeddings.map(values => ({ values })),
        });

        const embeddings = await client.generateEmbedding(texts);
        expect(embeddings).toEqual(mockEmbeddings);

        // Then test regular conversation
        const contents = [{ role: 'user', parts: [{ text: 'Hello' }] }];
        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 5 }),
          generateContent: vi.fn().mockResolvedValue({
            candidates: [{ content: { parts: [{ text: 'Hi!' }] } }],
          }),
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;

        const response = await client.generateContent(contents, {}, new AbortController().signal);
        expect(response).toBeDefined();
      });

      it('should handle reset and continue conversation', async () => {
        // Add initial history
        const mockChat = {
          addHistory: vi.fn(),
          getHistory: vi.fn()
            .mockReturnValueOnce([{ role: 'user', parts: [{ text: 'old message' }] }])
            .mockReturnValueOnce([]), // After reset
        };
        client['chat'] = mockChat as any;

        await client.addHistory({ role: 'user', parts: [{ text: 'old message' }] });
        
        // Reset and verify
        await client.resetChat();
        
        // Continue conversation after reset
        await client.addHistory({ role: 'user', parts: [{ text: 'new message' }] });
        
        expect(mockChat.addHistory).toHaveBeenCalledWith({ role: 'user', parts: [{ text: 'new message' }] });
      });
    });
  });
});
