# Gemini CLI API改造方案

## 1. 项目现状深度分析

### 1.1 项目架构概览

**项目类型**: Monorepo结构的Node.js CLI工具
- **根目录**: 包含构建脚本、配置文件和文档
- **packages/cli**: CLI界面层，基于React + Ink构建
- **packages/core**: 核心业务逻辑层，包含AI交互、工具系统等

### 1.2 当前技术栈分析

#### 核心依赖
```json
{
  "主要框架": {
    "CLI界面": "React + Ink (TUI框架)",
    "AI集成": "@google/genai",
    "工具系统": "MCP (Model Context Protocol)",
    "构建工具": "esbuild",
    "测试框架": "vitest",
    "类型系统": "TypeScript"
  },
  "现有HTTP能力": {
    "OAuth认证": "原生http模块",
    "API客户端": "gaxios",
    "代理服务": "原生http模块",
    "遥测系统": "OpenTelemetry"
  }
}
```

#### 现有HTTP基础设施
1. **OAuth认证服务器** (`packages/core/src/code_assist/oauth2.ts`)
   - 使用原生http模块创建临时服务器
   - 处理OAuth2回调流程
   - 端口自动分配机制

2. **API客户端** (`packages/core/src/code_assist/server.ts`)
   - 基于gaxios的HTTP客户端
   - 支持同步和流式API调用
   - 完整的错误处理和重试机制

3. **代理服务器** (`scripts/example-proxy.js`)
   - HTTPS代理功能
   - 域名白名单机制
   - 连接隧道建立

### 1.3 核心功能模块分析

#### AI交互层
- **ContentGenerator**: AI内容生成接口
- **GeminiChat**: 聊天会话管理
- **ToolScheduler**: 工具调用调度

#### 工具系统
- **ToolRegistry**: 工具注册和管理
- **基础工具集**: 文件操作、网络请求、Shell执行等
- **MCP集成**: 外部工具服务器连接

#### 服务层
- **FileDiscoveryService**: 文件发现服务
- **GitService**: Git操作服务
- **TelemetryService**: 遥测数据收集

## 2. API改造架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway Layer                        │
├─────────────────────────────────────────────────────────────┤
│  Express/Fastify Server  │  WebSocket Server  │  gRPC Server │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   API Service Layer                         │
├─────────────────────────────────────────────────────────────┤
│  Auth Service  │  Chat Service  │  Tool Service  │  File Service │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Core Business Layer                        │
├─────────────────────────────────────────────────────────────┤
│  GeminiChat  │  ToolRegistry  │  ContentGenerator  │  Services │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   External Integrations                     │
├─────────────────────────────────────────────────────────────┤
│  Gemini API  │  MCP Servers  │  File System  │  Git System │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 新增包结构设计

```
packages/
├── cli/                    # 现有CLI包
├── core/                   # 现有核心包
├── api/                    # 新增API包
│   ├── src/
│   │   ├── server/         # HTTP服务器
│   │   ├── routes/         # API路由
│   │   ├── middleware/     # 中间件
│   │   ├── controllers/    # 控制器
│   │   ├── services/       # API服务层
│   │   ├── types/          # API类型定义
│   │   └── utils/          # API工具函数
│   ├── package.json
│   └── tsconfig.json
├── shared/                 # 新增共享包
│   ├── src/
│   │   ├── types/          # 共享类型定义
│   │   ├── constants/      # 共享常量
│   │   └── utils/          # 共享工具函数
│   ├── package.json
│   └── tsconfig.json
└── client/                 # 新增客户端SDK包
    ├── src/
    │   ├── client.ts       # API客户端
    │   ├── types.ts        # 客户端类型
    │   └── utils.ts        # 客户端工具
    ├── package.json
    └── tsconfig.json
```

## 3. 详细实施计划

### 3.1 阶段一：基础设施搭建 (1-2周)

#### 3.1.1 新增依赖包
```json
{
  "api包依赖": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "express-validator": "^7.0.1",
    "compression": "^1.7.4",
    "morgan": "^1.10.0",
    "ws": "^8.14.2",
    "@grpc/grpc-js": "^1.9.14",
    "@grpc/proto-loader": "^0.7.10"
  },
  "开发依赖": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/compression": "^1.7.5",
    "@types/morgan": "^1.9.9",
    "@types/ws": "^8.5.10"
  }
}
```

#### 3.1.2 创建API服务器基础结构
```typescript
// packages/api/src/server/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

export function createApp() {
  const app = express();
  
  // 安全中间件
  app.use(helmet());
  app.use(cors());
  
  // 性能中间件
  app.use(compression());
  app.use(morgan('combined'));
  
  // 限流中间件
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100 // 限制每个IP 15分钟内最多100个请求
  });
  app.use(limiter);
  
  // 解析中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  return app;
}
```

### 3.2 阶段二：核心API服务开发 (2-3周)

#### 3.2.1 认证服务
```typescript
// packages/api/src/services/auth.service.ts
export class AuthService {
  async validateToken(token: string): Promise<boolean> {
    // 验证JWT token或API key
  }
  
  async generateToken(userId: string): Promise<string> {
    // 生成JWT token
  }
  
  async refreshToken(refreshToken: string): Promise<string> {
    // 刷新token
  }
}
```

#### 3.2.2 聊天服务
```typescript
// packages/api/src/services/chat.service.ts
export class ChatService {
  async createChat(userId: string, initialPrompt?: string): Promise<ChatSession> {
    // 创建新的聊天会话
  }
  
  async sendMessage(chatId: string, message: string): Promise<ChatResponse> {
    // 发送消息并获取AI响应
  }
  
  async getChatHistory(chatId: string): Promise<ChatMessage[]> {
    // 获取聊天历史
  }
  
  async deleteChat(chatId: string): Promise<void> {
    // 删除聊天会话
  }
}
```

#### 3.2.3 工具服务
```typescript
// packages/api/src/services/tool.service.ts
export class ToolService {
  async listTools(): Promise<Tool[]> {
    // 列出所有可用工具
  }
  
  async executeTool(toolName: string, params: any): Promise<ToolResult> {
    // 执行指定工具
  }
  
  async registerTool(tool: Tool): Promise<void> {
    // 注册新工具
  }
}
```

### 3.3 阶段三：API路由和控制器 (1-2周)

#### 3.3.1 RESTful API路由
```typescript
// packages/api/src/routes/chat.routes.ts
import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';

const router = Router();
const chatController = new ChatController();

// 聊天会话管理
router.post('/chats', chatController.createChat);
router.get('/chats/:id', chatController.getChat);
router.delete('/chats/:id', chatController.deleteChat);
router.get('/chats/:id/messages', chatController.getMessages);

// 消息发送
router.post('/chats/:id/messages', chatController.sendMessage);

// 流式响应
router.post('/chats/:id/stream', chatController.streamMessage);

export { router as chatRoutes };
```

#### 3.3.2 WebSocket支持
```typescript
// packages/api/src/websocket/chat.websocket.ts
import { WebSocketServer } from 'ws';

export class ChatWebSocket {
  constructor(wss: WebSocketServer) {
    wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }
  
  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    // 处理WebSocket连接
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });
  }
  
  private async handleMessage(ws: WebSocket, data: Buffer) {
    // 处理WebSocket消息
  }
}
```

### 3.4 阶段四：客户端SDK开发 (1-2周)

#### 3.4.1 TypeScript客户端
```typescript
// packages/client/src/client.ts
export class GeminiAPIClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string
  ) {}
  
  async createChat(initialPrompt?: string): Promise<ChatSession> {
    // 创建聊天会话
  }
  
  async sendMessage(chatId: string, message: string): Promise<ChatResponse> {
    // 发送消息
  }
  
  async streamMessage(chatId: string, message: string): Promise<AsyncGenerator<ChatResponse>> {
    // 流式发送消息
  }
  
  async listTools(): Promise<Tool[]> {
    // 获取工具列表
  }
  
  async executeTool(toolName: string, params: any): Promise<ToolResult> {
    // 执行工具
  }
}
```

#### 3.4.2 JavaScript客户端
```javascript
// packages/client/src/client.js
export class GeminiAPIClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }
  
  // 与TypeScript版本相同的API
}
```

### 3.5 阶段五：集成和测试 (1-2周)

#### 3.5.1 与现有CLI集成
```typescript
// packages/cli/src/api-integration.ts
export class APIIntegration {
  constructor(private apiClient: GeminiAPIClient) {}
  
  async startAPIServer(port: number = 3000): Promise<void> {
    // 启动API服务器
  }
  
  async connectToAPI(baseUrl: string): Promise<void> {
    // 连接到远程API服务器
  }
}
```

#### 3.5.2 测试套件
```typescript
// packages/api/src/tests/api.test.ts
describe('Gemini API', () => {
  test('should create chat session', async () => {
    // 测试创建聊天会话
  });
  
  test('should send message and get response', async () => {
    // 测试发送消息
  });
  
  test('should handle streaming responses', async () => {
    // 测试流式响应
  });
});
```

## 4. API接口设计规范

### 4.1 RESTful API设计

#### 4.1.1 聊天API
```
POST   /api/v1/chats                    # 创建聊天会话
GET    /api/v1/chats/:id                # 获取聊天会话
DELETE /api/v1/chats/:id                # 删除聊天会话
GET    /api/v1/chats/:id/messages       # 获取聊天消息
POST   /api/v1/chats/:id/messages       # 发送消息
POST   /api/v1/chats/:id/stream         # 流式发送消息
```

#### 4.1.2 工具API
```
GET    /api/v1/tools                    # 获取工具列表
POST   /api/v1/tools/:name/execute      # 执行工具
POST   /api/v1/tools                    # 注册新工具
DELETE /api/v1/tools/:name              # 删除工具
```

#### 4.1.3 文件API
```
GET    /api/v1/files                    # 获取文件列表
GET    /api/v1/files/:path              # 读取文件
POST   /api/v1/files/:path              # 写入文件
DELETE /api/v1/files/:path              # 删除文件
```

#### 4.1.4 认证API
```
POST   /api/v1/auth/login               # 用户登录
POST   /api/v1/auth/logout              # 用户登出
POST   /api/v1/auth/refresh             # 刷新token
GET    /api/v1/auth/profile             # 获取用户信息
```

### 4.2 WebSocket API设计

#### 4.2.1 事件类型
```typescript
interface WebSocketMessage {
  type: 'chat_message' | 'tool_execution' | 'file_operation' | 'error';
  data: any;
  timestamp: string;
  sessionId: string;
}
```

#### 4.2.2 实时功能
- 实时聊天消息推送
- 工具执行状态更新
- 文件操作进度通知
- 错误和警告推送

### 4.3 gRPC API设计

#### 4.3.1 服务定义
```protobuf
service GeminiService {
  rpc CreateChat(CreateChatRequest) returns (CreateChatResponse);
  rpc SendMessage(SendMessageRequest) returns (SendMessageResponse);
  rpc StreamMessage(StreamMessageRequest) returns (stream StreamMessageResponse);
  rpc ExecuteTool(ExecuteToolRequest) returns (ExecuteToolResponse);
  rpc ListTools(ListToolsRequest) returns (ListToolsResponse);
}
```

## 5. 部署和运维方案

### 5.1 容器化部署
```dockerfile
# packages/api/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### 5.2 环境配置
```typescript
// packages/api/src/config/environment.ts
export interface EnvironmentConfig {
  port: number;
  host: string;
  corsOrigin: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  jwtSecret: string;
  geminiApiKey: string;
  logLevel: string;
}
```

### 5.3 监控和日志
```typescript
// packages/api/src/monitoring/logger.ts
export class APILogger {
  logRequest(req: Request, res: Response, duration: number): void {
    // 记录API请求日志
  }
  
  logError(error: Error, req: Request): void {
    // 记录错误日志
  }
  
  logPerformance(operation: string, duration: number): void {
    // 记录性能指标
  }
}
```

## 6. 迁移策略

### 6.1 渐进式迁移
1. **保持CLI功能不变**: 现有CLI继续正常工作
2. **并行开发API**: 在现有代码基础上添加API层
3. **逐步切换**: 通过配置选择使用CLI或API模式
4. **完全迁移**: 最终统一到API架构

### 6.2 兼容性保证
```typescript
// packages/core/src/compatibility.ts
export class CompatibilityLayer {
  static isAPIMode(): boolean {
    return process.env.GEMINI_API_MODE === 'true';
  }
  
  static getContentGenerator(): ContentGenerator {
    if (this.isAPIMode()) {
      return new APIContentGenerator();
    } else {
      return new LocalContentGenerator();
    }
  }
}
```

## 7. 风险评估和缓解措施

### 7.1 技术风险
| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 性能下降 | 高 | 实施缓存、连接池、负载均衡 |
| 安全漏洞 | 高 | 实施认证、授权、输入验证 |
| 兼容性问题 | 中 | 渐进式迁移、向后兼容 |
| 依赖冲突 | 中 | 版本锁定、依赖隔离 |

### 7.2 业务风险
| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 开发延期 | 中 | 分阶段实施、MVP优先 |
| 用户接受度 | 中 | 用户调研、文档完善 |
| 维护成本增加 | 低 | 自动化测试、监控 |

## 8. 成功指标

### 8.1 技术指标
- API响应时间 < 200ms
- 并发用户数 > 1000
- 系统可用性 > 99.9%
- 错误率 < 0.1%

### 8.2 业务指标
- API调用量增长 > 50%
- 新用户注册增长 > 30%
- 用户满意度 > 4.5/5
- 开发效率提升 > 40%

## 9. 总结

通过以上改造方案，Gemini CLI将从单一的CLI工具转变为具有完整API能力的平台，既保持了原有的CLI功能，又为第三方集成和扩展提供了强大的API接口。改造过程采用渐进式策略，确保平滑过渡和向后兼容。

**预期收益**:
1. **扩展性提升**: 支持多种客户端和集成方式
2. **开发效率**: 提供标准化API，降低集成成本
3. **用户体验**: 支持Web界面、移动端等多种交互方式
4. **生态系统**: 吸引更多开发者构建基于Gemini的应用

**实施时间**: 总计6-8周，分5个阶段进行
**资源需求**: 2-3名全栈开发者，1名DevOps工程师
**预算估算**: 人力成本 + 基础设施成本 