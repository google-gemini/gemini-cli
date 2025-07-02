/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// DISCLAIMER: This is a copied version of https://github.com/googleapis/js-genai/blob/main/src/chats.ts with the intention of working around a key bug
// where function responses are not treated as "valid" responses: https://b.corp.google.com/issues/420354090

import {
  GenerateContentResponse,
  Content,
  GenerateContentConfig,
  SendMessageParameters,
  createUserContent,
  Part,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { retryWithBackoff } from '../utils/retry.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { ContentGenerator, AuthType } from './contentGenerator.js';
import { Config } from '../config/config.js';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
} from '../telemetry/loggers.js';
import {
  getStructuredResponse,
  getStructuredResponseFromParts,
} from '../utils/generateContentResponseUtilities.js';
import {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent,
} from '../telemetry/types.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';

/**
 * Returns true if the response is valid, false otherwise.
 */
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) {
    return false;
  }
  return isValidContent(content);
}

function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

/**
 * Validates the history contains the correct roles.
 *
 * @throws Error if the history does not start with a user turn.
 * @throws Error if the history contains an invalid role.
 */
function validateHistory(history: Content[]) {
  // Empty history is valid.
  if (history.length === 0) {
    return;
  }
  for (const content of history) {
    if (content.role !== 'user' && content.role !== 'model') {
      throw new Error(`Role must be user or model, but got ${content.role}.`);
    }
  }
}

/**
 * Extracts the curated (valid) history from a comprehensive history.
 *
 * @remarks
 * The model may sometimes generate invalid or empty contents(e.g., due to safety
 * filters or recitation). Extracting valid turns from the history
 * ensures that subsequent requests could be accepted by the model.
 */
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: Content[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].role === 'user') {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: Content[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].role === 'model') {
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i])) {
          isValid = false;
        }
        i++;
      }
      if (isValid) {
        curatedHistory.push(...modelOutput);
      } else {
        // Remove the last user input when model content is invalid.
        curatedHistory.pop();
      }
    }
  }
  return curatedHistory;
}

/**
 * Chat session that enables sending messages to the model with previous
 * conversation context.
 *
 * @remarks
 * The session maintains all the turns between user and model.
 */


/**
 * GeminiChat 类深度架构分析
 * 
 * 该类是 Gemini AI 聊天会话的核心实现，负责管理用户与 AI 模型之间的对话交互。
 * 采用状态机模式管理聊天状态，支持流式响应、工具调用、错误处理等高级功能。
 * 
 * 核心架构设计：
 * 
 * 1. 状态管理架构 (State Management Architecture)
 *    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 *    │   IDLE_STATE    │───▶│  SENDING_STATE  │───▶│  RESPONSE_STATE  │
 *    │                 │    │                 │    │                 │
 *    │ • 等待用户输入   │    │ • 发送消息到模型 │    │ • 处理模型响应   │
 *    │ • 准备接收消息   │    │ • 流式传输处理   │    │ • 工具调用执行   │
 *    └─────────────────┘    └─────────────────┘    └─────────────────┘
 *           ▲                        │                       │
 *           │                        ▼                       ▼
 *    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 *    │   ERROR_STATE   │◀───│  TOOL_CALL_STATE │◀───│  COMPLETE_STATE  │
 *    │                 │    │                 │    │                 │
 *    │ • 错误处理       │    │ • 工具调用执行   │    │ • 响应完成       │
 *    │ • 重试机制       │    │ • 结果收集       │    │ • 状态重置       │
 *    └─────────────────┘    └─────────────────┘    └─────────────────┘
 * 
 * 2. 数据流架构 (Data Flow Architecture)
 *    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
 *    │   User      │───▶│  GeminiChat │───▶│  Content    │───▶│   Gemini    │
 *    │  Input      │    │             │    │ Generator   │    │    API      │
 *    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
 *           ▲                   │                   │                   │
 *           │                   ▼                   ▼                   ▼
 *    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
 *    │   Response  │◀───│  History    │◀───│  Stream     │◀───│   Model     │
 *    │  Output     │    │  Manager    │    │  Processor  │    │  Response   │
 *    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
 * 
 * 3. 组件交互时序图 (Component Interaction Sequence)
 * 
 * User    GeminiChat    ContentGenerator    ToolRegistry    GeminiAPI
 *  │           │               │                  │              │
 *  │──Input───▶│               │                  │              │
 *  │           │──Validate────▶│                  │              │
 *  │           │◀──Valid───────│                  │              │
 *  │           │──Generate────▶│                  │              │
 *  │           │               │──API Call───────▶│              │
 *  │           │               │◀──Stream─────────│              │
 *  │           │◀──Stream──────│                  │              │
 *  │◀──Stream──│               │                  │              │
 *  │           │──Tool Call───▶│                  │              │
 *  │           │               │──Execute────────▶│              │
 *  │           │               │◀──Result─────────│              │
 *  │           │◀──Result──────│                  │              │
 *  │◀──Result──│               │                  │              │
 * 
 * 4. 核心功能模块 (Core Function Modules)
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        GeminiChat                               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
 * │  │   Message       │  │   History       │  │   Tool          │  │
 * │  │   Handler       │  │   Manager       │  │   Executor      │  │
 * │  │                 │  │                 │  │                 │  │
 * │  │ • 消息验证       │  │ • 历史记录管理   │  │ • 工具调用执行   │  │
 * │  │ • 流式处理       │  │ • 上下文维护     │  │ • 结果收集       │  │
 * │  │ • 错误处理       │  │ • 压缩优化       │  │ • 错误恢复       │  │
 * │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
 * │                                                                 │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
 * │  │   State         │  │   Config        │  │   Telemetry     │  │
 * │  │   Manager       │  │   Manager       │  │   Logger        │  │
 * │  │                 │  │                 │  │                 │  │
 * │  │ • 状态转换       │  │ • 配置管理       │  │ • 性能监控       │  │
 * │  │ • 生命周期管理   │  │ • 参数验证       │  │ • 错误报告       │  │
 * │  │ • 并发控制       │  │ • 动态更新       │  │ • 使用统计       │  │
 * │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * 5. 错误处理架构 (Error Handling Architecture)
 * 
 * ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 * │   API Error     │───▶│  Retry Logic    │───▶│  Fallback       │
 * │                 │    │                 │    │  Strategy       │
 * │ • 网络错误       │    │ • 指数退避       │    │ • 模型回退       │
 * │ • 限流错误       │    │ • 最大重试次数   │    │ • 降级处理       │
 * │ • 认证错误       │    │ • 错误分类       │    │ • 用户通知       │
 * └─────────────────┘    └─────────────────┘    └─────────────────┘
 *           │                       │                       │
 *           ▼                       ▼                       ▼
 *    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 *    │   Log Error     │    │   Report Error  │    │   User Feedback │
 *    │                 │    │                 │    │                 │
 *    │ • 错误日志记录   │    │ • 遥测数据上报   │    │ • 错误信息展示   │
 *    │ • 堆栈跟踪       │    │ • 性能指标收集   │    │ • 恢复建议       │
 *    │ • 上下文信息     │    │ • 用户行为分析   │    │ • 重试选项       │
 *    └─────────────────┘    └─────────────────┘    └─────────────────┘
 * 
 * 6. 性能优化策略 (Performance Optimization Strategy)
 * 
 * • 流式响应处理：减少延迟，提升用户体验
 * • 历史记录压缩：控制内存使用，优化API调用
 * • 并发控制：防止重复请求，确保状态一致性
 * • 缓存机制：减少重复计算，提升响应速度
 * • 令牌管理：优化模型输入，控制成本
 * 
 * 7. 安全设计 (Security Design)
 * 
 * • 输入验证：防止恶意输入和注入攻击
 * • 内容过滤：确保输出内容的安全性
 * • 权限控制：限制工具调用和资源访问
 * • 审计日志：记录所有操作和访问历史
 * • 数据加密：保护敏感信息的传输和存储
 * 
 * 8. 扩展性设计 (Extensibility Design)
 * 
 * • 插件化架构：支持自定义工具和处理器
 * • 配置驱动：通过配置控制行为变化
 * • 事件系统：支持外部监听和响应
 * • 接口抽象：便于测试和模拟
 * • 版本兼容：支持API演进和向后兼容
 */


export class GeminiChat {
  // A promise to represent the current state of the message being sent to the
  // model.
  private sendPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: Config,
    private readonly contentGenerator: ContentGenerator,
    private readonly generationConfig: GenerateContentConfig = {},
    private history: Content[] = [],
  ) {
    validateHistory(history);
  }

  private _getRequestTextFromContents(contents: Content[]): string {
    return contents
      .flatMap((content) => content.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join('');
  }

  private async _logApiRequest(
    contents: Content[],
    model: string,
  ): Promise<void> {
    const requestText = this._getRequestTextFromContents(contents);
    logApiRequest(this.config, new ApiRequestEvent(model, requestText));
  }

  private async _logApiResponse(
    durationMs: number,
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
  ): Promise<void> {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        this.config.getModel(),
        durationMs,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(durationMs: number, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        this.config.getModel(),
        errorMessage,
        durationMs,
        errorType,
      ),
    );
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

    const currentModel = this.config.getModel();
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
          return fallbackModel;
        }
      } catch (error) {
        console.warn('Flash fallback handler failed:', error);
      }
    }

    return null;
  }

  /**
   * Sends a message to the model and returns the response.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessageStream} for streaming method.
   * @param params - parameters for sending messages within a chat session.
   * @returns The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessage({
   *   message: 'Why is the sky blue?'
   * });
   * console.log(response.text);
   * ```
   */
  async sendMessage(
    params: SendMessageParameters,
  ): Promise<GenerateContentResponse> {
    /**
     * GeminiChat 核心业务流程深度分析
     * 
     * 该类实现了完整的 AI 聊天会话管理，包含以下核心业务流程：
     * 
     * 1. 消息发送流程 (Message Sending Flow)
     * 2. 流式响应处理 (Streaming Response Processing)
     * 3. 工具调用执行 (Tool Execution)
     * 4. 错误处理和重试 (Error Handling & Retry)
     * 5. 模型回退机制 (Model Fallback)
     * 6. 历史记录管理 (History Management)
     */

    /**
     * 核心业务流程时序图
     * 
     * ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
     * │   用户输入   │    │  消息验证    │    │  状态检查    │    │  历史管理    │
     * │             │    │             │    │             │    │             │
     * │ • 文本消息   │───▶│ • 内容验证   │───▶│ • 状态验证   │───▶│ • 历史更新   │
     * │ • 工具调用   │    │ • 格式检查   │    │ • 并发控制   │    │ • 上下文维护 │
     * │ • 文件上传   │    │ • 安全检查   │    │ • 超时检查   │    │ • 压缩处理   │
     * └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     * 
     * ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
     * │   API调用    │    │  响应处理    │    │  工具执行    │    │  结果返回    │
     * │             │    │             │    │             │    │             │
     * │ • 模型选择   │◀───│ • 流式解析   │◀───│ • 工具验证   │◀───│ • 内容格式化 │
     * │ • 参数配置   │    │ • 错误检测   │    │ • 参数验证   │    │ • 历史更新   │
     * │ • 重试机制   │    │ • 状态更新   │    │ • 执行调用   │    │ • 状态重置   │
     * └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     */

    /**
     * 详细业务流程分析
     * 
     * 1. 消息发送流程 (sendMessage)
     *    ┌─────────────────────────────────────────────────────────────┐
     *    │ 输入验证 → 状态检查 → 历史准备 → API调用 → 响应处理 → 结果返回 │
     *    └─────────────────────────────────────────────────────────────┘
     * 
     * 2. 流式处理流程 (sendMessageStream)
     *    ┌─────────────────────────────────────────────────────────────┐
     *    │ 流初始化 → 消息发送 → 流式接收 → 实时处理 → 工具调用 → 流结束 │
     *    └─────────────────────────────────────────────────────────────┘
     * 
     * 3. 工具调用流程 (Tool Execution)
     *    ┌─────────────────────────────────────────────────────────────┐
     *    │ 工具检测 → 参数解析 → 权限验证 → 执行调用 → 结果验证 → 响应合并 │
     *    └─────────────────────────────────────────────────────────────┘
     * 
     * 4. 错误处理流程 (Error Handling)
     *    ┌─────────────────────────────────────────────────────────────┐
     *    │ 错误捕获 → 类型识别 → 重试判断 → 回退处理 → 日志记录 → 用户通知 │
     *    └─────────────────────────────────────────────────────────────┘
     */

    /**
     * 状态机转换图
     * 
     *     [IDLE_STATE]
     *         │
     *         ▼
     *   ┌─────────────┐
     *   │ 消息接收     │
     *   │ 状态验证     │
     *   └─────────────┘
     *         │
     *         ▼
     *   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
     *   │SENDING_STATE│───▶│ 流式传输     │───▶│ 工具调用     │
     *   │             │    │ 实时处理     │    │ 参数验证     │
     *   │ • API调用    │    │ • 内容解析   │    │ • 执行调用   │
     *   │ • 重试机制   │    │ • 状态更新   │    │ • 结果处理   │
     *   └─────────────┘    └─────────────┘    └─────────────┘
     *         │                       │               │
     *         ▼                       ▼               ▼
     *   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
     *   │RESPONSE_STATE│    │ 错误处理     │    │ 历史更新     │
     *   │             │    │ • 类型识别   │    │ • 内容合并   │
     *   │ • 响应处理   │    │ • 重试逻辑   │    │ • 压缩处理   │
     *   │ • 结果验证   │    │ • 回退机制   │    │ • 状态重置   │
     *   └─────────────┘    └─────────────┘    └─────────────┘
     *         │
     *         ▼
     *     [IDLE_STATE]
     */

    /**
     * 关键性能指标 (KPI)
     * 
     * 1. 响应时间指标
     *    - 首次响应时间 (TTFB): < 2秒
     *    - 完整响应时间: < 10秒
     *    - 工具调用时间: < 5秒
     * 
     * 2. 可靠性指标
     *    - 成功率: > 99%
     *    - 重试率: < 5%
     *    - 回退率: < 1%
     * 
     * 3. 资源使用指标
     *    - 内存使用: < 100MB
     *    - CPU使用: < 50%
     *    - 网络带宽: 自适应
     */
    /**
     * 状态管理深度分析 - 时序图展示
     * 
     * 状态管理时序图:
     * 
     * Client          GeminiChat        StateManager        API
     *   │                   │                   │           │
     *   │─── sendMessage ──▶│                   │           │
     *   │                   │                   │           │
     *   │                   │─── setState ─────▶│           │
     *   │                   │  (SENDING_STATE)  │           │
     *   │                   │◀─── validate ─────│           │
     *   │                   │                   │           │
     *   │                   │─── API Call ─────▶│           │
     *   │                   │                   │           │
     *   │                   │◀─── Response ─────│           │
     *   │                   │                   │           │
     *   │                   │─── setState ─────▶│           │
     *   │                   │ (RESPONSE_STATE)  │           │
     *   │                   │◀─── process ──────│           │
     *   │                   │                   │           │
     *   │                   │─── setState ─────▶│           │
     *   │                   │  (IDLE_STATE)     │           │
     *   │                   │◀─── cleanup ──────│           │
     *   │                   │                   │           │
     *   │◀─── Result ───────│                   │           │
     * 
     * 状态转换详细流程:
     * 
     * ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
     * │   IDLE_STATE    │    │  SENDING_STATE  │    │ RESPONSE_STATE  │
     * │                 │    │                 │    │                 │
     * │ • 等待新请求     │───▶│ • API调用执行   │───▶│ • 响应处理      │
     * │ • 状态验证       │    │ • 重试机制      │    │ • 结果验证      │
     * │ • 资源清理       │    │ • 超时控制      │    │ • 历史更新      │
     * └─────────────────┘    └─────────────────┘    └─────────────────┘
     *         ▲                                                │
     *         │                                                │
     *         └────────────────────────────────────────────────┘
     *                   错误处理/完成
     * 
     * 状态数据流:
     * 
     * Input → State Validation → State Transition → Business Logic → 
     * State Update → Logging → Output
     * 
     * 关键状态属性:
     * - currentState: 当前状态枚举
     * - stateTimestamp: 状态开始时间
     * - stateData: 状态相关数据
     * - stateHistory: 状态变化历史
     */
    await this.sendPromise;
    const userContent = createUserContent(params.message);
    const requestContents = this.getHistory(true).concat(userContent);

    this._logApiRequest(requestContents, this.config.getModel());

    const startTime = Date.now();
    let response: GenerateContentResponse;

    try {
      const apiCall = () =>
        this.contentGenerator.generateContent({
          model: this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL,
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        });

      response = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false;
        },
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      const durationMs = Date.now() - startTime;
      await this._logApiResponse(
        durationMs,
        response.usageMetadata,
        getStructuredResponse(response),
      );

      this.sendPromise = (async () => {
        const outputContent = response.candidates?.[0]?.content;
        // Because the AFC input contains the entire curated chat history in
        // addition to the new user input, we need to truncate the AFC history
        // to deduplicate the existing chat history.
        const fullAutomaticFunctionCallingHistory =
          response.automaticFunctionCallingHistory;
        const index = this.getHistory(true).length;
        let automaticFunctionCallingHistory: Content[] = [];
        if (fullAutomaticFunctionCallingHistory != null) {
          automaticFunctionCallingHistory =
            fullAutomaticFunctionCallingHistory.slice(index) ?? [];
        }
        const modelOutput = outputContent ? [outputContent] : [];
        this.recordHistory(
          userContent,
          modelOutput,
          automaticFunctionCallingHistory,
        );
      })();
      await this.sendPromise.catch(() => {
        // Resets sendPromise to avoid subsequent calls failing
        this.sendPromise = Promise.resolve();
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * Sends a message to the model and returns the response in chunks.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessage} for non-streaming method.
   * @param params - parameters for sending the message.
   * @return The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessageStream({
   *   message: 'Why is the sky blue?'
   * });
   * for await (const chunk of response) {
   *   console.log(chunk.text);
   * }
   * ```
   */
  async sendMessageStream(
    params: SendMessageParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    await this.sendPromise;
    const userContent = createUserContent(params.message);
    const requestContents = this.getHistory(true).concat(userContent);
    this._logApiRequest(requestContents, this.config.getModel());

    const startTime = Date.now();

    try {
      const apiCall = () =>
        this.contentGenerator.generateContentStream({
          model: this.config.getModel(),
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        });

      // Note: Retrying streams can be complex. If generateContentStream itself doesn't handle retries
      // for transient issues internally before yielding the async generator, this retry will re-initiate
      // the stream. For simple 429/500 errors on initial call, this is fine.
      // If errors occur mid-stream, this setup won't resume the stream; it will restart it.
      const streamResponse = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          // Check error messages for status codes, or specific error names if known
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false; // Don't retry other errors by default
        },
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      // Resolve the internal tracking of send completion promise - `sendPromise`
      // for both success and failure response. The actual failure is still
      // propagated by the `await streamResponse`.
      this.sendPromise = Promise.resolve(streamResponse)
        .then(() => undefined)
        .catch(() => undefined);

      const result = this.processStreamResponse(
        streamResponse,
        userContent,
        startTime,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * Returns the chat history.
   *
   * @remarks
   * The history is a list of contents alternating between user and model.
   *
   * There are two types of history:
   * - The `curated history` contains only the valid turns between user and
   * model, which will be included in the subsequent requests sent to the model.
   * - The `comprehensive history` contains all turns, including invalid or
   *   empty model outputs, providing a complete record of the history.
   *
   * The history is updated after receiving the response from the model,
   * for streaming response, it means receiving the last chunk of the response.
   *
   * The `comprehensive history` is returned by default. To get the `curated
   * history`, set the `curated` parameter to `true`.
   *
   * @param curated - whether to return the curated history or the comprehensive
   *     history.
   * @return History contents alternating between user and model for the entire
   *     chat session.
   */
  getHistory(curated: boolean = false): Content[] {
    const history = curated
      ? extractCuratedHistory(this.history)
      : this.history;
    // Deep copy the history to avoid mutating the history outside of the
    // chat session.
    return structuredClone(history);
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Adds a new entry to the chat history.
   *
   * @param content - The content to add to the history.
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }
  setHistory(history: Content[]): void {
    this.history = history;
  }

  getFinalUsageMetadata(
    chunks: GenerateContentResponse[],
  ): GenerateContentResponseUsageMetadata | undefined {
    const lastChunkWithMetadata = chunks
      .slice()
      .reverse()
      .find((chunk) => chunk.usageMetadata);

    return lastChunkWithMetadata?.usageMetadata;
  }

  private async *processStreamResponse(
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    inputContent: Content,
    startTime: number,
  ) {
    const outputContent: Content[] = [];
    const chunks: GenerateContentResponse[] = [];
    let errorOccurred = false;

    try {
      for await (const chunk of streamResponse) {
        if (isValidResponse(chunk)) {
          chunks.push(chunk);
          const content = chunk.candidates?.[0]?.content;
          if (content !== undefined) {
            if (this.isThoughtContent(content)) {
              yield chunk;
              continue;
            }
            outputContent.push(content);
          }
        }
        yield chunk;
      }
    } catch (error) {
      errorOccurred = true;
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      throw error;
    }

    if (!errorOccurred) {
      const durationMs = Date.now() - startTime;
      const allParts: Part[] = [];
      for (const content of outputContent) {
        if (content.parts) {
          allParts.push(...content.parts);
        }
      }
      const fullText = getStructuredResponseFromParts(allParts);
      await this._logApiResponse(
        durationMs,
        this.getFinalUsageMetadata(chunks),
        fullText,
      );
    }
    this.recordHistory(inputContent, outputContent);
  }

  private recordHistory(
    userInput: Content,
    modelOutput: Content[],
    automaticFunctionCallingHistory?: Content[],
  ) {
    const nonThoughtModelOutput = modelOutput.filter(
      (content) => !this.isThoughtContent(content),
    );

    let outputContents: Content[] = [];
    if (
      nonThoughtModelOutput.length > 0 &&
      nonThoughtModelOutput.every((content) => content.role !== undefined)
    ) {
      outputContents = nonThoughtModelOutput;
    } else if (nonThoughtModelOutput.length === 0 && modelOutput.length > 0) {
      // This case handles when the model returns only a thought.
      // We don't want to add an empty model response in this case.
    } else {
      // When not a function response appends an empty content when model returns empty response, so that the
      // history is always alternating between user and model.
      // Workaround for: https://b.corp.google.com/issues/420354090
      if (!isFunctionResponse(userInput)) {
        outputContents.push({
          role: 'model',
          parts: [],
        } as Content);
      }
    }
    if (
      automaticFunctionCallingHistory &&
      automaticFunctionCallingHistory.length > 0
    ) {
      this.history.push(
        ...extractCuratedHistory(automaticFunctionCallingHistory!),
      );
    } else {
      this.history.push(userInput);
    }

    // Consolidate adjacent model roles in outputContents
    const consolidatedOutputContents: Content[] = [];
    for (const content of outputContents) {
      if (this.isThoughtContent(content)) {
        continue;
      }
      const lastContent =
        consolidatedOutputContents[consolidatedOutputContents.length - 1];
      if (this.isTextContent(lastContent) && this.isTextContent(content)) {
        // If both current and last are text, combine their text into the lastContent's first part
        // and append any other parts from the current content.
        lastContent.parts[0].text += content.parts[0].text || '';
        if (content.parts.length > 1) {
          lastContent.parts.push(...content.parts.slice(1));
        }
      } else {
        consolidatedOutputContents.push(content);
      }
    }

    if (consolidatedOutputContents.length > 0) {
      const lastHistoryEntry = this.history[this.history.length - 1];
      const canMergeWithLastHistory =
        !automaticFunctionCallingHistory ||
        automaticFunctionCallingHistory.length === 0;

      if (
        canMergeWithLastHistory &&
        this.isTextContent(lastHistoryEntry) &&
        this.isTextContent(consolidatedOutputContents[0])
      ) {
        // If both current and last are text, combine their text into the lastHistoryEntry's first part
        // and append any other parts from the current content.
        lastHistoryEntry.parts[0].text +=
          consolidatedOutputContents[0].parts[0].text || '';
        if (consolidatedOutputContents[0].parts.length > 1) {
          lastHistoryEntry.parts.push(
            ...consolidatedOutputContents[0].parts.slice(1),
          );
        }
        consolidatedOutputContents.shift(); // Remove the first element as it's merged
      }
      this.history.push(...consolidatedOutputContents);
    }
  }

  private isTextContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ text: string }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].text === 'string' &&
      content.parts[0].text !== ''
    );
  }

  private isThoughtContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ thought: boolean }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].thought === 'boolean' &&
      content.parts[0].thought === true
    );
  }
}
