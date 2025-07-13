# Qwen 集成使用示例和最佳实践

## 基础使用示例

### 简单问答
```bash
$ export QWEN_API_KEY="your_api_key"
$ gemini --auth-type=qwen-api-key --model=qwen-plus

> 你好，请介绍一下 TypeScript 的主要特性

TypeScript 是 JavaScript 的超集，主要特性包括：

1. **静态类型检查**：在编译时捕获类型错误
2. **ES6+ 支持**：支持最新的 JavaScript 语法
3. **面向对象编程**：支持类、接口、泛型等
4. **工具集成**：优秀的 IDE 支持和代码补全
5. **渐进式采用**：可以逐步迁移现有 JavaScript 项目

> 编写一个 TypeScript 接口来描述用户对象

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  age?: number;  // 可选属性
  roles: string[];
  createdAt: Date;
  profile?: {
    avatar?: string;
    bio?: string;
  };
}

// 使用示例
const user: User = {
  id: 1,
  name: "张三",
  email: "zhangsan@example.com",
  roles: ["user", "admin"],
  createdAt: new Date()
};
```
```

### 代码分析和重构
```bash
> 分析这个项目的代码结构并给出改进建议

基于对代码库的分析，这个 Gemini CLI 项目采用了良好的架构设计：

**当前架构优势：**
1. **Monorepo 结构**：使用 workspaces 分离 CLI 和核心逻辑
2. **模块化设计**：ContentGenerator 接口支持多种 AI 服务
3. **工具系统**：可扩展的工具注册和调用机制
4. **类型安全**：完整的 TypeScript 类型定义

**改进建议：**
1. **错误处理增强**：添加更细粒度的错误分类和重试机制
2. **配置验证**：加强输入验证和类型安全
3. **性能优化**：实现连接池和请求缓存
4. **监控和日志**：添加详细的调试和性能监控

> 帮我重构这个函数，使其更加类型安全

[用户提供代码后，Qwen 会分析并提供重构建议]
```

### 文档处理
```bash
> 总结这个 README.md 文件的关键信息

> 基于代码注释生成 API 文档

> 检查文档的一致性和完整性
```

## 高级配置示例

### 自定义 Qwen 参数配置
```typescript
// ~/.gemini/config.json
{
  "authType": "qwen-api-key",
  "model": "qwen-plus",
  "qwenConfig": {
    // 控制重复内容
    "repetition_penalty": 1.1,
    "frequency_penalty": 0.1,
    
    // 创意性控制
    "temperature": 0.7,
    "top_p": 0.9,
    
    // 停止条件
    "stop": ["```", "## 结束"],
    
    // 网络搜索
    "enable_search": true,
    "enable_citation": true,
    
    // 输出控制
    "max_tokens": 4000,
    "seed": 42  // 可重现的结果
  },
  
  // 性能配置
  "timeout": 60000,
  "retryConfig": {
    "maxRetries": 3,
    "baseDelay": 2000
  }
}
```

### 程序化使用
```typescript
import { 
  QwenContentGenerator, 
  QwenConfigValidator,
  validateConfigOrThrow 
} from '@google/gemini-cli-core';

// 创建配置并验证
const qwenConfig = {
  repetition_penalty: 1.1,
  enable_search: true,
  max_tokens: 2000
};

validateConfigOrThrow(qwenConfig);

// 创建生成器
const generator = new QwenContentGenerator(
  process.env.QWEN_API_KEY!,
  'https://dashscope.aliyuncs.com/compatible-mode/v1',
  {
    headers: {
      'User-Agent': 'MyApp/1.0.0'
    }
  },
  {
    timeout: 30000,
    retryConfig: {
      maxRetries: 2,
      baseDelay: 1000
    }
  }
);

// 生成内容
const response = await generator.generateContent({
  model: 'qwen-plus',
  contents: [{
    role: 'user',
    parts: [{ text: '解释量子计算的基本原理' }]
  }],
  config: {
    temperature: 0.3,
    maxOutputTokens: 1000,
    qwen: qwenConfig
  }
});

console.log(response.candidates?.[0]?.content.parts[0]?.text);
```

### 流式响应处理
```typescript
async function streamChat() {
  const stream = generator.generateContentStream({
    model: 'qwen-plus',
    contents: [{
      role: 'user',
      parts: [{ text: '详细解释 React Hooks 的工作原理' }]
    }],
    config: {
      temperature: 0.5,
      qwen: {
        max_tokens_per_chunk: 256,
        incremental_output: true
      }
    }
  });

  for await (const chunk of stream) {
    const text = chunk.candidates?.[0]?.content.parts[0]?.text;
    if (text) {
      process.stdout.write(text);
    }
  }
}
```

## 错误处理最佳实践

### 自定义错误处理
```typescript
import { QwenError, QwenErrorType } from '@google/gemini-cli-core';

async function robustGeneration(prompt: string) {
  try {
    const response = await generator.generateContent({
      model: 'qwen-plus',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    return response;
  } catch (error) {
    if (error instanceof QwenError) {
      switch (error.type) {
        case QwenErrorType.RATE_LIMIT_ERROR:
          console.log('请求频率过高，等待后重试...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          return robustGeneration(prompt);
          
        case QwenErrorType.QUOTA_EXCEEDED:
          console.error('配额已用完，请检查账户余额');
          throw new Error('配额不足');
          
        case QwenErrorType.AUTHENTICATION_ERROR:
          console.error('认证失败，请检查 API Key');
          throw new Error('认证失败');
          
        case QwenErrorType.NETWORK_ERROR:
          if (error.retryable) {
            console.log('网络错误，自动重试中...');
            // 重试逻辑已内置，这里只是示例
          }
          break;
          
        default:
          console.error('未知错误:', error.message);
      }
    }
    
    throw error;
  }
}
```

### 批量处理错误恢复
```typescript
async function batchProcess(prompts: string[]) {
  const results = [];
  const failed = [];
  
  for (let i = 0; i < prompts.length; i++) {
    try {
      const result = await robustGeneration(prompts[i]);
      results.push({ index: i, result });
    } catch (error) {
      console.warn(`Prompt ${i} failed:`, error.message);
      failed.push({ index: i, prompt: prompts[i], error });
      
      // 记录失败但继续处理
      results.push({ index: i, result: null });
    }
  }
  
  // 重试失败的请求
  if (failed.length > 0) {
    console.log(`重试 ${failed.length} 个失败的请求...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    for (const item of failed) {
      try {
        const result = await robustGeneration(item.prompt);
        results[item.index] = { index: item.index, result };
      } catch (error) {
        console.error(`最终失败 ${item.index}:`, error.message);
      }
    }
  }
  
  return results;
}
```

## 性能优化技巧

### 1. 模型选择策略
```typescript
function selectOptimalModel(taskType: string, textLength: number): string {
  if (taskType === 'simple_qa' || textLength < 500) {
    return 'qwen-turbo';  // 快速响应
  } else if (taskType === 'code_analysis' || textLength < 5000) {
    return 'qwen-plus';   // 平衡性能
  } else if (taskType === 'complex_reasoning') {
    return 'qwen-max';    // 最高质量
  } else if (textLength > 10000) {
    return 'qwen-max-longcontext';  // 长文本
  }
  
  return 'qwen-plus';  // 默认选择
}
```

### 2. 请求缓存
```typescript
class QwenCache {
  private cache = new Map<string, any>();
  private ttl = 5 * 60 * 1000; // 5分钟
  
  private getCacheKey(prompt: string, config: any): string {
    return `${prompt}:${JSON.stringify(config)}`;
  }
  
  async generateWithCache(prompt: string, config: any) {
    const key = this.getCacheKey(prompt, config);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.result;
    }
    
    const result = await generator.generateContent({
      model: 'qwen-plus',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config
    });
    
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }
}
```

### 3. 并发控制
```typescript
class QwenRateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent = 3;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      });
      
      this.processQueue();
    });
  }
  
  private processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    const fn = this.queue.shift()!;
    this.running++;
    fn();
  }
}

// 使用示例
const limiter = new QwenRateLimiter();

const results = await Promise.all(
  prompts.map(prompt => 
    limiter.execute(() => 
      generator.generateContent({
        model: 'qwen-plus',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    )
  )
);
```

## 项目集成指南

### CI/CD 集成
```yaml
# .github/workflows/ai-review.yml
name: AI Code Review

on:
  pull_request:
    branches: [main]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install Gemini CLI
        run: npm install -g @google/gemini-cli
        
      - name: AI Code Review
        env:
          QWEN_API_KEY: ${{ secrets.QWEN_API_KEY }}
        run: |
          gemini --auth-type=qwen-api-key --model=qwen-plus --non-interactive \
            "分析此次PR的代码变更，提供代码质量、安全性和最佳实践的建议" \
            --context="$(git diff origin/main...HEAD)"
```

### Docker 集成
```dockerfile
# Dockerfile
FROM node:20-alpine

RUN npm install -g @google/gemini-cli

ENV QWEN_API_KEY=""
ENV QWEN_API_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

WORKDIR /workspace

ENTRYPOINT ["gemini", "--auth-type=qwen-api-key"]
```

### VS Code 扩展
```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Qwen: Explain Code",
      "type": "shell",
      "command": "gemini",
      "args": [
        "--auth-type=qwen-api-key",
        "--model=qwen-plus",
        "--non-interactive",
        "解释这段代码的功能和实现原理",
        "--context=${selectedText}"
      ],
      "group": "build"
    }
  ]
}
```

这些示例展示了如何在各种场景下有效使用 Qwen 集成，从基础的命令行使用到高级的程序化集成和性能优化。