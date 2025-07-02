/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthClient } from 'google-auth-library';
import {
  CodeAssistGlobalUserSettingResponse,
  LoadCodeAssistRequest,
  LoadCodeAssistResponse,
  LongrunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
} from './types.js';
import {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import {
  CaCountTokenResponse,
  CaGenerateContentResponse,
  fromCountTokenResponse,
  fromGenerateContentResponse,
  toCountTokenRequest,
  toGenerateContentRequest,
} from './converter.js';
import { PassThrough } from 'node:stream';

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

// TODO: Use production endpoint once it supports our methods.
export const CODE_ASSIST_ENDPOINT =
  process.env.CODE_ASSIST_ENDPOINT ?? 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

/**
 * CodeAssistServer 业务流程分析
 * 
 * 1. 初始化流程 (Initialization Flow)
 *    - 构造函数接收 AuthClient、projectId 和 httpOptions
 *    - 建立与 Code Assist API 的连接
 *    - 配置认证和项目上下文
 * 
 * 2. 内容生成流程 (Content Generation Flow)
 *    - generateContent(): 同步生成内容
 *    - generateContentStream(): 流式生成内容
 *    - 支持请求参数转换和响应处理
 * 
 * 3. 用户管理流程 (User Management Flow)
 *    - onboardUser(): 用户注册和初始化
 *    - loadCodeAssist(): 加载用户配置和设置
 *    - 支持长期运行操作
 * 
 * 4. API 调用流程 (API Call Flow)
 *    - callEndpoint(): 同步 API 调用
 *    - streamEndpoint(): 流式 API 调用
 *    - 统一的错误处理和重试机制
 * 
 * 调用时序图 (Sequence Diagram):
 * 
 * ┌─────────┐    ┌─────────────────┐    ┌─────────────┐    ┌─────────────┐
 * │ Client  │    │ CodeAssistServer│    │   Converter │    │     API     │
 * └────┬────┘    └─────────┬───────┘    └──────┬──────┘    └──────┬──────┘
 *      │                   │                   │                  │
 *      │ 构造函数           │                   │                  │
 *      │ (auth,projectId)  │                   │                  │
 *      │ ──────────────────>│                   │                  │
 *      │                   │ 验证认证信息       │                  │
 *      │                   │ ─────────────────────────────────────>│
 *      │                   │                   │                  │
 *      │ generateContent() │                   │                  │
 *      │ ──────────────────>│                   │                  │
 *      │                   │ toGenerateContent │                  │
 *      │                   │ Request()         │                  │
 *      │                   │ ──────────────────>│                  │
 *      │                   │                   │ 转换后的请求      │
 *      │                   │                   │ ─────────────────>│
 *      │                   │                   │                  │
 *      │                   │                   │                  │ 处理请求
 *      │                   │                   │                  │ ──┐
 *      │                   │                   │                  │   │
 *      │                   │                   │                  │ <─┘
 *      │                   │                   │                  │
 *      │                   │                   │ CaGenerateContent│
 *      │                   │                   │ Response         │
 *      │                   │                   │ <────────────────│
 *      │                   │ fromGenerateContent│                 │
 *      │                   │ Response()        │                  │
 *      │                   │ <──────────────────│                  │
 *      │ GenerateContent   │                   │                  │
 *      │ Response          │                   │                  │
 *      │ <─────────────────│                   │                  │
 *      │                   │                   │                  │
 *      │ generateContent   │                   │                  │
 *      │ Stream()          │                   │                  │
 *      │ ──────────────────>│                   │                  │
 *      │                   │ toGenerateContent │                  │
 *      │                   │ Request()         │                  │
 *      │                   │ ──────────────────>│                  │
 *      │                   │                   │ 转换后的请求      │
 *      │                   │                   │ ─────────────────>│
 *      │                   │                   │                  │
 *      │                   │                   │                  │ 流式处理
 *      │                   │                   │                  │ ──┐
 *      │                   │                   │                  │   │
 *      │                   │                   │                  │ <─┘
 *      │                   │                   │                  │
 *      │                   │                   │ Stream<Response> │
 *      │                   │                   │ <────────────────│
 *      │                   │ fromGenerateContent│                 │
 *      │                   │ Response()        │                  │
 *      │                   │ <──────────────────│                  │
 *      │ AsyncGenerator    │                   │                  │
 *      │ <Response>        │                   │                  │
 *      │ <─────────────────│                   │                  │
 *      │                   │                   │                  │
 *      │ onboardUser()     │                   │                  │
 *      │ ──────────────────>│                   │                  │
 *      │                   │                   │                  │
 *      │                   │ POST /onboardUser │                  │
 *      │                   │ ─────────────────────────────────────>│
 *      │                   │                   │                  │
 *      │                   │ LongrunningOp     │                  │
 *      │                   │ Response          │                  │
 *      │                   │ <────────────────────────────────────│
 *      │                   │                   │                  │
 *      │ LongrunningOp     │                   │                  │
 *      │ Response          │                   │                  │
 *      │ <─────────────────│                   │                  │
 *      │                   │                   │                  │
 *      │ loadCodeAssist()  │                   │                  │
 *      │ ──────────────────>│                   │                  │
 *      │                   │                   │                  │
 *      │                   │ POST /loadCodeAssist                 │
 *      │                   │ ─────────────────────────────────────>│
 *      │                   │                   │                  │
 *      │                   │ LoadCodeAssist    │                  │
 *      │                   │ Response          │                  │
 *      │                   │ <────────────────────────────────────│
 *      │                   │                   │                  │
 *      │ LoadCodeAssist    │                   │                  │
 *      │ Response          │                   │                  │
 *      │ <─────────────────│                   │                  │
 * 
 * 关键设计模式：
 * - 适配器模式：请求/响应转换
 * - 工厂模式：内容生成器创建
 * - 策略模式：不同 API 端点处理
 * - 观察者模式：流式响应处理
 * 
 * 数据流：
 * 用户请求 → 参数转换 → API调用 → 响应转换 → 结果返回
 *     ↓
 * 流式处理 → 实时转换 → 增量返回
 *     ↓
 * 错误处理 → 重试机制 → 异常报告
 * 
 */


export class CodeAssistServer implements ContentGenerator {
  constructor(
    readonly auth: AuthClient,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resps = await this.streamEndpoint<CaGenerateContentResponse>(
      'streamGenerateContent',
      toGenerateContentRequest(req, this.projectId),
      req.config?.abortSignal,
    );
    return (async function* (): AsyncGenerator<GenerateContentResponse> {
      for await (const resp of resps) {
        yield fromGenerateContentResponse(resp);
      }
    })();
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const resp = await this.callEndpoint<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(req, this.projectId),
      req.config?.abortSignal,
    );
    return fromGenerateContentResponse(resp);
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongrunningOperationResponse> {
    return await this.callEndpoint<LongrunningOperationResponse>(
      'onboardUser',
      req,
    );
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    return await this.callEndpoint<LoadCodeAssistResponse>(
      'loadCodeAssist',
      req,
    );
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.getEndpoint<CodeAssistGlobalUserSettingResponse>(
      'getCodeAssistGlobalUserSetting',
    );
  }

  async setCodeAssistGlobalUserSetting(
    req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.callEndpoint<CodeAssistGlobalUserSettingResponse>(
      'setCodeAssistGlobalUserSetting',
      req,
    );
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    const resp = await this.callEndpoint<CaCountTokenResponse>(
      'countTokens',
      toCountTokenRequest(req),
    );
    return fromCountTokenResponse(resp);
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }

  async callEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      body: JSON.stringify(req),
      signal,
    });
    return res.data as T;
  }

  async getEndpoint<T>(method: string, signal?: AbortSignal): Promise<T> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      signal,
    });
    return res.data as T;
  }

  async streamEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      params: {
        alt: 'sse',
      },
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'stream',
      body: JSON.stringify(req),
      signal,
    });

    return (async function* (): AsyncGenerator<T> {
      const rl = readline.createInterface({
        input: res.data as PassThrough,
        crlfDelay: Infinity, // Recognizes '\r\n' and '\n' as line breaks
      });

      let bufferedLines: string[] = [];
      for await (const line of rl) {
        // blank lines are used to separate JSON objects in the stream
        if (line === '') {
          if (bufferedLines.length === 0) {
            continue; // no data to yield
          }
          yield JSON.parse(bufferedLines.join('\n')) as T;
          bufferedLines = []; // Reset the buffer after yielding
        } else if (line.startsWith('data: ')) {
          bufferedLines.push(line.slice(6).trim());
        } else {
          throw new Error(`Unexpected line format in response: ${line}`);
        }
      }
    })();
  }
}
