# Gemini CLI BS 架构改造详细开发计划

## 📋 项目概述

**项目名称**: Gemini Web Platform (基于 Gemini CLI)
**项目目标**: 将 Gemini CLI 的核心能力迁移到 Browser-Server (BS) 架构，提供 Web 化的 AI 代理服务
**开发周期**: 12-16 周
**团队规模建议**: 3-5 人（1 架构师 + 2 后端 + 1 前端 + 1 DevOps）

---

## 🎯 核心目标

1. **复用现有核心逻辑** - 最大化利用 `packages/core` 的代码（目标复用率 70%+）
2. **保持功能完整性** - 实现 CLI 版本的核心功能（对话、工具执行、钩子系统等）
3. **提升安全性** - 多用户隔离、沙箱执行、权限控制
4. **优化用户体验** - Web 化界面、实时交互、协作功能
5. **支持扩展性** - 插件系统、MCP 集成、自定义工具

---

## 🏗️ 技术架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    前端层 (Frontend)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React 18 + TypeScript                                 │ │
│  │  ├─ UI Components (shadcn/ui + Tailwind CSS)          │ │
│  │  ├─ State Management (Zustand)                        │ │
│  │  ├─ Data Fetching (TanStack Query)                    │ │
│  │  ├─ Real-time Communication (Socket.io Client)        │ │
│  │  ├─ Code Editor (Monaco Editor)                       │ │
│  │  └─ Markdown Renderer (react-markdown)                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS/WSS
┌─────────────────────────┼───────────────────────────────────┐
│                   API Gateway (Nginx)                        │
│              ├─ Load Balancing                              │
│              ├─ Rate Limiting                               │
│              └─ SSL Termination                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│              应用层 (Backend - Node.js)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Express/Fastify + TypeScript                          │ │
│  │  ├─ REST API Endpoints                                 │ │
│  │  ├─ WebSocket Server (Socket.io)                       │ │
│  │  ├─ Authentication & Authorization (JWT + OAuth)       │ │
│  │  └─ Session Management                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  核心业务逻辑层 (复用 packages/core)                    │ │
│  │  ├─ GeminiClient - Gemini API 交互                     │ │
│  │  ├─ GeminiChat - 对话管理                              │ │
│  │  ├─ CoreToolScheduler - 工具调度                       │ │
│  │  ├─ HookSystem - 钩子系统                              │ │
│  │  ├─ PolicyEngine - 策略引擎                            │ │
│  │  ├─ ChatRecordingService - 会话记录                    │ │
│  │  ├─ LoopDetectionService - 循环检测                    │ │
│  │  └─ ModelConfigService - 模型配置                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  工具适配层 (Tool Adapters)                            │ │
│  │  ├─ FileSystemAdapter - 虚拟文件系统                   │ │
│  │  ├─ ShellAdapter - 沙箱命令执行                        │ │
│  │  ├─ WebToolsAdapter - Web 工具代理                     │ │
│  │  └─ MCPAdapter - MCP 协议适配                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  工作区管理层 (Workspace Management)                   │ │
│  │  ├─ WorkspaceService - 工作区 CRUD                     │ │
│  │  ├─ ContainerService - Docker 容器管理                 │ │
│  │  ├─ FileStorageService - 文件存储                      │ │
│  │  └─ PermissionService - 权限控制                       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                   数据层 (Data Layer)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ PostgreSQL   │  │    Redis     │  │  MinIO/S3        │   │
│  │              │  │              │  │                  │   │
│  │ - Users      │  │ - Sessions   │  │ - Workspaces     │   │
│  │ - Workspaces │  │ - Cache      │  │ - User Files     │   │
│  │ - ChatHistory│  │ - Job Queue  │  │ - Attachments    │   │
│  │ - Configs    │  │ - Real-time  │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│               沙箱执行层 (Sandbox Layer)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Docker 容器池                                          │ │
│  │  ├─ User Container 1 (Ubuntu + Node + Tools)          │ │
│  │  ├─ User Container 2 (Ubuntu + Node + Tools)          │ │
│  │  └─ User Container N (按需创建/销毁)                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 项目结构设计

```
gemini-web-platform/
├── packages/
│   ├── core/                          # 复用原项目 (符号链接或 git submodule)
│   │   └── [保持原有结构]
│   │
│   ├── backend/                       # 新增：后端服务
│   │   ├── src/
│   │   │   ├── api/                   # REST API 路由
│   │   │   │   ├── auth/              # 认证相关
│   │   │   │   ├── chat/              # 对话接口
│   │   │   │   ├── workspace/         # 工作区管理
│   │   │   │   ├── tools/             # 工具执行
│   │   │   │   └── admin/             # 管理接口
│   │   │   ├── adapters/              # 工具适配器
│   │   │   │   ├── FileSystemAdapter.ts
│   │   │   │   ├── ShellAdapter.ts
│   │   │   │   ├── WebToolsAdapter.ts
│   │   │   │   └── MCPAdapter.ts
│   │   │   ├── services/              # 业务服务
│   │   │   │   ├── WorkspaceService.ts
│   │   │   │   ├── ContainerService.ts
│   │   │   │   ├── FileStorageService.ts
│   │   │   │   ├── SessionService.ts
│   │   │   │   └── PermissionService.ts
│   │   │   ├── websocket/             # WebSocket 服务
│   │   │   │   ├── ChatWebSocket.ts
│   │   │   │   └── ToolExecutionWebSocket.ts
│   │   │   ├── database/              # 数据库层
│   │   │   │   ├── models/            # ORM 模型
│   │   │   │   ├── migrations/        # 数据库迁移
│   │   │   │   └── seeds/             # 种子数据
│   │   │   ├── middleware/            # 中间件
│   │   │   │   ├── auth.ts
│   │   │   │   ├── rateLimit.ts
│   │   │   │   └── errorHandler.ts
│   │   │   ├── config/                # 配置
│   │   │   │   ├── database.ts
│   │   │   │   ├── redis.ts
│   │   │   │   └── docker.ts
│   │   │   ├── utils/                 # 工具函数
│   │   │   └── server.ts              # 入口文件
│   │   ├── tests/                     # 测试
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/                      # 新增：前端应用
│   │   ├── src/
│   │   │   ├── components/            # React 组件
│   │   │   │   ├── chat/              # 聊天界面
│   │   │   │   │   ├── ChatContainer.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageInput.tsx
│   │   │   │   │   └── MessageItem.tsx
│   │   │   │   ├── workspace/         # 工作区组件
│   │   │   │   │   ├── FileExplorer.tsx
│   │   │   │   │   ├── CodeEditor.tsx
│   │   │   │   │   └── Terminal.tsx
│   │   │   │   ├── tools/             # 工具展示
│   │   │   │   │   ├── ToolExecutionPanel.tsx
│   │   │   │   │   └── ToolApprovalDialog.tsx
│   │   │   │   ├── settings/          # 设置页面
│   │   │   │   └── common/            # 通用组件
│   │   │   ├── hooks/                 # React Hooks
│   │   │   │   ├── useChat.ts
│   │   │   │   ├── useWebSocket.ts
│   │   │   │   ├── useWorkspace.ts
│   │   │   │   └── useToolExecution.ts
│   │   │   ├── stores/                # 状态管理 (Zustand)
│   │   │   │   ├── chatStore.ts
│   │   │   │   ├── workspaceStore.ts
│   │   │   │   └── userStore.ts
│   │   │   ├── services/              # API 服务
│   │   │   │   ├── api.ts
│   │   │   │   ├── websocket.ts
│   │   │   │   └── auth.ts
│   │   │   ├── pages/                 # 页面
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Chat.tsx
│   │   │   │   ├── Workspace.tsx
│   │   │   │   ├── Settings.tsx
│   │   │   │   └── Login.tsx
│   │   │   ├── utils/                 # 工具函数
│   │   │   ├── App.tsx                # 根组件
│   │   │   └── main.tsx               # 入口
│   │   ├── public/
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   └── shared/                        # 新增：共享类型和工具
│       ├── src/
│       │   ├── types/                 # TypeScript 类型定义
│       │   │   ├── api.ts
│       │   │   ├── websocket.ts
│       │   │   ├── workspace.ts
│       │   │   └── user.ts
│       │   └── utils/                 # 共享工具函数
│       └── package.json
│
├── infrastructure/                     # 基础设施配置
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.frontend
│   │   ├── Dockerfile.sandbox         # 用户沙箱镜像
│   │   └── docker-compose.yml
│   ├── kubernetes/                    # K8s 部署配置 (可选)
│   │   ├── backend-deployment.yaml
│   │   ├── frontend-deployment.yaml
│   │   └── ingress.yaml
│   └── nginx/
│       └── nginx.conf
│
├── scripts/                           # 脚本工具
│   ├── setup-dev.sh                   # 开发环境设置
│   ├── build-all.sh                   # 构建所有包
│   └── migrate-db.sh                  # 数据库迁移
│
├── docs/                              # 文档
│   ├── API.md                         # API 文档
│   ├── DEPLOYMENT.md                  # 部署文档
│   └── DEVELOPMENT.md                 # 开发文档
│
├── package.json                       # 根 package.json
├── pnpm-workspace.yaml                # pnpm 工作区配置
├── .env.example                       # 环境变量示例
└── README.md
```

---

## 📅 详细开发计划

### **阶段 0: 准备阶段 (1 周)**

#### 目标
- 环境搭建
- 技术栈验证
- 团队培训

#### 任务清单

**0.1 项目初始化** (2 天)
- [ ] 创建 Git 仓库
- [ ] 设置 monorepo 结构 (pnpm workspaces)
- [ ] 配置 TypeScript、ESLint、Prettier
- [ ] 设置 CI/CD 基础 (GitHub Actions)
- [ ] 准备开发环境文档

**0.2 技术验证** (2 天)
- [ ] 验证 `packages/core` 在 Node.js 服务器环境下的运行
- [ ] 测试 Gemini API 调用
- [ ] 验证 Docker 容器隔离方案
- [ ] 测试 WebSocket 实时通信
- [ ] 验证文件存储方案 (MinIO/S3)

**0.3 基础设施搭建** (2 天)
- [ ] 搭建本地开发环境 Docker Compose
  - PostgreSQL
  - Redis
  - MinIO
- [ ] 创建沙箱基础镜像
- [ ] 配置开发数据库
- [ ] 设置日志系统

**0.4 团队准备** (1 天)
- [ ] 代码规范培训
- [ ] Git 工作流培训
- [ ] 架构设计评审

**交付物**:
- ✅ 可运行的开发环境
- ✅ 技术验证报告
- ✅ 开发环境文档

---

### **阶段 1: 核心基础设施 (2 周)**

#### 目标
- 搭建后端基础框架
- 实现认证授权系统
- 建立数据库模型

#### 任务清单

**1.1 后端框架搭建** (3 天)
- [ ] 初始化 Express/Fastify 项目
- [ ] 配置路由系统
- [ ] 设置中间件 (body-parser, cors, helmet)
- [ ] 配置日志系统 (winston/pino)
- [ ] 实现错误处理中间件
- [ ] 设置环境变量管理

**1.2 数据库设计与实现** (4 天)
- [ ] 设计数据库 Schema
  ```sql
  -- 用户表
  CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 工作区表
  CREATE TABLE workspaces (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    container_id VARCHAR(255),
    storage_path VARCHAR(500),
    status VARCHAR(50), -- active, suspended, deleted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 会话表
  CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(id),
    user_id UUID REFERENCES users(id),
    title VARCHAR(255),
    model VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 消息表
  CREATE TABLE messages (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id),
    role VARCHAR(50), -- user, model, tool
    content JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- 工具执行记录表
  CREATE TABLE tool_executions (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id),
    tool_name VARCHAR(100),
    params JSONB,
    result JSONB,
    status VARCHAR(50), -- pending, executing, success, error
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] 使用 Prisma/TypeORM 实现 ORM 模型
- [ ] 编写数据库迁移脚本
- [ ] 实现基础 CRUD 服务

**1.3 认证授权系统** (4 天)
- [ ] 实现 JWT Token 生成和验证
- [ ] 实现用户注册/登录 API
  - Email + Password
  - Google OAuth
- [ ] 实现 Refresh Token 机制
- [ ] 实现权限中间件
- [ ] 集成 Gemini API Key 管理
- [ ] 实现 Session 管理 (Redis)

**1.4 基础 API 实现** (3 天)
- [ ] 用户管理 API
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `GET /api/auth/me`
  - `PUT /api/auth/profile`
- [ ] 健康检查 API
  - `GET /api/health`
  - `GET /api/health/db`
  - `GET /api/health/redis`

**1.5 单元测试** (2 天)
- [ ] 认证中间件测试
- [ ] 数据库模型测试
- [ ] API 端点测试
- [ ] 达到 80% 代码覆盖率

**交付物**:
- ✅ 可运行的后端服务
- ✅ 完整的认证系统
- ✅ 数据库 Schema 和迁移脚本
- ✅ API 文档 (Swagger)
- ✅ 单元测试报告

---

### **阶段 2: Core 包集成 (3 周)**

#### 目标
- 集成 `packages/core` 到后端
- 实现基础对话功能
- 适配工具执行层

#### 任务清单

**2.1 Core 包分析与准备** (2 天)
- [ ] 深入分析 `packages/core` 的依赖
- [ ] 识别需要替换的 CLI 特定代码
- [ ] 设计适配器接口
- [ ] 创建集成测试计划

**2.2 Gemini API 集成** (3 天)
- [ ] 复用 `GeminiClient` 到后端
- [ ] 实现 API Key 配置管理
- [ ] 实现多用户 Gemini Client 实例管理
- [ ] 测试流式响应
- [ ] 实现错误处理和重试机制

**2.3 对话管理服务** (4 天)
- [ ] 集成 `GeminiChat` 类
- [ ] 实现 ChatService
  ```typescript
  class ChatService {
    async createSession(userId: string, workspaceId: string): Promise<ChatSession>
    async sendMessage(sessionId: string, message: string): AsyncGenerator<ChatEvent>
    async getSessionHistory(sessionId: string): Promise<Message[]>
    async deleteSession(sessionId: string): Promise<void>
  }
  ```
- [ ] 实现会话持久化 (数据库 + Redis)
- [ ] 集成 `ChatRecordingService`
- [ ] 实现会话检查点功能

**2.4 工具系统适配** (6 天)

**2.4.1 文件系统工具适配** (2 天)
- [ ] 设计虚拟文件系统架构
  ```typescript
  interface FileSystemAdapter {
    readFile(workspaceId: string, path: string): Promise<string>
    writeFile(workspaceId: string, path: string, content: string): Promise<void>
    editFile(workspaceId: string, path: string, edits: Edit[]): Promise<void>
    listFiles(workspaceId: string, pattern: string): Promise<string[]>
  }
  ```
- [ ] 实现 ReadFileTool 适配器
- [ ] 实现 WriteFileTool 适配器
- [ ] 实现 EditTool 适配器
- [ ] 实现 GlobTool 适配器
- [ ] 实现 LSTools 适配器

**2.4.2 Shell 工具适配** (2 天)
- [ ] 设计沙箱执行架构
  ```typescript
  interface ShellAdapter {
    execute(workspaceId: string, command: string): AsyncGenerator<ShellOutput>
    kill(workspaceId: string, processId: string): Promise<void>
  }
  ```
- [ ] 实现容器内命令执行
- [ ] 实现命令白名单验证
- [ ] 实现实时输出流
- [ ] 实现超时和资源限制

**2.4.3 Web 工具适配** (1 天)
- [ ] 实现 WebFetchTool 代理
- [ ] 实现 WebSearchTool 适配
- [ ] 实现请求限流

**2.4.4 其他工具** (1 天)
- [ ] 实现 GrepTool 适配器
- [ ] 实现 MemoryTool 适配器
- [ ] 实现 WriteTodosTool 适配器

**2.5 CoreToolScheduler 集成** (3 天)
- [ ] 复用 CoreToolScheduler
- [ ] 实现工具确认机制（Web 版）
- [ ] 实现工具执行状态推送 (WebSocket)
- [ ] 实现并发控制
- [ ] 集成 PolicyEngine

**2.6 集成测试** (3 天)
- [ ] 端到端对话测试
- [ ] 各工具执行测试
- [ ] 并发用户测试
- [ ] 性能基准测试

**交付物**:
- ✅ 完整的对话管理服务
- ✅ 工具适配器实现
- ✅ 集成测试报告
- ✅ 性能测试报告

---

### **阶段 3: 工作区与沙箱系统 (2 周)**

#### 目标
- 实现用户工作区管理
- 实现 Docker 沙箱隔离
- 实现文件存储服务

#### 任务清单

**3.1 工作区服务** (3 天)
- [ ] 实现 WorkspaceService
  ```typescript
  class WorkspaceService {
    async create(userId: string, config: WorkspaceConfig): Promise<Workspace>
    async get(workspaceId: string): Promise<Workspace>
    async list(userId: string): Promise<Workspace[]>
    async delete(workspaceId: string): Promise<void>
    async start(workspaceId: string): Promise<void>
    async stop(workspaceId: string): Promise<void>
  }
  ```
- [ ] 实现工作区 CRUD API
  - `POST /api/workspaces`
  - `GET /api/workspaces`
  - `GET /api/workspaces/:id`
  - `PUT /api/workspaces/:id`
  - `DELETE /api/workspaces/:id`
  - `POST /api/workspaces/:id/start`
  - `POST /api/workspaces/:id/stop`

**3.2 Docker 容器管理** (5 天)
- [ ] 设计沙箱镜像
  ```dockerfile
  FROM ubuntu:22.04
  RUN apt-get update && apt-get install -y \
      nodejs \
      npm \
      git \
      python3 \
      pip
  # 安全加固
  RUN useradd -m -s /bin/bash sandbox
  WORKDIR /workspace
  USER sandbox
  ```
- [ ] 实现 ContainerService
  ```typescript
  class ContainerService {
    async createContainer(workspaceId: string): Promise<Container>
    async startContainer(containerId: string): Promise<void>
    async stopContainer(containerId: string): Promise<void>
    async removeContainer(containerId: string): Promise<void>
    async executeCommand(containerId: string, command: string): AsyncGenerator<Output>
    async getContainerStats(containerId: string): Promise<Stats>
  }
  ```
- [ ] 实现容器池管理（预热、复用）
- [ ] 实现资源限制（CPU、内存、网络）
- [ ] 实现容器健康检查
- [ ] 实现自动清理机制

**3.3 文件存储服务** (3 天)
- [ ] 实现 FileStorageService (MinIO/S3)
  ```typescript
  class FileStorageService {
    async uploadFile(workspaceId: string, path: string, content: Buffer): Promise<void>
    async downloadFile(workspaceId: string, path: string): Promise<Buffer>
    async listFiles(workspaceId: string, prefix: string): Promise<FileInfo[]>
    async deleteFile(workspaceId: string, path: string): Promise<void>
    async syncToContainer(workspaceId: string, containerId: string): Promise<void>
    async syncFromContainer(containerId: string, workspaceId: string): Promise<void>
  }
  ```
- [ ] 实现文件上传/下载 API
  - `POST /api/workspaces/:id/files`
  - `GET /api/workspaces/:id/files/*`
  - `DELETE /api/workspaces/:id/files/*`
- [ ] 实现容器与存储同步机制
- [ ] 实现文件版本控制（可选）

**3.4 安全与权限** (3 天)
- [ ] 实现工作区访问控制
- [ ] 实现命令白名单管理
- [ ] 实现网络隔离策略
- [ ] 实现敏感文件保护
- [ ] 安全审计日志

**3.5 测试** (2 天)
- [ ] 容器隔离测试
- [ ] 资源限制测试
- [ ] 文件同步测试
- [ ] 安全性测试

**交付物**:
- ✅ 完整的工作区管理系统
- ✅ Docker 沙箱执行环境
- ✅ 文件存储服务
- ✅ 安全测试报告

---

### **阶段 4: 前端开发 (3 周)**

#### 目标
- 搭建前端应用框架
- 实现核心 UI 组件
- 实现实时通信

#### 任务清单

**4.1 项目初始化** (2 天)
- [ ] 初始化 Vite + React 项目
- [ ] 配置 TypeScript
- [ ] 配置 Tailwind CSS + shadcn/ui
- [ ] 配置路由 (React Router)
- [ ] 配置状态管理 (Zustand)
- [ ] 配置 API 客户端 (Axios + TanStack Query)

**4.2 认证与路由** (2 天)
- [ ] 实现登录页面
- [ ] 实现注册页面
- [ ] 实现 OAuth 登录流程
- [ ] 实现受保护路由
- [ ] 实现 Token 管理
- [ ] 实现自动刷新机制

**4.3 布局与导航** (2 天)
- [ ] 实现主布局组件
  - 顶部导航栏
  - 侧边栏
  - 内容区
- [ ] 实现响应式设计
- [ ] 实现主题切换（亮/暗模式）
- [ ] 实现面包屑导航

**4.4 聊天界面** (5 天)
- [ ] 实现 ChatContainer 组件
  ```tsx
  <ChatContainer>
    <ChatHeader />
    <MessageList>
      <MessageItem role="user" />
      <MessageItem role="model" />
      <ToolExecutionDisplay />
    </MessageList>
    <MessageInput />
  </ChatContainer>
  ```
- [ ] 实现消息渲染
  - Markdown 渲染
  - 代码高亮
  - 思维链展示
  - 工具调用展示
- [ ] 实现流式消息接收
- [ ] 实现消息历史加载（无限滚动）
- [ ] 实现消息搜索
- [ ] 实现代码复制功能
- [ ] 实现会话列表侧边栏

**4.5 工作区界面** (4 天)
- [ ] 实现文件浏览器组件
  - 树形结构
  - 文件上传/下载
  - 右键菜单
- [ ] 集成 Monaco Editor
  - 语法高亮
  - 自动保存
  - Diff 视图
- [ ] 实现终端组件（集成 xterm.js）
- [ ] 实现工作区设置面板

**4.6 工具执行界面** (3 天)
- [ ] 实现工具执行面板
  - 实时输出显示
  - 执行状态指示
  - 错误展示
- [ ] 实现工具确认对话框
  - Shell 命令预览
  - 文件修改 Diff 预览
  - 批量确认
- [ ] 实现工具历史记录

**4.7 WebSocket 集成** (3 days)
- [ ] 实现 WebSocket 客户端
  ```typescript
  class ChatWebSocketClient {
    connect(sessionId: string): void
    sendMessage(message: string): void
    onMessage(handler: (event: ChatEvent) => void): void
    onToolExecution(handler: (event: ToolEvent) => void): void
    disconnect(): void
  }
  ```
- [ ] 实现自动重连机制
- [ ] 实现连接状态指示
- [ ] 实现离线消息队列

**4.8 设置与配置** (2 days)
- [ ] 实现用户设置页面
  - 个人信息
  - API Key 管理
  - 偏好设置
- [ ] 实现工作区配置
  - 环境变量
  - 工具策略
  - 钩子管理

**交付物**:
- ✅ 完整的前端应用
- ✅ 响应式 UI
- ✅ 实时通信功能
- ✅ 用户体验测试报告

---

### **阶段 5: WebSocket 与实时功能 (1 周)**

#### 目标
- 实现完整的 WebSocket 通信
- 实现实时状态同步
- 优化性能

#### 任务清单

**5.1 WebSocket 服务端** (3 天)
- [ ] 实现 Socket.io 服务器
  ```typescript
  io.on('connection', (socket) => {
    socket.on('chat:message', handleChatMessage)
    socket.on('tool:approve', handleToolApproval)
    socket.on('tool:reject', handleToolRejection)
    socket.on('workspace:sync', handleWorkspaceSync)
  })
  ```
- [ ] 实现 Room 管理（按 session 隔离）
- [ ] 实现身份验证中间件
- [ ] 实现心跳检测
- [ ] 实现错误处理

**5.2 实时事件推送** (2 天)
- [ ] 实现聊天消息推送
- [ ] 实现工具执行状态推送
- [ ] 实现文件变更通知
- [ ] 实现系统通知

**5.3 性能优化** (2 天)
- [ ] 实现消息批量处理
- [ ] 实现 Redis Pub/Sub（多实例支持）
- [ ] 实现连接池管理
- [ ] 压力测试与优化

**交付物**:
- ✅ 稳定的 WebSocket 服务
- ✅ 实时同步功能
- ✅ 性能测试报告

---

### **阶段 6: 高级功能 (2 周)**

#### 目标
- 实现钩子系统 Web UI
- 实现 MCP 集成
- 实现策略引擎

#### 任务清单

**6.1 钩子系统** (4 天)
- [ ] 复用 `HookSystem` 到后端
- [ ] 实现钩子管理 API
  - `GET /api/hooks`
  - `POST /api/hooks`
  - `PUT /api/hooks/:id`
  - `DELETE /api/hooks/:id`
- [ ] 实现钩子编辑器 UI
  - 代码编辑（Monaco）
  - 钩子类型选择
  - 测试功能
- [ ] 实现钩子执行日志

**6.2 策略引擎** (3 天)
- [ ] 复用 `PolicyEngine`
- [ ] 实现策略配置 UI
  - TOML 编辑器
  - 策略模板
  - 验证功能
- [ ] 实现策略管理 API
  - `GET /api/policies`
  - `POST /api/policies`
  - `PUT /api/policies/:id`

**6.3 MCP 集成** (4 天)
- [ ] 复用 MCP 客户端
- [ ] 实现 MCP 服务器管理 UI
  - 服务器列表
  - 添加/删除服务器
  - OAuth 配置
- [ ] 实现 MCP 工具发现
- [ ] 实现 MCP 资源管理

**6.4 会话管理增强** (3 天)
- [ ] 实现会话分享功能
- [ ] 实现会话导出（JSON/Markdown）
- [ ] 实现会话检查点恢复
- [ ] 实现会话模板

**交付物**:
- ✅ 钩子系统 Web UI
- ✅ 策略引擎集成
- ✅ MCP 服务器管理
- ✅ 会话管理增强

---

### **阶段 7: 测试与优化 (2 周)**

#### 目标
- 完善测试覆盖
- 性能优化
- 安全加固

#### 任务清单

**7.1 测试完善** (5 天)
- [ ] 单元测试（目标 80% 覆盖率）
  - 后端服务
  - 前端组件
  - 工具适配器
- [ ] 集成测试
  - API 端点
  - WebSocket 通信
  - 工具执行流程
- [ ] E2E 测试（Playwright/Cypress）
  - 用户登录流程
  - 创建工作区
  - 对话交互
  - 工具执行
- [ ] 性能测试
  - 并发用户测试
  - 长时间运行稳定性
  - 资源使用监控

**7.2 性能优化** (4 天)
- [ ] 数据库查询优化
  - 添加索引
  - 查询优化
  - 连接池配置
- [ ] 缓存策略
  - Redis 缓存热数据
  - API 响应缓存
  - 静态资源 CDN
- [ ] 前端优化
  - 代码分割
  - 懒加载
  - 图片优化
  - Bundle 大小优化
- [ ] 后端优化
  - 异步处理
  - 队列系统（BullMQ）
  - 数据库连接池

**7.3 安全加固** (4 天)
- [ ] 安全审计
  - SQL 注入防护
  - XSS 防护
  - CSRF 防护
  - 命令注入防护
- [ ] 权限控制加强
  - RBAC 实现
  - 资源访问控制
  - API 速率限制
- [ ] 数据加密
  - 敏感数据加密
  - 传输加密（HTTPS）
  - Token 安全
- [ ] 安全测试
  - 渗透测试
  - 依赖漏洞扫描

**7.4 监控与日志** (2 天)
- [ ] 实现应用监控（Prometheus + Grafana）
- [ ] 实现错误追踪（Sentry）
- [ ] 实现审计日志
- [ ] 实现性能指标收集

**交付物**:
- ✅ 完整测试报告
- ✅ 性能优化报告
- ✅ 安全审计报告
- ✅ 监控仪表板

---

### **阶段 8: 部署与上线 (1 周)**

#### 目标
- 准备生产环境
- 部署应用
- 发布上线

#### 任务清单

**8.1 部署准备** (2 天)
- [ ] 编写部署文档
- [ ] 准备生产环境配置
- [ ] 设置 CI/CD 流水线
  - 自动测试
  - 自动构建
  - 自动部署
- [ ] 准备备份策略
- [ ] 准备回滚方案

**8.2 生产部署** (3 天)
- [ ] 部署数据库（PostgreSQL 主从）
- [ ] 部署 Redis 集群
- [ ] 部署对象存储（MinIO/S3）
- [ ] 部署后端服务（负载均衡）
- [ ] 部署前端（Nginx + CDN）
- [ ] 配置域名和 SSL
- [ ] 配置防火墙和安全组

**8.3 上线验证** (2 天)
- [ ] 冒烟测试
- [ ] 性能测试
- [ ] 安全测试
- [ ] 用户验收测试（UAT）
- [ ] 监控验证

**交付物**:
- ✅ 生产环境部署
- ✅ 部署文档
- ✅ 运维手册
- ✅ 上线报告

---

## 🔧 技术栈详细说明

### 后端技术栈

| 类别 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 运行时 | Node.js | 20+ | 与原项目一致 |
| 框架 | Express/Fastify | 4.x/4.x | Express 易用，Fastify 高性能 |
| 语言 | TypeScript | 5.3+ | 类型安全 |
| ORM | Prisma | 5.x | 现代化 ORM |
| 数据库 | PostgreSQL | 15+ | 关系型数据库 |
| 缓存 | Redis | 7+ | 缓存和会话存储 |
| 对象存储 | MinIO/S3 | latest | 文件存储 |
| 容器 | Docker | 20+ | 沙箱隔离 |
| WebSocket | Socket.io | 4.x | 实时通信 |
| 认证 | Passport.js + JWT | latest | 认证授权 |
| 队列 | BullMQ | 5.x | 后台任务 |
| 测试 | Vitest + Supertest | latest | 单元和集成测试 |
| 日志 | Winston/Pino | latest | 结构化日志 |
| 监控 | Prometheus + Grafana | latest | 监控指标 |

### 前端技术栈

| 类别 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 框架 | React | 18+ | UI 框架 |
| 语言 | TypeScript | 5.3+ | 类型安全 |
| 构建工具 | Vite | 5.x | 快速开发和构建 |
| 路由 | React Router | 6.x | 路由管理 |
| 状态管理 | Zustand | 4.x | 轻量级状态管理 |
| 数据获取 | TanStack Query | 5.x | 异步状态管理 |
| UI 组件 | shadcn/ui | latest | 高质量组件库 |
| 样式 | Tailwind CSS | 3.x | 实用优先的 CSS |
| 代码编辑器 | Monaco Editor | latest | VS Code 编辑器核心 |
| 终端 | xterm.js | 5.x | 终端模拟器 |
| Markdown | react-markdown | latest | Markdown 渲染 |
| WebSocket | Socket.io Client | 4.x | 实时通信 |
| 测试 | Vitest + Testing Library | latest | 组件测试 |
| E2E 测试 | Playwright | latest | 端到端测试 |

### 基础设施

| 类别 | 技术选型 | 说明 |
|------|---------|------|
| 容器编排 | Docker Compose / Kubernetes | 开发用 Compose，生产用 K8s |
| 反向代理 | Nginx | 负载均衡和静态文件服务 |
| CI/CD | GitHub Actions | 自动化测试和部署 |
| 日志 | ELK Stack (可选) | 日志聚合和分析 |
| 监控 | Prometheus + Grafana | 指标收集和可视化 |
| 错误追踪 | Sentry | 错误监控 |

---

## 💡 核心技术实现要点

### 1. 工具适配器实现

```typescript
// packages/backend/src/adapters/ShellAdapter.ts
import { ShellTool } from '@google/gemini-cli-core';
import { ContainerService } from '../services/ContainerService';

export class ShellAdapter {
  constructor(
    private containerService: ContainerService,
    private workspaceId: string
  ) {}

  async execute(command: string): AsyncGenerator<ShellOutput> {
    // 1. 获取工作区容器
    const container = await this.containerService.getContainer(this.workspaceId);

    // 2. 在容器中执行命令
    const stream = await this.containerService.exec(container.id, command);

    // 3. 流式返回输出
    for await (const chunk of stream) {
      yield {
        type: 'stdout',
        data: chunk
      };
    }
  }
}

// 注册适配器
toolRegistry.register(SHELL_TOOL_NAME, (params) => {
  const adapter = new ShellAdapter(containerService, workspaceId);
  return new ShellTool(config, params, adapter);
});
```

### 2. WebSocket 实时通信

```typescript
// packages/backend/src/websocket/ChatWebSocket.ts
import { Server as SocketIOServer } from 'socket.io';
import { ChatService } from '../services/ChatService';

export class ChatWebSocket {
  constructor(
    private io: SocketIOServer,
    private chatService: ChatService
  ) {
    this.setupHandlers();
  }

  private setupHandlers() {
    this.io.on('connection', async (socket) => {
      // 认证
      const user = await this.authenticate(socket);

      // 加入会话 room
      socket.on('chat:join', async (sessionId) => {
        await socket.join(`session:${sessionId}`);
      });

      // 处理消息
      socket.on('chat:message', async (data) => {
        const { sessionId, message } = data;

        // 调用 ChatService 流式生成
        for await (const event of this.chatService.sendMessage(sessionId, message)) {
          // 推送给房间内所有客户端
          this.io.to(`session:${sessionId}`).emit('chat:event', event);
        }
      });

      // 工具确认
      socket.on('tool:approve', async (data) => {
        await this.chatService.approveToolExecution(data.toolCallId);
      });
    });
  }
}
```

### 3. 容器管理

```typescript
// packages/backend/src/services/ContainerService.ts
import Docker from 'dockerode';

export class ContainerService {
  private docker = new Docker();
  private containerPool = new Map<string, Docker.Container>();

  async createContainer(workspaceId: string): Promise<Container> {
    const container = await this.docker.createContainer({
      Image: 'gemini-sandbox:latest',
      name: `workspace-${workspaceId}`,
      HostConfig: {
        Memory: 512 * 1024 * 1024, // 512MB
        NanoCpus: 1000000000, // 1 CPU
        NetworkMode: 'none', // 网络隔离
      },
      Env: [
        `WORKSPACE_ID=${workspaceId}`,
      ],
    });

    await container.start();
    this.containerPool.set(workspaceId, container);

    return {
      id: container.id,
      workspaceId,
      status: 'running',
    };
  }

  async exec(containerId: string, command: string): AsyncGenerator<string> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});

    for await (const chunk of stream) {
      yield chunk.toString();
    }
  }
}
```

### 4. 文件同步机制

```typescript
// packages/backend/src/services/FileStorageService.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export class FileStorageService {
  private s3: S3Client;

  async syncToContainer(workspaceId: string, containerId: string): Promise<void> {
    // 1. 从 S3 下载工作区文件
    const files = await this.listFiles(workspaceId);

    // 2. 复制到容器
    for (const file of files) {
      const content = await this.downloadFile(workspaceId, file.path);
      await this.containerService.writeFile(
        containerId,
        file.path,
        content
      );
    }
  }

  async syncFromContainer(containerId: string, workspaceId: string): Promise<void> {
    // 1. 从容器读取文件列表
    const files = await this.containerService.listFiles(containerId);

    // 2. 上传到 S3
    for (const file of files) {
      const content = await this.containerService.readFile(containerId, file.path);
      await this.uploadFile(workspaceId, file.path, content);
    }
  }
}
```

---

## 📊 工作量估算

| 阶段 | 工作量 (人日) | 关键角色 |
|------|--------------|---------|
| 阶段 0: 准备阶段 | 10 | 全员 |
| 阶段 1: 核心基础设施 | 28 | 后端 × 2 |
| 阶段 2: Core 包集成 | 42 | 后端 × 2 |
| 阶段 3: 工作区与沙箱 | 28 | 后端 × 2 + DevOps |
| 阶段 4: 前端开发 | 42 | 前端 × 2 |
| 阶段 5: WebSocket 实时功能 | 14 | 后端 + 前端 |
| 阶段 6: 高级功能 | 28 | 后端 + 前端 |
| 阶段 7: 测试与优化 | 28 | 全员 |
| 阶段 8: 部署与上线 | 14 | DevOps + 全员 |
| **总计** | **234 人日** | - |

**按 3 人团队计算**: 约 **78 个工作日** ≈ **16 周**

---

## 🎯 关键里程碑

| 里程碑 | 时间点 | 交付物 |
|--------|--------|--------|
| M1: MVP 后端 | Week 3 | 可运行的后端 + 认证系统 |
| M2: 基础对话功能 | Week 6 | 可用的对话 API + 工具执行 |
| M3: 完整工作区 | Week 8 | 沙箱隔离 + 文件管理 |
| M4: MVP 前端 | Week 11 | 可用的 Web 界面 |
| M5: 实时通信 | Week 12 | WebSocket 集成完成 |
| M6: 功能完整 | Week 14 | 所有核心功能就绪 |
| M7: 测试完成 | Week 16 | 通过所有测试 |
| M8: 生产部署 | Week 17 | 上线运行 |

---

## ⚠️ 风险管理

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Core 包集成困难 | 高 | 中 | 提前验证，预留缓冲时间 |
| 容器性能问题 | 中 | 中 | 性能测试，优化容器配置 |
| WebSocket 稳定性 | 中 | 低 | 充分测试，实现重连机制 |
| 安全漏洞 | 高 | 中 | 安全审计，渗透测试 |
| 文件同步延迟 | 低 | 中 | 优化同步策略，增量同步 |

### 进度风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 需求变更 | 高 | 中 | 敏捷开发，灵活调整 |
| 人员流动 | 高 | 低 | 文档完善，知识共享 |
| 第三方依赖问题 | 中 | 低 | 选择成熟技术栈 |
| 测试时间不足 | 中 | 中 | 并行开发和测试 |

---

## 📈 成功指标

### 功能指标
- ✅ 实现 CLI 版本 80% 以上的核心功能
- ✅ 支持所有主要工具（文件、Shell、Web、MCP）
- ✅ 钩子系统和策略引擎完整集成
- ✅ 多用户并发支持

### 性能指标
- ✅ 支持 100+ 并发用户
- ✅ API 响应时间 < 200ms (P95)
- ✅ WebSocket 消息延迟 < 100ms
- ✅ 容器启动时间 < 5s

### 质量指标
- ✅ 代码覆盖率 > 80%
- ✅ 无关键安全漏洞
- ✅ 系统可用性 > 99.5%
- ✅ 错误率 < 0.1%

---

## 📚 参考文档

### 必读
1. [Gemini CLI 原项目文档](https://github.com/google-gemini/gemini-cli)
2. [Gemini API 文档](https://ai.google.dev/docs)
3. [Docker 安全最佳实践](https://docs.docker.com/engine/security/)
4. [WebSocket 最佳实践](https://socket.io/docs/v4/)

### 推荐阅读
1. TypeScript 最佳实践
2. React 性能优化
3. PostgreSQL 优化指南
4. Redis 使用指南

---

## 🔄 后续演进计划

### V2.0 功能 (上线后 3-6 个月)
- [ ] 协作功能（多人共享工作区）
- [ ] 插件市场
- [ ] 自定义模型支持
- [ ] 高级分析和监控
- [ ] 移动端适配

### V3.0 功能 (上线后 6-12 个月)
- [ ] 企业版功能（SSO、审计、合规）
- [ ] AI 代理编排（多代理协作）
- [ ] 工作流自动化
- [ ] IDE 插件（VS Code、JetBrains）
- [ ] API 开放平台

---

## 📞 团队与支持

### 核心团队建议

| 角色 | 职责 | 人数 |
|------|------|------|
| 架构师 | 技术架构设计、技术选型 | 1 |
| 后端工程师 | 后端开发、Core 集成、工具适配 | 2 |
| 前端工程师 | 前端开发、UI/UX 实现 | 1 |
| DevOps 工程师 | 基础设施、容器管理、部署 | 1 |
| QA 工程师 (可选) | 测试、质量保证 | 0.5 |

### 技能要求

**必备技能**:
- TypeScript/Node.js 深度理解
- React 前端开发经验
- Docker 容器技术
- PostgreSQL/Redis 数据库
- WebSocket 实时通信

**加分技能**:
- Gemini API 使用经验
- LLM 应用开发经验
- 安全工程背景
- Kubernetes 运维经验

---

## ✅ 下一步行动

1. **立即行动** (本周内):
   - [ ] 组建开发团队
   - [ ] 确认技术选型
   - [ ] 创建项目仓库
   - [ ] 设置开发环境

2. **本月完成**:
   - [ ] 完成阶段 0 (准备阶段)
   - [ ] 启动阶段 1 (核心基础设施)
   - [ ] 完成技术验证

3. **三个月目标**:
   - [ ] 完成 MVP 版本
   - [ ] 内部测试
   - [ ] 收集反馈

---

**文档版本**: 1.0
**最后更新**: 2025-12-15
**维护者**: Gemini Web Platform Team

