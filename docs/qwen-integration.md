# 阿里云百炼 Qwen 模型集成指南

## 概述

本指南介绍如何将 Gemini CLI 配置为使用阿里云百炼的 Qwen 模型，通过 OpenAI 兼容接口进行调用。该集成保持了 Gemini CLI 的所有核心功能，同时支持 Qwen 模型的特有能力。

## 前置条件

1. **阿里云百炼账户**：需要有效的阿里云账户和百炼服务访问权限
2. **API Key**：从阿里云百炼控制台获取 API Key
3. **Node.js ≥20**：Gemini CLI 要求 Node.js 版本 20 或更高
4. **网络访问**：确保能够访问 `dashscope.aliyuncs.com`

## 快速开始

### 1. 设置环境变量

```bash
# 必需：阿里云百炼 API Key
export QWEN_API_KEY="your_dashscope_api_key"

# 可选：自定义 API 端点 (默认: https://dashscope.aliyuncs.com/compatible-mode/v1)
export QWEN_API_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 可选：设置默认模型
export QWEN_DEFAULT_MODEL="qwen-plus"
```

### 2. 启动 CLI

```bash
# 方式一：命令行参数
gemini --auth-type=qwen-api-key --model=qwen-plus

# 方式二：环境变量
export GEMINI_AUTH_TYPE=qwen-api-key
export GEMINI_MODEL=qwen-plus
gemini

# 方式三：交互式选择
gemini
# 然后在认证选项中选择 "Qwen API Key"
```

### 3. 配置文件设置

创建或编辑 `~/.gemini/config.json`：

```json
{
  "authType": "qwen-api-key",
  "model": "qwen-plus",
  "qwenConfig": {
    "repetition_penalty": 1.1,
    "enable_search": true,
    "max_tokens_per_chunk": 512
  }
}
```

## 支持的模型

| 模型名称 | 描述 | 上下文长度 | 适用场景 |
|---------|------|-----------|----------|
| `qwen-turbo` | 快速响应模型 | 32K | 简单问答、快速迭代 |
| `qwen-plus` | 平衡性能模型（**推荐**） | 128K | 日常开发、代码分析 |
| `qwen-max` | 最强性能模型 | 32K | 复杂推理、高质量生成 |
| `qwen-max-longcontext` | 长文本处理模型 | 1M | 大型文档分析 |
| `qwen2-72b-instruct` | Qwen2 大型模型 | 32K | 专业级任务 |
| `qwen2-7b-instruct` | Qwen2 中型模型 | 32K | 平衡的性能和速度 |
| `qwen2-1.5b-instruct` | Qwen2 小型模型 | 32K | 轻量级应用 |
| `qwen2-0.5b-instruct` | Qwen2 超小型模型 | 32K | 资源受限环境 |

## 高级配置

### Qwen 特有参数

```json
{
  "authType": "qwen-api-key",
  "model": "qwen-plus",
  "qwenConfig": {
    "repetition_penalty": 1.1,          // 重复惩罚 (0.01-2.0)
    "presence_penalty": 0.0,            // 存在惩罚 (-2.0-2.0)
    "frequency_penalty": 0.0,           // 频率惩罚 (-2.0-2.0)
    "temperature": 0.7,                 // 随机性控制
    "top_p": 0.9,                      // 核采样
    "max_tokens": 4000,                // 最大输出 token 数
    "stop": ["</end>", "\n\n"],        // 停止序列
    "seed": 42,                        // 随机种子
    "enable_search": true,             // 启用网络搜索
    "enable_citation": true,           // 启用引用模式
    "result_format": "text",           // 输出格式
    "response_format": {               // 结构化输出
      "type": "json_object",
      "schema": {
        "type": "object",
        "properties": {
          "answer": {"type": "string"},
          "confidence": {"type": "number"}
        }
      }
    }
  }
}
```

### 超时和重试配置

```json
{
  "qwenConfig": {
    "timeout": 60000,                  // 请求超时 (毫秒)
    "retryConfig": {
      "maxRetries": 3,                 // 最大重试次数
      "baseDelay": 1000,               // 基础延迟
      "maxDelay": 30000,               // 最大延迟
      "backoffMultiplier": 2           // 退避倍数
    }
  }
}
```

## 使用示例

### 基本对话
```bash
$ gemini
> 你好，请介绍一下自己
你好！我是通义千问，由阿里云开发的AI助手...
```

### 代码生成
```bash
> 用 Python 写一个快速排序算法
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    ...
```

### 文档分析
```bash
> 分析当前项目的代码结构
基于我对项目文件的分析，这是一个使用 TypeScript 开发的...
```

## 功能限制

1. **嵌入功能不支持**：Qwen 模型不支持文本嵌入功能
2. **Token 计数估算**：使用基于字符数的估算方法（4字符 ≈ 1 token）
3. **函数调用**：支持但可能与 Gemini 原生工具系统存在差异

## 故障排除

### 常见错误和解决方案

#### 1. API Key 相关错误

**错误**: `QWEN_API_KEY environment variable not found`
```bash
Error: QWEN_API_KEY environment variable not found
```
**解决方案**：
- 设置环境变量：`export QWEN_API_KEY="your_api_key"`
- 或在 `.env` 文件中添加：`QWEN_API_KEY=your_api_key`
- 检查 API Key 格式是否正确（通常以 `sk-` 开头）

**错误**: `Authentication failed`
```bash
Error: Qwen API error (401): Unauthorized
```
**解决方案**：
- 验证 API Key 是否正确复制（无额外空格）
- 检查 API Key 是否已过期
- 确认在阿里云控制台中 API Key 状态为"启用"

#### 2. 网络和连接问题

**错误**: `Network timeout`
```bash
Error: Request timeout
```
**解决方案**：
- 检查网络连接
- 增加超时时间：在配置中设置 `"timeout": 60000`
- 如在企业网络，检查防火墙和代理设置

**错误**: `Connection refused`
```bash
Error: Network error: Connection refused
```
**解决方案**：
- 确认可以访问 `dashscope.aliyuncs.com`
- 检查 DNS 解析：`nslookup dashscope.aliyuncs.com`
- 尝试更换网络环境

#### 3. 配额和计费问题

**错误**: `Rate limit exceeded`
```bash
Error: Qwen API error (429): Too Many Requests
```
**解决方案**：
- 等待一分钟后重试
- 检查账户的 QPS 限制
- 考虑升级到更高的计费套餐

**错误**: `Quota exceeded`
```bash
Error: Qwen API error (403): Quota exceeded
```
**解决方案**：
- 检查账户余额是否充足
- 查看当月使用额度
- 在阿里云控制台充值或调整配额

#### 4. 模型和参数错误

**错误**: `Model not found`
```bash
Error: Qwen API error (404): Model not found
```
**解决方案**：
- 使用支持的模型名称（如 `qwen-plus`）
- 检查模型名称拼写
- 确认该模型在当前地区可用

**错误**: `Invalid parameters`
```bash
Error: Qwen API error (400): Invalid request parameters
```
**解决方案**：
- 检查参数范围（如 temperature: 0-2）
- 验证 JSON 格式正确性
- 查看 max_tokens 是否超过模型限制

#### 5. 流式响应问题

**错误**: `Stream parsing failed`
```bash
Error: Failed to parse streaming response
```
**解决方案**：
- 检查网络稳定性
- 降低 `max_tokens_per_chunk` 值
- 启用调试模式查看原始响应

### 调试技巧

#### 启用详细日志
```bash
# 设置调试环境变量
export DEBUG=qwen:*
export QWEN_VERBOSE=true

# 运行 CLI
gemini --auth-type=qwen-api-key --model=qwen-plus
```

#### 测试连接
```bash
# 测试 API 连接
curl -X POST "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" \
  -H "Authorization: Bearer $QWEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 10
  }'
```

#### 检查配置
```javascript
// 在 Node.js 中验证配置
const { QwenContentGenerator } = require('@google/gemini-cli-core');

try {
  const generator = new QwenContentGenerator(
    process.env.QWEN_API_KEY,
    process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  );
  console.log('Configuration valid');
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

### 性能优化

#### 1. 减少延迟
- 选择地理位置更近的 API 端点
- 使用 `qwen-turbo` 模型进行快速响应
- 启用连接复用

#### 2. 提高成功率
- 配置适当的重试策略
- 设置合理的超时时间
- 使用指数退避算法

#### 3. 控制成本
- 设置 `max_tokens` 限制
- 使用较小的模型处理简单任务
- 监控 API 使用量

## 技术实现细节

### 架构
- 实现了 `ContentGenerator` 接口
- 将 Gemini API 格式转换为 OpenAI 兼容格式
- 支持流式响应和函数调用

### 请求转换
- Content → OpenAI Messages
- Tools → OpenAI Functions
- Config → OpenAI Parameters

### 响应映射
- Choices → Candidates
- Usage → UsageMetadata
- Function Calls → Gemini Function Format

## 开发扩展

如需添加更多 Qwen 模型或自定义功能，请修改：

1. `packages/core/src/config/models.ts` - 添加新模型
2. `packages/core/src/qwen/qwenContentGenerator.ts` - 扩展转换逻辑
3. `packages/cli/src/config/auth.ts` - 更新认证验证

## 联系支持

如遇到问题，请：
1. 检查[故障排除](#故障排除)部分
2. 查看项目 GitHub Issues
3. 参考阿里云百炼官方文档