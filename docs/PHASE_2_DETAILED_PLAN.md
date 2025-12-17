# 阶段 2: Core 包集成 - 详细执行方案

## 📋 概览

**阶段目标**: 集成 `packages/core`，实现完整的对话功能和工具执行系统
**持续时间**: 3 周 (15 个工作日)
**关键产出**: 可用的对话 API + 工具适配器 + 端到端集成测试

---

## 🗓️ 时间规划

| 任务模块 | 天数 | 负责人 | 依赖 |
|---------|------|--------|------|
| 2.1 Core 包分析与准备 | 2 天 | 后端 #1 + #2 | 阶段 1 完成 |
| 2.2 Gemini API 集成 | 3 天 | 后端 #1 | 2.1 完成 |
| 2.3 对话管理服务 | 4 天 | 后端 #1 | 2.2 完成 |
| 2.4 工具系统适配 | 6 天 | 后端 #2 | 2.1 完成 |
| 2.5 CoreToolScheduler 集成 | 3 天 | 后端 #1 + #2 | 2.3, 2.4 完成 |
| 2.6 集成测试 | 3 天 | 后端 #1 + #2 | 2.1-2.5 完成 |

**注意**: 2.2-2.3 和 2.4 可以并行进行

---

## 🔍 任务 2.1: Core 包分析与准备 (2 天)

### 目标
深入分析 `packages/core` 的架构和依赖，设计适配器接口。

### 详细步骤

#### Day 1: Core 包依赖分析

**步骤 1.1: 创建 Core 包链接** (1 小时)

```bash
# 方案 A: 使用 pnpm workspace
cd packages
ln -s ../../gemini-cli/packages/core ./core

# 更新 packages/backend/package.json
pnpm add @google/gemini-cli-core@workspace:*
```

更新 `packages/backend/package.json`:

```json
{
  "dependencies": {
    "@google/gemini-cli-core": "workspace:*",
    "@google/genai": "^1.30.0"
  }
}
```

**步骤 1.2: 分析 Core 包导出** (2 小时)

创建 `docs/CORE_PACKAGE_ANALYSIS.md`:

```markdown
# Core 包分析报告

## 核心类

### GeminiClient
- **位置**: `packages/core/src/core/client.ts`
- **职责**: 管理与 Gemini API 的交互
- **关键方法**:
  - `initialize()`: 初始化客户端
  - `sendMessage(message: string)`: 发送消息并返回流式响应
  - `getSessionHistory()`: 获取会话历史

### GeminiChat
- **位置**: `packages/core/src/core/geminiChat.ts`
- **职责**: 底层 Gemini API 调用
- **关键方法**:
  - `sendMessage(content)`: 发送消息
  - `streamGenerateContent()`: 流式生成内容

### CoreToolScheduler
- **位置**: `packages/core/src/core/coreToolScheduler.ts`
- **职责**: 工具调度和执行
- **关键方法**:
  - `scheduleTool()`: 调度工具执行
  - `executeTool()`: 执行工具

## 工具系统

### 工具列表
1. ReadFileTool - 读取文件
2. WriteFileTool - 写入文件
3. EditTool - 编辑文件
4. ShellTool - 执行 Shell 命令
5. GrepTool - 文本搜索
6. GlobTool - 文件匹配
7. WebFetchTool - 网页抓取
8. WebSearchTool - 网页搜索
9. MemoryTool - 内存管理
10. WriteTodosTool - Todo 管理

### 工具接口
```typescript
interface Tool {
  name: string;
  description: string;
  schema: object;
  execute(params: any): Promise<ToolResult>;
}
```

## 依赖关系

### 核心依赖
- `@google/genai`: Gemini API SDK
- Node.js 文件系统 API
- Docker/PTY (用于 Shell 执行)

### 需要适配的部分
1. 文件系统访问 → MinIO/S3
2. Shell 执行 → Docker 容器
3. CLI 特定代码 → Web 环境
```

**步骤 1.3: 设计适配器架构** (2 小时)

创建 `packages/backend/src/adapters/types.ts`:

```typescript
/**
 * 工具适配器基础接口
 */
export interface ToolAdapter<TParams = any, TResult = any> {
  /**
   * 执行工具
   */
  execute(params: TParams): Promise<TResult>;

  /**
   * 验证参数
   */
  validate?(params: TParams): Promise<boolean>;

  /**
   * 获取工具名称
   */
  getName(): string;
}

/**
 * 异步流式适配器
 */
export interface StreamingToolAdapter<TParams = any, TChunk = any>
  extends ToolAdapter<TParams, AsyncIterable<TChunk>> {
  /**
   * 流式执行
   */
  executeStream(params: TParams): AsyncIterable<TChunk>;
}

/**
 * 文件系统适配器接口
 */
export interface FileSystemAdapter {
  readFile(workspaceId: string, path: string): Promise<string>;
  writeFile(workspaceId: string, path: string, content: string): Promise<void>;
  editFile(workspaceId: string, path: string, edits: FileEdit[]): Promise<void>;
  listFiles(workspaceId: string, pattern: string): Promise<string[]>;
  deleteFile(workspaceId: string, path: string): Promise<void>;
}

export interface FileEdit {
  oldText: string;
  newText: string;
}

/**
 * Shell 适配器接口
 */
export interface ShellAdapter {
  execute(
    workspaceId: string,
    command: string,
    options?: ShellExecuteOptions
  ): AsyncIterable<ShellOutput>;

  kill(workspaceId: string, processId: string): Promise<void>;
}

export interface ShellExecuteOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ShellOutput {
  type: 'stdout' | 'stderr' | 'exit';
  data: string | number;
}

/**
 * Web 工具适配器接口
 */
export interface WebToolsAdapter {
  fetch(url: string, options?: FetchOptions): Promise<string>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SearchOptions {
  limit?: number;
  language?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

**步骤 1.4: 创建适配器工厂** (2 小时)

创建 `packages/backend/src/adapters/factory.ts`:

```typescript
import { FileSystemAdapter, ShellAdapter, WebToolsAdapter } from './types.js';
import { MinIOFileSystemAdapter } from './filesystem/minio.adapter.js';
import { DockerShellAdapter } from './shell/docker.adapter.js';
import { ProxyWebToolsAdapter } from './web/proxy.adapter.js';
import { config } from '../config/index.js';

/**
 * 适配器工厂
 */
export class AdapterFactory {
  private static fileSystemAdapter: FileSystemAdapter;
  private static shellAdapter: ShellAdapter;
  private static webToolsAdapter: WebToolsAdapter;

  /**
   * 获取文件系统适配器
   */
  static getFileSystemAdapter(): FileSystemAdapter {
    if (!this.fileSystemAdapter) {
      this.fileSystemAdapter = new MinIOFileSystemAdapter({
        endpoint: config.minio.endpoint,
        port: config.minio.port,
        accessKey: config.minio.accessKey,
        secretKey: config.minio.secretKey,
        bucket: config.minio.bucket,
        useSSL: config.minio.useSSL,
      });
    }
    return this.fileSystemAdapter;
  }

  /**
   * 获取 Shell 适配器
   */
  static getShellAdapter(): ShellAdapter {
    if (!this.shellAdapter) {
      this.shellAdapter = new DockerShellAdapter({
        host: config.docker.host,
        sandboxImage: config.docker.sandboxImage,
        memoryLimit: config.docker.sandboxMemoryLimit,
        cpuLimit: config.docker.sandboxCpuLimit,
      });
    }
    return this.shellAdapter;
  }

  /**
   * 获取 Web 工具适配器
   */
  static getWebToolsAdapter(): WebToolsAdapter {
    if (!this.webToolsAdapter) {
      this.webToolsAdapter = new ProxyWebToolsAdapter();
    }
    return this.webToolsAdapter;
  }
}
```

**验证清单 Day 1**:
- [ ] Core 包成功链接到项目
- [ ] Core 包分析文档完成
- [ ] 适配器接口设计完成
- [ ] 适配器工厂实现完成

---

#### Day 2: 配置管理和工具注册表

**步骤 2.1: 创建 Core 配置适配器** (2 小时)

创建 `packages/backend/src/services/core-config.service.ts`:

```typescript
import { Config as CoreConfig } from '@google/gemini-cli-core';
import { config } from '../config/index.js';
import { ToolRegistry } from '@google/gemini-cli-core';
import logger from '../utils/logger.js';

/**
 * Core 配置服务
 * 将 Web 平台配置转换为 Core 包需要的格式
 */
export class CoreConfigService {
  /**
   * 为用户创建 Core Config
   */
  static createConfig(userId: string, workspaceId: string): CoreConfig {
    return new CoreConfig({
      // API Key (从用户配置或环境变量获取)
      apiKey: config.gemini.apiKey,

      // 目标目录 (工作区路径)
      targetDir: `/workspaces/${workspaceId}`,

      // 会话 ID
      sessionId: `${userId}-${workspaceId}-${Date.now()}`,

      // 工具配置
      tools: {
        enabled: [
          'read-file',
          'write-file',
          'edit',
          'shell',
          'grep',
          'glob',
          'web-fetch',
          'web-search',
          'memory',
          'write-todos',
        ],
      },

      // 沙箱配置
      sandbox: {
        enabled: true,
        image: config.docker.sandboxImage,
      },

      // 日志配置
      logging: {
        level: config.logging.level,
      },
    });
  }

  /**
   * 创建工具注册表
   */
  static createToolRegistry(workspaceId: string): ToolRegistry {
    const registry = new ToolRegistry();

    // 注册适配后的工具
    // 将在后续步骤中实现

    return registry;
  }
}
```

**步骤 2.2: 创建用户特定的 Gemini Client 管理器** (2.5 小时)

创建 `packages/backend/src/services/gemini-client-manager.service.ts`:

```typescript
import { GeminiClient } from '@google/gemini-cli-core';
import { CoreConfigService } from './core-config.service.js';
import logger from '../utils/logger.js';

/**
 * Gemini Client 管理器
 * 为每个用户/工作区维护独立的 GeminiClient 实例
 */
export class GeminiClientManager {
  private static clients = new Map<string, GeminiClient>();

  /**
   * 获取或创建客户端
   */
  static async getClient(
    userId: string,
    workspaceId: string
  ): Promise<GeminiClient> {
    const key = `${userId}:${workspaceId}`;

    if (!this.clients.has(key)) {
      logger.info('Creating new GeminiClient', { userId, workspaceId });

      const config = CoreConfigService.createConfig(userId, workspaceId);
      const client = new GeminiClient(config);

      await client.initialize();

      this.clients.set(key, client);
    }

    return this.clients.get(key)!;
  }

  /**
   * 移除客户端
   */
  static removeClient(userId: string, workspaceId: string): void {
    const key = `${userId}:${workspaceId}`;
    this.clients.delete(key);
    logger.info('Removed GeminiClient', { userId, workspaceId });
  }

  /**
   * 清理空闲客户端
   */
  static cleanupIdleClients(idleTimeMs: number = 30 * 60 * 1000): void {
    // TODO: 实现空闲检测和清理
  }
}
```

**步骤 2.3: 创建集成测试计划** (1.5 小时)

创建 `packages/backend/tests/integration/core-integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GeminiClientManager } from '../../src/services/gemini-client-manager.service.js';
import { createTestUser, createTestWorkspace } from '../helpers.js';

describe('Core Package Integration', () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const workspace = await createTestWorkspace(userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    GeminiClientManager.removeClient(userId, workspaceId);
  });

  it('should create GeminiClient instance', async () => {
    const client = await GeminiClientManager.getClient(userId, workspaceId);

    expect(client).toBeDefined();
    expect(client).toHaveProperty('initialize');
    expect(client).toHaveProperty('sendMessage');
  });

  it('should reuse existing client instance', async () => {
    const client1 = await GeminiClientManager.getClient(userId, workspaceId);
    const client2 = await GeminiClientManager.getClient(userId, workspaceId);

    expect(client1).toBe(client2);
  });

  it('should send simple message', async () => {
    const client = await GeminiClientManager.getClient(userId, workspaceId);

    const events: any[] = [];
    for await (const event of client.sendMessage('Hello, respond with "Hi"')) {
      events.push(event);
      if (event.type === 'content' && event.text) {
        expect(event.text.toLowerCase()).toContain('hi');
        break;
      }
    }

    expect(events.length).toBeGreaterThan(0);
  });
});
```

**验证清单 Day 2**:
- [ ] Core 配置服务创建完成
- [ ] GeminiClient 管理器实现完成
- [ ] 集成测试计划编写完成
- [ ] 测试可以运行（即使暂时跳过）

---

## 🤖 任务 2.2: Gemini API 集成 (3 天)

### 目标
实现完整的 Gemini API 调用封装，支持流式响应和错误处理。

### 详细步骤

#### Day 3: ChatService 基础实现

**步骤 3.1: 创建 ChatService** (3 小时)

创建 `packages/backend/src/services/chat.service.ts`:

```typescript
import { GeminiClientManager } from './gemini-client-manager.service.js';
import { prisma } from '../utils/prisma.js';
import { ChatSession, Message } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../types/errors.js';
import logger from '../utils/logger.js';

export interface ChatEvent {
  type: 'content' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  content?: string;
  toolCall?: any;
  toolResult?: any;
  thinking?: string;
  error?: string;
}

export class ChatService {
  /**
   * 创建新会话
   */
  async createSession(
    userId: string,
    workspaceId: string,
    title?: string
  ): Promise<ChatSession> {
    // 验证工作区是否属于用户
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userId,
      },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // 创建会话
    const session = await prisma.chatSession.create({
      data: {
        userId,
        workspaceId,
        title: title || 'New Chat',
        status: 'ACTIVE',
      },
    });

    logger.info('Chat session created', {
      sessionId: session.id,
      userId,
      workspaceId,
    });

    return session;
  }

  /**
   * 获取会话
   */
  async getSession(sessionId: string, userId: string): Promise<ChatSession> {
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundError('Chat session not found');
    }

    return session;
  }

  /**
   * 发送消息（流式）
   */
  async *sendMessage(
    sessionId: string,
    userId: string,
    message: string
  ): AsyncGenerator<ChatEvent> {
    // 获取会话
    const session = await this.getSession(sessionId, userId);

    if (session.status !== 'ACTIVE') {
      throw new BadRequestError('Chat session is not active');
    }

    try {
      // 保存用户消息
      await this.saveMessage(sessionId, 'USER', { text: message });

      // 获取 GeminiClient
      const client = await GeminiClientManager.getClient(
        userId,
        session.workspaceId
      );

      // 流式生成
      let fullResponse = '';
      for await (const event of client.sendMessage(message)) {
        // 转换事件格式
        const chatEvent = this.convertToChatEvent(event);
        yield chatEvent;

        // 收集完整响应
        if (chatEvent.type === 'content' && chatEvent.content) {
          fullResponse += chatEvent.content;
        }
      }

      // 保存 AI 回复
      await this.saveMessage(sessionId, 'MODEL', { text: fullResponse });

      // 更新统计
      await this.updateSessionStats(sessionId);

      yield { type: 'done' };
    } catch (error) {
      logger.error('Error in sendMessage', { error, sessionId, userId });
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 保存消息
   */
  private async saveMessage(
    sessionId: string,
    role: 'USER' | 'MODEL' | 'TOOL',
    content: any
  ): Promise<Message> {
    return prisma.message.create({
      data: {
        sessionId,
        role,
        content,
      },
    });
  }

  /**
   * 转换事件格式
   */
  private convertToChatEvent(coreEvent: any): ChatEvent {
    // TODO: 实现事件转换逻辑
    return {
      type: 'content',
      content: coreEvent.text || '',
    };
  }

  /**
   * 更新会话统计
   */
  private async updateSessionStats(sessionId: string): Promise<void> {
    const messageCount = await prisma.message.count({
      where: { sessionId },
    });

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        messageCount,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(
    sessionId: string,
    userId: string,
    limit: number = 50
  ): Promise<Message[]> {
    // 验证会话所有权
    await this.getSession(sessionId, userId);

    return prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    await this.getSession(sessionId, userId);

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { status: 'DELETED' },
    });

    logger.info('Chat session deleted', { sessionId, userId });
  }

  /**
   * 列出用户的会话
   */
  async listUserSessions(
    userId: string,
    workspaceId?: string
  ): Promise<ChatSession[]> {
    return prisma.chatSession.findMany({
      where: {
        userId,
        ...(workspaceId && { workspaceId }),
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

// 导出单例
export const chatService = new ChatService();
```

**步骤 3.2: 创建 Chat API 路由** (2 小时)

创建 `packages/backend/src/api/chat/routes.ts`:

```typescript
import { Router } from 'express';
import { chatService } from '../../services/chat.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { ResponseHelper } from '../../utils/response.js';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// Schema 定义
const createSessionSchema = z.object({
  body: z.object({
    workspaceId: z.string().uuid(),
    title: z.string().optional(),
  }),
});

const sendMessageSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid(),
  }),
  body: z.object({
    message: z.string().min(1),
  }),
});

/**
 * POST /api/chat/sessions
 * 创建新会话
 */
router.post(
  '/sessions',
  validate(createSessionSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId, title } = req.body;
    const userId = req.user!.id;

    const session = await chatService.createSession(userId, workspaceId, title);

    return ResponseHelper.created(res, session);
  })
);

/**
 * GET /api/chat/sessions
 * 列出用户的会话
 */
router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { workspaceId } = req.query;

    const sessions = await chatService.listUserSessions(
      userId,
      workspaceId as string | undefined
    );

    return ResponseHelper.success(res, sessions);
  })
);

/**
 * GET /api/chat/sessions/:sessionId
 * 获取会话详情
 */
router.get(
  '/sessions/:sessionId',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const session = await chatService.getSession(sessionId, userId);

    return ResponseHelper.success(res, session);
  })
);

/**
 * GET /api/chat/sessions/:sessionId/messages
 * 获取会话消息历史
 */
router.get(
  '/sessions/:sessionId/messages',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const messages = await chatService.getSessionHistory(
      sessionId,
      userId,
      limit
    );

    return ResponseHelper.success(res, messages);
  })
);

/**
 * POST /api/chat/sessions/:sessionId/messages
 * 发送消息（非流式，用于测试）
 */
router.post(
  '/sessions/:sessionId/messages',
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { message } = req.body;
    const userId = req.user!.id;

    const events: any[] = [];
    for await (const event of chatService.sendMessage(
      sessionId,
      userId,
      message
    )) {
      events.push(event);
    }

    return ResponseHelper.success(res, { events });
  })
);

/**
 * DELETE /api/chat/sessions/:sessionId
 * 删除会话
 */
router.delete(
  '/sessions/:sessionId',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    await chatService.deleteSession(sessionId, userId);

    return ResponseHelper.noContent(res);
  })
);

export default router;
```

**步骤 3.3: 挂载 Chat 路由** (30 分钟)

更新 `packages/backend/src/app.ts`:

```typescript
// 导入路由
import chatRoutes from './api/chat/routes.js';

// ... 其他代码

// API 路由
app.use('/api/chat', chatRoutes);
```

**步骤 3.4: 测试 Chat API** (1.5 小时)

创建 `packages/backend/tests/integration/chat-api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import {
  createTestUser,
  createTestWorkspace,
  generateAccessToken,
} from '../helpers.js';
import { Express } from 'express';

describe('Chat API', () => {
  let app: Express;
  let accessToken: string;
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    app = createApp();

    // 创建测试用户和工作区
    const user = await createTestUser();
    userId = user.id;
    accessToken = generateAccessToken(userId, user.email);

    const workspace = await createTestWorkspace(userId);
    workspaceId = workspace.id;
  });

  describe('POST /api/chat/sessions', () => {
    it('should create new chat session', async () => {
      const response = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId,
          title: 'Test Session',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe('Test Session');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/chat/sessions')
        .send({ workspaceId });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/chat/sessions', () => {
    it('should list user sessions', async () => {
      const response = await request(app)
        .get('/api/chat/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /api/chat/sessions/:sessionId/messages', () => {
    it('should send message and get response', async () => {
      // 创建会话
      const createResponse = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workspaceId });

      const sessionId = createResponse.body.data.id;

      // 发送消息
      const response = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          message: 'Hello, respond with "Hi"',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.events).toBeDefined();
      expect(response.body.data.events.length).toBeGreaterThan(0);
    }, 30000); // 30秒超时
  });
});
```

运行测试:

```bash
cd packages/backend
pnpm test chat-api
```

**验证清单 Day 3**:
- [ ] ChatService 实现完成
- [ ] Chat API 路由创建完成
- [ ] 路由挂载成功
- [ ] 集成测试通过
- [ ] 可以创建会话和发送消息

---

#### Day 4-5: 流式响应和错误处理

**步骤 4.1: 实现 SSE 流式端点** (3 小时)

创建 `packages/backend/src/api/chat/stream.routes.ts`:

```typescript
import { Router } from 'express';
import { chatService } from '../../services/chat.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const router = Router();

router.use(authMiddleware);

/**
 * POST /api/chat/sessions/:sessionId/stream
 * 流式发送消息（SSE）
 */
router.post(
  '/sessions/:sessionId/stream',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { message } = req.body;
    const userId = req.user!.id;

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送初始连接消息
    res.write('data: {"type":"connected"}\n\n');

    try {
      // 流式生成
      for await (const event of chatService.sendMessage(
        sessionId,
        userId,
        message
      )) {
        // 发送事件
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        // 如果是完成或错误事件，结束流
        if (event.type === 'done' || event.type === 'error') {
          break;
        }
      }
    } catch (error) {
      logger.error('Error in stream', { error, sessionId });
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`
      );
    } finally {
      res.end();
    }
  })
);

export default router;
```

挂载到 `app.ts`:

```typescript
import chatStreamRoutes from './api/chat/stream.routes.js';

app.use('/api/chat', chatStreamRoutes);
```

**步骤 4.2: 改进错误处理** (2 小时)

更新 `packages/backend/src/services/chat.service.ts`:

```typescript
// 在 sendMessage 方法中添加更详细的错误处理
async *sendMessage(
  sessionId: string,
  userId: string,
  message: string
): AsyncGenerator<ChatEvent> {
  const session = await this.getSession(sessionId, userId);

  if (session.status !== 'ACTIVE') {
    throw new BadRequestError('Chat session is not active');
  }

  try {
    await this.saveMessage(sessionId, 'USER', { text: message });

    const client = await GeminiClientManager.getClient(
      userId,
      session.workspaceId
    );

    let fullResponse = '';
    let hasError = false;

    try {
      for await (const event of client.sendMessage(message)) {
        const chatEvent = this.convertToChatEvent(event);
        yield chatEvent;

        if (chatEvent.type === 'content' && chatEvent.content) {
          fullResponse += chatEvent.content;
        }

        if (chatEvent.type === 'error') {
          hasError = true;
        }
      }
    } catch (streamError) {
      logger.error('Stream error', { streamError, sessionId });
      yield {
        type: 'error',
        error: streamError instanceof Error
          ? streamError.message
          : 'Stream error occurred',
      };
      hasError = true;
    }

    // 只在成功时保存响应
    if (!hasError && fullResponse) {
      await this.saveMessage(sessionId, 'MODEL', { text: fullResponse });
      await this.updateSessionStats(sessionId);
    }

    yield { type: 'done' };
  } catch (error) {
    logger.error('Error in sendMessage', {
      error,
      sessionId,
      userId,
      message: error instanceof Error ? error.message : 'Unknown'
    });

    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**步骤 4.3: 实现重试机制** (2 小时)

创建 `packages/backend/src/utils/retry.ts`:

```typescript
import logger from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * 带重试的异步函数执行
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 检查是否应该重试
      if (attempt === opts.maxAttempts) {
        break;
      }

      if (opts.retryableErrors && !isRetryableError(error, opts.retryableErrors)) {
        throw error;
      }

      logger.warn('Operation failed, retrying', {
        attempt,
        maxAttempts: opts.maxAttempts,
        error: lastError.message,
        nextRetryInMs: delay,
      });

      // 等待后重试
      await sleep(delay);

      // 指数退避
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError!;
}

function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorMessage = error.message || error.toString();
  return retryableErrors.some((msg) => errorMessage.includes(msg));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

在 `chat.service.ts` 中使用重试:

```typescript
import { withRetry } from '../utils/retry.js';

// 在 sendMessage 中
const client = await withRetry(
  () => GeminiClientManager.getClient(userId, session.workspaceId),
  {
    maxAttempts: 3,
    retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
  }
);
```

**步骤 4.4: 测试流式端点** (2 小时)

创建测试客户端 `scripts/test-stream.ts`:

```typescript
import fetch from 'node-fetch';

async function testStream() {
  const accessToken = process.env.ACCESS_TOKEN;
  const sessionId = process.env.SESSION_ID;

  if (!accessToken || !sessionId) {
    console.error('Please set ACCESS_TOKEN and SESSION_ID environment variables');
    process.exit(1);
  }

  const response = await fetch(
    `http://localhost:3000/api/chat/sessions/${sessionId}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: 'Write a short poem about coding',
      }),
    }
  );

  if (!response.ok) {
    console.error('Stream failed:', response.statusText);
    process.exit(1);
  }

  console.log('Stream started...\n');

  // 读取流
  const reader = response.body!;
  let buffer = '';

  reader.on('data', (chunk) => {
    buffer += chunk.toString();

    // 处理完整的事件
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));
        console.log('Event:', data.type);

        if (data.type === 'content') {
          process.stdout.write(data.content);
        } else if (data.type === 'done') {
          console.log('\n\nStream completed!');
        } else if (data.type === 'error') {
          console.error('\nError:', data.error);
        }
      }
    }
  });

  reader.on('end', () => {
    console.log('\nStream ended');
  });

  reader.on('error', (error) => {
    console.error('Stream error:', error);
  });
}

testStream();
```

运行测试:

```bash
ACCESS_TOKEN=your_token SESSION_ID=your_session_id pnpm tsx scripts/test-stream.ts
```

**验证清单 Day 4-5**:
- [ ] SSE 流式端点实现完成
- [ ] 错误处理完善
- [ ] 重试机制实现
- [ ] 流式测试通过
- [ ] 可以实时接收 AI 响应

---

由于文档长度限制，我会继续在下一部分完成阶段 2 的剩余内容，并创建其他阶段的详细计划。让我先提交这部分内容。

