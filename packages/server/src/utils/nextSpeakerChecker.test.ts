/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { Content } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js'; // Added Config import
import { checkNextSpeaker, NextSpeakerResponse } from './nextSpeakerChecker.js';
import { GeminiChat } from '../core/geminiChat.js';

// Mock GeminiClient and Config constructor
vi.mock('../core/client.js');
vi.mock('../config/config.js');

// Mock @google/genai
const mockGetHistory = vi.fn();
const mockCreateChat = vi.fn(() => ({
  getHistory: mockGetHistory,
}));

vi.mock('@google/genai', async () => {
  const actualGenAI =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenAI,
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      chats: {
        create: mockCreateChat,
      },
    })),
    // Keep Chat constructor mock for type safety if direct instantiation is attempted,
    // but primary path is via client.chats.create
    Chat: vi.fn().mockImplementation(() => ({
      getHistory: mockGetHistory,
    })),
  };
});

describe('checkNextSpeaker', () => {
  let mockChat: GeminiChat;
  let mockGeminiClient: GeminiClient;
  let MockConfig: Mock;

  beforeEach(() => {
    // Dynamically import and assign the mock
    // Must be done within beforeEach or test to ensure mocks are reset
    MockConfig = vi.mocked(Config);
    // Create a mock instance of Config
    const mockConfigInstance = new MockConfig(
      'test-api-key',
      'gemini-pro',
      false,
      '.',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
    );
    // Mock any methods on mockConfigInstance if needed, e.g., mockConfigInstance.getToolRegistry = vi.fn()...

    mockGeminiClient = new GeminiClient(mockConfigInstance);
    // Simulate chat creation as done in GeminiClient
    mockChat = { getHistory: mockGetHistory } as unknown as GeminiChat;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if history is empty', async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([]);
    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return null if the last speaker was the user', async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ] as Content[]);
    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it("should return { next_speaker: 'model' } when model intends to continue", async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'I will now do something.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model stated it will do something.',
      next_speaker: 'model',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toEqual(mockApiResponse);
    expect(mockGeminiClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it("should return { next_speaker: 'user' } when model asks a question", async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'What would you like to do?' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model asked a question.',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toEqual(mockApiResponse);
  });

  it("should return { next_speaker: 'user' } when model makes a statement", async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'This is a statement.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if geminiClient.generateJson throws an error', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockRejectedValue(
      new Error('API Error'),
    );

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('should return null if geminiClient.generateJson returns invalid JSON (missing next_speaker)', async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'This is incomplete.',
    } as unknown as NextSpeakerResponse); // Type assertion to simulate invalid response

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toBeNull();
  });

  it('should return null if geminiClient.generateJson returns a non-string next_speaker', async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 123, // Invalid type
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toBeNull();
  });

  it('should return null if geminiClient.generateJson returns an invalid next_speaker string value', async () => {
    (mockChat.getHistory as Mock).mockResolvedValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'neither', // Invalid enum value
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(mockChat, mockGeminiClient);
    expect(result).toBeNull();
  });
});
