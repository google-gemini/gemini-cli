import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { GoogleGenAI, Type, Content } from '@google/genai';
import { GeminiClient } from './gemini-client.js';
import { Config } from '../config/config.js';

// Mock the entire @google/genai module
vi.mock('@google/genai');

// Mock the Config class and its methods
vi.mock('../config/config.js', () => {
  // The mock constructor should accept the arguments but not explicitly return an object.
  // vi.fn() will create a mock instance that inherits from the prototype.
  const MockConfig = vi.fn();
  // Methods are mocked on the prototype, so instances will inherit them.
  MockConfig.prototype.getApiKey = vi.fn(() => 'mock-api-key');
  MockConfig.prototype.getModel = vi.fn(() => 'mock-model');
  MockConfig.prototype.getTargetDir = vi.fn(() => 'mock-target-dir');
  return { Config: MockConfig };
});

// Define a type for the mocked GoogleGenAI instance structure
type MockGoogleGenAIType = {
  models: {
    generateContent: Mock;
  };
  chats: {
    create: Mock;
  };
};

describe('GeminiClient', () => {
  // Use the specific types defined above
  let mockGenerateContent: MockGoogleGenAIType['models']['generateContent'];
  let mockGoogleGenAIInstance: MockGoogleGenAIType;
  let config: Config;
  let client: GeminiClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the generateContent method specifically
    mockGenerateContent = vi.fn();

    // Mock the chainable structure ai.models.generateContent
    mockGoogleGenAIInstance = {
      models: {
        generateContent: mockGenerateContent,
      },
      chats: {
        create: vi.fn(), // Mock create as well
      },
    };

    // Configure the mocked GoogleGenAI constructor to return our mock instance
    (GoogleGenAI as Mock).mockImplementation(() => mockGoogleGenAIInstance);

    config = new Config('mock-api-key-arg', 'mock-model-arg', 'mock-dir-arg');
    client = new GeminiClient(config);
  });

  describe('generateJson', () => {
    it('should call ai.models.generateContent with correct parameters', async () => {
      const mockContents: Content[] = [
        { role: 'user', parts: [{ text: 'test prompt' }] },
      ];
      const mockSchema = {
        type: Type.OBJECT,
        properties: { key: { type: Type.STRING } },
      };
      const mockApiResponse = { text: JSON.stringify({ key: 'value' }) };

      mockGenerateContent.mockResolvedValue(mockApiResponse);
      await client.generateJson(mockContents, mockSchema);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Use expect.objectContaining for the config assertion
      const expectedConfigMatcher = expect.objectContaining({
        temperature: 0,
        topP: 1,
        systemInstruction: expect.any(String),
        responseSchema: mockSchema,
        responseMimeType: 'application/json',
      });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'mock-model',
        config: expectedConfigMatcher,
        contents: mockContents,
      });
    });

    it('should return the parsed JSON response', async () => {
      const mockContents: Content[] = [
        { role: 'user', parts: [{ text: 'test prompt' }] },
      ];
      const mockSchema = {
        type: Type.OBJECT,
        properties: { key: { type: Type.STRING } },
      };
      const expectedJson = { key: 'value' };
      const mockApiResponse = { text: JSON.stringify(expectedJson) };

      mockGenerateContent.mockResolvedValue(mockApiResponse);

      const result = await client.generateJson(mockContents, mockSchema);

      expect(result).toEqual(expectedJson);
    });

    it('should throw an error if API returns empty response', async () => {
      const mockContents: Content[] = [
        { role: 'user', parts: [{ text: 'test prompt' }] },
      ];
      const mockSchema = {
        type: Type.OBJECT,
        properties: { key: { type: Type.STRING } },
      };
      const mockApiResponse = { text: '' }; // Empty response

      mockGenerateContent.mockResolvedValue(mockApiResponse);

      await expect(
        client.generateJson(mockContents, mockSchema),
      ).rejects.toThrow(
        'Failed to generate JSON content: API returned an empty response.',
      );
    });

    it('should throw an error if API response is not valid JSON', async () => {
      const mockContents: Content[] = [
        { role: 'user', parts: [{ text: 'test prompt' }] },
      ];
      const mockSchema = {
        type: Type.OBJECT,
        properties: { key: { type: Type.STRING } },
      };
      const mockApiResponse = { text: 'invalid json' }; // Invalid JSON

      mockGenerateContent.mockResolvedValue(mockApiResponse);

      await expect(
        client.generateJson(mockContents, mockSchema),
      ).rejects.toThrow('Failed to parse API response as JSON:');
    });

    it('should throw an error if generateContent rejects', async () => {
      const mockContents: Content[] = [
        { role: 'user', parts: [{ text: 'test prompt' }] },
      ];
      const mockSchema = {
        type: Type.OBJECT,
        properties: { key: { type: Type.STRING } },
      };
      const apiError = new Error('API call failed');

      mockGenerateContent.mockRejectedValue(apiError);

      await expect(
        client.generateJson(mockContents, mockSchema),
      ).rejects.toThrow(`Failed to generate JSON content: ${apiError.message}`);
    });
  });

  // TODO: Add tests for startChat and sendMessageStream later
});
