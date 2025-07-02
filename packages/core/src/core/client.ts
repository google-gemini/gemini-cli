/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmbedContentParameters,
  GenerateContentConfig,
  Part,
  SchemaUnion,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Turn,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ChatCompressionInfo,
} from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  ContentGenerator,
  ContentGeneratorConfig,
  createContentGenerator,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { AuthType } from './contentGenerator.js';

function isThinkingSupported(model: string) {
  if (model.startsWith('gemini-2.5')) return true;
  return false;
}
/**
 * 深度分析 GeminiClient 类的核心业务流程
 * 
 * 该类是 Gemini AI 客户端的核心实现，负责与 Gemini API 进行交互，
 * 管理聊天会话、内容生成、嵌入向量等功能。
 * 
 * 核心业务流程分析：
 * 
 * 1. 初始化流程 (Initialization Flow)
 *    - 构造函数：设置代理、模型配置
 *    - initialize(): 创建内容生成器和聊天会话
 *    - 支持多种认证方式：OAuth2、API密钥、Vertex AI
 * 
 * 2. 聊天会话管理 (Chat Session Management)
 *    - startChat(): 创建新的聊天会话
 *    - addHistory(): 添加历史消息
 *    - getHistory()/setHistory(): 获取/设置聊天历史
 *    - 支持聊天历史压缩和上下文管理
 * 
 * 3. 内容生成流程 (Content Generation Flow)
 *    - generateContent(): 同步生成内容
 *    - generateContentStream(): 流式生成内容
 *    - generateJson(): 生成结构化JSON内容
 *    - 支持工具调用和函数调用
 * 
 * 4. 嵌入向量处理 (Embedding Processing)
 *    - generateEmbedding(): 生成文本嵌入向量
 *    - 用于语义搜索和相似度计算
 * 
 * 5. 工具集成 (Tool Integration)
 *    - 支持多种内置工具：文件操作、搜索、Shell等
 *    - 动态工具发现和注册
 *    - 工具调用结果处理
 * 
 * 6. 错误处理和重试机制 (Error Handling & Retry)
 *    - 网络错误重试
 *    - API限制处理
 *    - 错误报告和日志记录
 * 
 * 7. 配置管理 (Configuration Management)
 *    - 模型选择（Gemini 1.5/2.0/2.5）
 *    - 代理设置
 *    - 温度和采样参数
 *    - 令牌限制管理
 * 
 * 8. 性能优化 (Performance Optimization)
 *    - 聊天历史压缩
 *    - 令牌计数和限制
 *    - 流式响应处理
 *    - 缓存机制
 * 
 * 关键设计模式：
 * - 工厂模式：内容生成器创建
 * - 策略模式：不同认证方式
 * - 观察者模式：流式响应处理
 * - 命令模式：工具调用
 * 
 * 数据流：
 * 用户输入 → 预处理 → API调用 → 响应处理 → 结果输出
 *     ↓
 * 工具调用 → 执行 → 结果返回 → 继续对话
 *     ↓
 * 历史管理 → 压缩 → 上下文维护
 */

export class GeminiClient {
  private chat?: GeminiChat;
  private contentGenerator?: ContentGenerator;
  private model: string;
  private embeddingModel: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(private config: Config) {
    if (config.getProxy()) {
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    this.model = config.getModel();
    this.embeddingModel = config.getEmbeddingModel();
  }

  async initialize(contentGeneratorConfig: ContentGeneratorConfig) {
    this.contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
    );
    this.chat = await this.startChat();
  }

  getContentGenerator(): ContentGenerator {
    if (!this.contentGenerator) {
      throw new Error('Content generator not initialized');
    }
    return this.contentGenerator;
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  async getHistory(): Promise<Content[]> {
    return this.getChat().getHistory();
  }

  async setHistory(history: Content[]): Promise<void> {
    this.getChat().setHistory(history);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
    await this.chat;
  }

  private async getEnvironment(): Promise<Part[]> {
    const cwd = this.config.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.config.getFileService(),
    });
    const context = `
  This is the Gemini CLI. We are setting up the context for our chat.
  Today's date is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.config.getToolRegistry();

    // Add full file context if the flag is set
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // Read all files in the target directory
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // Read everything recursively
              useDefaultExcludes: true, // Use default excludes
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            initialParts.push({
              text: `\n--- Full File Context ---\n${result.llmContent}`,
            });
          } else {
            console.warn(
              'Full context requested, but read_many_files returned no content.',
            );
          }
        } else {
          console.warn(
            'Full context requested, but read_many_files tool not found.',
          );
        }
      } catch (error) {
        // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
        console.error('Error reading full file context:', error);
        initialParts.push({
          text: '\n--- Error reading full file context ---',
        });
      }
    }

    return initialParts;
  }

  private async startChat(extraHistory?: Content[]): Promise<GeminiChat> {
    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const initialHistory: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
    ];
    const history = initialHistory.concat(extraHistory ?? []);
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const generateContentConfigWithThinking = isThinkingSupported(this.model)
        ? {
            ...this.generateContentConfig,
            thinkingConfig: {
              includeThoughts: true,
            },
          }
        : this.generateContentConfig;
      return new GeminiChat(
        this.config,
        this.getContentGenerator(),
        {
          systemInstruction,
          ...generateContentConfigWithThinking,
          tools,
        },
        history,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (!turns) {
      return new Turn(this.getChat());
    }

    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }
    const turn = new Turn(this.getChat());
    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      yield event;
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, but the final
        // turn object will be from the top-level call.
        yield* this.sendMessageStream(nextRequest, signal, turns - 1);
      }
    }
    return turn;
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
    abortSignal: AbortSignal,
    model: string = DEFAULT_GEMINI_FLASH_MODEL,
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const requestConfig = {
        abortSignal,
        ...this.generateContentConfig,
        ...config,
      };

      const apiCall = () =>
        this.getContentGenerator().generateContent({
          model,
          config: {
            ...requestConfig,
            systemInstruction,
            responseSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        });

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      const text = getResponseText(result);
      if (!text) {
        const error = new Error(
          'API returned an empty response for generateJson.',
        );
        await reportError(
          error,
          'Error in generateJson: API returned an empty response.',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }
      try {
        return JSON.parse(text);
      } catch (parseError) {
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw new Error(
          `Failed to parse API response as JSON: ${getErrorMessage(parseError)}`,
        );
      }
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // Avoid double reporting for the empty response case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }

      await reportError(
        error,
        'Error generating JSON content via API.',
        contents,
        'generateJson-api',
      );
      throw new Error(
        `Failed to generate JSON content: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const modelToUse = this.model;
    const configToUse: GenerateContentConfig = {
      ...this.generateContentConfig,
      ...generationConfig,
    };

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      const requestConfig = {
        abortSignal,
        ...configToUse,
        systemInstruction,
      };

      const apiCall = () =>
        this.getContentGenerator().generateContent({
          model: modelToUse,
          config: requestConfig,
          contents,
        });

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${modelToUse}.`,
        {
          requestContents: contents,
          requestConfig: configToUse,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${modelToUse}: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.embeddingModel,
      contents: texts,
    };

    const embedContentResponse =
      await this.getContentGenerator().embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('No embeddings found in API response.');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
        );
      }
      return values;
    });
  }

  async tryCompressChat(
    force: boolean = false,
  ): Promise<ChatCompressionInfo | null> {
    const history = this.getChat().getHistory(true); // Get curated history

    // Regardless of `force`, don't do anything if the history is empty.
    if (history.length === 0) {
      return null;
    }

    const { totalTokens: originalTokenCount } =
      await this.getContentGenerator().countTokens({
        model: this.model,
        contents: history,
      });

    // If not forced, check if we should compress based on context size.
    if (!force) {
      if (originalTokenCount === undefined) {
        // If token count is undefined, we can't determine if we need to compress.
        console.warn(
          `Could not determine token count for model ${this.model}. Skipping compression check.`,
        );
        return null;
      }
      const tokenCount = originalTokenCount; // Now guaranteed to be a number

      const limit = tokenLimit(this.model);
      if (!limit) {
        // If no limit is defined for the model, we can't compress.
        console.warn(
          `No token limit defined for model ${this.model}. Skipping compression check.`,
        );
        return null;
      }

      if (tokenCount < 0.95 * limit) {
        return null;
      }
    }

    const summarizationRequestMessage = {
      text: 'Summarize our conversation up to this point. The summary should be a concise yet comprehensive overview of all key topics, questions, answers, and important details discussed. This summary will replace the current chat history to conserve tokens, so it must capture everything essential to understand the context and continue our conversation effectively as if no information was lost.',
    };
    const response = await this.getChat().sendMessage({
      message: summarizationRequestMessage,
    });
    const newHistory = [
      {
        role: 'user',
        parts: [summarizationRequestMessage],
      },
      {
        role: 'model',
        parts: [{ text: response.text }],
      },
    ];
    this.chat = await this.startChat(newHistory);
    const newTokenCount = (
      await this.getContentGenerator().countTokens({
        model: this.model,
        contents: newHistory,
      })
    ).totalTokens;

    return originalTokenCount && newTokenCount
      ? {
          originalTokenCount,
          newTokenCount,
        }
      : null;
  }

  /**
   * Handles fallback to Flash model when persistent 429 errors occur for OAuth users.
   * Uses a fallback handler if provided by the config, otherwise returns null.
   */
  private async handleFlashFallback(authType?: string): Promise<string | null> {
    // Only handle fallback for OAuth users
    if (authType !== AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
      return null;
    }

    const currentModel = this.model;
    const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;

    // Don't fallback if already using Flash model
    if (currentModel === fallbackModel) {
      return null;
    }

    // Check if config has a fallback handler (set by CLI package)
    const fallbackHandler = this.config.flashFallbackHandler;
    if (typeof fallbackHandler === 'function') {
      try {
        const accepted = await fallbackHandler(currentModel, fallbackModel);
        if (accepted) {
          this.config.setModel(fallbackModel);
          this.model = fallbackModel;
          return fallbackModel;
        }
      } catch (error) {
        console.warn('Flash fallback handler failed:', error);
      }
    }

    return null;
  }
}
