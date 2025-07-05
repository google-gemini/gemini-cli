# Context7 集成落地设计方案

## 项目现状分析

### 当前项目架构
- **项目类型**: Gemini CLI - 基于 MCP 协议的 AI 代码助手
- **技术栈**: TypeScript + Node.js + MCP SDK
- **架构模式**: Monorepo 结构，包含 `packages/cli` 和 `packages/core`
- **MCP 支持**: 已具备完整的 MCP 客户端基础设施

### 现有 MCP 能力
- ✅ MCP 客户端连接管理 (`mcp-client.ts`)
- ✅ MCP 工具发现和注册 (`mcp-tool.ts`)
- ✅ 多传输协议支持 (stdio, HTTP, SSE)
- ✅ 工具状态监控和管理
- ✅ 错误处理和重连机制

## Context7 集成方案

### 1. 集成架构设计

#### 1.1 整体架构
```
Gemini CLI Core
├── MCP Client Manager
│   ├── Context7 Server Integration
│   ├── Document Index Service
│   └── Real-time Update Handler
├── Tool Registry
│   ├── Context7 Tools
│   │   ├── Document Search Tool
│   │   ├── Context Update Tool
│   │   └── Documentation Query Tool
│   └── Existing Tools
└── Content Generator
    └── Enhanced with Context7 Data
```

#### 1.2 Context7 服务配置
```typescript
// packages/core/src/config/context7-config.ts
export interface Context7Config {
  enabled: boolean;
  serverUrl?: string;
  apiKey?: string;
  updateInterval: number; // 文档更新间隔 (ms)
  cacheTimeout: number;   // 缓存超时时间 (ms)
  maxDocumentSize: number; // 最大文档大小 (bytes)
  supportedFormats: string[]; // 支持的文档格式
}

export const DEFAULT_CONTEXT7_CONFIG: Context7Config = {
  enabled: true,
  updateInterval: 300000, // 5分钟
  cacheTimeout: 3600000,  // 1小时
  maxDocumentSize: 10 * 1024 * 1024, // 10MB
  supportedFormats: ['md', 'txt', 'js', 'ts', 'py', 'java', 'cpp', 'h', 'json', 'yaml', 'yml']
};
```

### 2. 核心组件实现

#### 2.1 Context7 服务管理器
```typescript
// packages/core/src/services/context7-service.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Context7Config } from '../config/context7-config.js';

export class Context7Service {
  private client: Client | null = null;
  private config: Context7Config;
  private documentCache: Map<string, any> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(config: Context7Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) return;
    
    // 连接到 Context7 MCP 服务器
    await this.connectToContext7Server();
    
    // 启动文档更新定时器
    this.startUpdateTimer();
  }

  private async connectToContext7Server(): Promise<void> {
    // 实现 Context7 服务器连接逻辑
  }

  private startUpdateTimer(): void {
    this.updateTimer = setInterval(() => {
      this.updateDocuments();
    }, this.config.updateInterval);
  }

  async searchDocuments(query: string): Promise<any[]> {
    // 实现文档搜索逻辑
  }

  async getDocumentContext(documentId: string): Promise<any> {
    // 获取文档上下文
  }

  async updateDocuments(): Promise<void> {
    // 更新文档缓存
  }

  dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }
}
```

#### 2.2 Context7 工具实现
```typescript
// packages/core/src/tools/context7-tools.ts
import { CallableTool, FunctionDeclaration } from '@google/genai';
import { Context7Service } from '../services/context7-service.js';

export class Context7DocumentSearchTool implements CallableTool {
  private context7Service: Context7Service;

  constructor(context7Service: Context7Service) {
    this.context7Service = context7Service;
  }

  getFunctionDeclaration(): FunctionDeclaration {
    return {
      name: 'context7_search_documents',
      description: 'Search for relevant documents using Context7',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for documents'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 10
          }
        },
        required: ['query']
      }
    };
  }

  async call(args: { query: string; maxResults?: number }): Promise<any> {
    const results = await this.context7Service.searchDocuments(args.query);
    return {
      results: results.slice(0, args.maxResults || 10),
      totalFound: results.length
    };
  }
}

export class Context7GetContextTool implements CallableTool {
  private context7Service: Context7Service;

  constructor(context7Service: Context7Service) {
    this.context7Service = context7Service;
  }

  getFunctionDeclaration(): FunctionDeclaration {
    return {
      name: 'context7_get_document_context',
      description: 'Get detailed context for a specific document',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'ID of the document to get context for'
          }
        },
        required: ['documentId']
      }
    };
  }

  async call(args: { documentId: string }): Promise<any> {
    return await this.context7Service.getDocumentContext(args.documentId);
  }
}
```

### 3. 集成实施步骤

#### 3.1 第一步：添加 Context7 配置
```typescript
// packages/core/src/config/config.ts
export interface Config {
  // ... 现有配置
  context7?: Context7Config;
}
```

#### 3.2 第二步：创建 Context7 服务
```bash
# 在 packages/core/src/services/ 目录下创建
touch context7-service.ts
touch context7-service.test.ts
```

#### 3.3 第三步：实现 Context7 工具
```bash
# 在 packages/core/src/tools/ 目录下创建
touch context7-tools.ts
touch context7-tools.test.ts
```

#### 3.4 第四步：集成到工具注册表
```typescript
// packages/core/src/tools/tool-registry.ts
import { Context7DocumentSearchTool, Context7GetContextTool } from './context7-tools.js';

export class ToolRegistry {
  // ... 现有代码

  async registerContext7Tools(context7Service: Context7Service): Promise<void> {
    const context7Tools = [
      new Context7DocumentSearchTool(context7Service),
      new Context7GetContextTool(context7Service)
    ];

    for (const tool of context7Tools) {
      await this.registerTool(tool);
    }
  }
}
```

#### 3.5 第五步：更新主入口文件
```typescript
// packages/core/src/index.ts
export * from './services/context7-service.js';
export * from './tools/context7-tools.js';
```

### 4. 配置文件更新

#### 4.1 环境变量配置
```bash
# .env 文件添加
CONTEXT7_ENABLED=true
CONTEXT7_SERVER_URL=https://context7.example.com
CONTEXT7_API_KEY=your_api_key_here
CONTEXT7_UPDATE_INTERVAL=300000
```

#### 4.2 配置文件示例
```json
// config.json
{
  "context7": {
    "enabled": true,
    "serverUrl": "https://context7.example.com",
    "updateInterval": 300000,
    "cacheTimeout": 3600000,
    "maxDocumentSize": 10485760,
    "supportedFormats": ["md", "txt", "js", "ts", "py", "java", "cpp", "h", "json", "yaml", "yml"]
  }
}
```

### 5. 测试策略

#### 5.1 单元测试
```typescript
// packages/core/src/services/context7-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Context7Service } from './context7-service.js';

describe('Context7Service', () => {
  let service: Context7Service;

  beforeEach(() => {
    service = new Context7Service({
      enabled: true,
      updateInterval: 1000,
      cacheTimeout: 5000,
      maxDocumentSize: 1024 * 1024,
      supportedFormats: ['md', 'txt']
    });
  });

  afterEach(() => {
    service.dispose();
  });

  it('should initialize successfully', async () => {
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('should search documents', async () => {
    await service.initialize();
    const results = await service.searchDocuments('test query');
    expect(Array.isArray(results)).toBe(true);
  });
});
```

#### 5.2 集成测试
```typescript
// integration-tests/context7-integration.test.ts
import { describe, it, expect } from 'vitest';

describe('Context7 Integration', () => {
  it('should integrate with Gemini CLI', async () => {
    // 测试 Context7 与 Gemini CLI 的集成
  });

  it('should provide real-time document updates', async () => {
    // 测试实时文档更新功能
  });
});
```

### 6. 部署和运维

#### 6.1 依赖管理
```json
// packages/core/package.json
{
  "dependencies": {
    // ... 现有依赖
    "@context7/mcp-server": "^1.0.0"
  }
}
```

#### 6.2 构建脚本更新
```javascript
// scripts/build.js
// 添加 Context7 相关的构建步骤
```

#### 6.3 监控和日志
```typescript
// packages/core/src/telemetry/context7-telemetry.ts
export class Context7Telemetry {
  static trackDocumentSearch(query: string, resultsCount: number): void {
    // 记录文档搜索指标
  }

  static trackDocumentUpdate(documentId: string, updateTime: number): void {
    // 记录文档更新指标
  }
}
```

### 7. 性能优化

#### 7.1 缓存策略
- 文档内容缓存 (LRU 缓存)
- 搜索结果缓存
- 增量更新机制

#### 7.2 并发控制
- 限制并发文档更新数量
- 请求限流和重试机制
- 连接池管理

### 8. 安全考虑

#### 8.1 认证和授权
- API 密钥管理
- 请求签名验证
- 访问权限控制

#### 8.2 数据安全
- 文档内容加密
- 传输层安全 (TLS)
- 敏感信息过滤

### 9. 故障处理

#### 9.1 错误恢复
- 自动重连机制
- 降级策略
- 错误日志记录

#### 9.2 监控告警
- 服务健康检查
- 性能指标监控
- 异常告警机制

## 实施时间线

### 第一阶段 (1-2周)
- [ ] 基础架构搭建
- [ ] Context7 服务实现
- [ ] 基本工具集成

### 第二阶段 (1周)
- [ ] 测试用例编写
- [ ] 性能优化
- [ ] 文档更新

### 第三阶段 (1周)
- [ ] 集成测试
- [ ] 部署配置
- [ ] 监控设置

## 风险评估

### 技术风险
- **MCP 协议兼容性**: 需要确保与 Context7 的 MCP 实现兼容
- **性能影响**: 实时文档更新可能影响系统性能
- **数据一致性**: 需要处理文档更新的并发问题

### 缓解措施
- 充分的协议测试和验证
- 性能基准测试和优化
- 实现适当的数据同步机制

## 总结

通过将 Context7 集成到 Gemini CLI 项目中，我们可以：

1. **增强文档能力**: 提供实时、最新的文档支持
2. **提升用户体验**: 减少 AI 模型的幻觉问题
3. **扩展功能边界**: 支持更多文档格式和来源
4. **保持架构一致性**: 利用现有的 MCP 基础设施

这个集成方案充分利用了项目现有的 MCP 架构，确保无缝集成和良好的可维护性。

---

*本方案基于 [Context7 GitHub 仓库](https://github.com/upstash/context7) 和当前项目架构分析制定* 