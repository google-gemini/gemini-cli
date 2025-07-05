# @/core LLM 提示词设计与工具调用识别深度分析

本文件深度分析 @/core 目录中 LLM 提示词设计策略和工具调用请求识别机制，从设计理念到实现细节进行分层次剖析。

---

## 1. LLM 提示词设计策略

### 1.1 系统提示词架构设计

#### 1.1.1 核心设计原则
- **角色定位明确**：定义为"专门从事软件工程任务的交互式 CLI 代理"
- **任务导向**：专注于安全、高效地帮助用户完成软件开发任务
- **工具驱动**：强调利用可用工具来完成任务，而非仅提供建议

#### 1.1.2 分层结构设计
```
系统提示词 = 基础指令 + 工作流程 + 操作指南 + 安全规则 + 工具使用 + 环境适配 + 示例演示
```

**基础指令层（Core Mandates）**：
- 代码规范遵循：严格遵循现有项目约定
- 库/框架验证：不假设库可用性，需验证项目中的实际使用
- 风格一致性：模仿现有代码的风格、结构、框架选择
- 注释策略：专注于"为什么"而非"做什么"，避免在注释中与用户对话

**工作流程层（Primary Workflows）**：
- 软件工程任务流程：理解 → 计划 → 实现 → 验证（测试）→ 验证（标准）
- 新应用开发流程：需求分析 → 计划提案 → 用户批准 → 实现 → 验证 → 反馈收集

**操作指南层（Operational Guidelines）**：
- 交互风格：简洁直接，适合 CLI 环境
- 输出控制：每响应少于 3 行文本输出
- 格式化：使用 GitHub-flavored Markdown

### 1.2 工具集成策略

#### 1.2.1 工具名称动态注入
```typescript
// 在 prompts.ts 中，工具名称通过模板字符串动态注入
`Use '${GrepTool.Name}' and '${GlobTool.Name}' search tools extensively`
`Use '${EditTool.Name}', '${WriteFileTool.Name}' '${ShellTool.Name}' ...`
```

#### 1.2.2 工具使用指导
- **文件路径**：始终使用绝对路径，不支持相对路径
- **并行执行**：独立工具调用可并行执行
- **命令执行**：使用 ShellTool 运行 shell 命令
- **背景进程**：使用 `&` 启动后台进程
- **交互命令**：避免需要用户交互的命令

### 1.3 环境感知与自适应

#### 1.3.1 沙箱环境检测
```typescript
// 根据环境变量动态调整提示词
const isSandboxExec = process.env.SANDBOX === 'sandbox-exec';
const isGenericSandbox = !!process.env.SANDBOX;
```

#### 1.3.2 Git 仓库感知
```typescript
// 检测是否为 Git 仓库，注入 Git 相关指导
if (isGitRepository(process.cwd())) {
  // 注入 Git 操作指导
}
```

### 1.4 示例驱动学习

#### 1.4.1 多样化示例设计
- **简单计算**：`1 + 2` → `3`
- **工具调用**：`list files here` → `[tool_call: ls for path '.']`
- **复杂任务**：重构认证逻辑的完整流程示例
- **错误处理**：删除目录的安全确认示例

#### 1.4.2 示例覆盖场景
- 基础工具使用
- 复杂工作流程
- 安全操作确认
- 错误处理策略

---

## 2. 工具调用请求识别机制

### 2.1 LLM 响应解析流程

#### 2.1.1 响应类型识别
```typescript
// 在 turn.ts 中的响应处理
for await (const resp of responseStream) {
  // 1. 思考内容识别
  const thoughtPart = resp.candidates?.[0]?.content?.parts?.[0];
  if (thoughtPart?.thought) {
    // 处理思考内容
    yield { type: GeminiEventType.Thought, value: thought };
    continue;
  }

  // 2. 文本内容提取
  const text = getResponseText(resp);
  if (text) {
    yield { type: GeminiEventType.Content, value: text };
  }

  // 3. 函数调用识别
  const functionCalls = resp.functionCalls ?? [];
  for (const fnCall of functionCalls) {
    const event = this.handlePendingFunctionCall(fnCall);
    if (event) {
      yield event;
    }
  }
}
```

#### 2.1.2 函数调用处理
```typescript
private handlePendingFunctionCall(fnCall: FunctionCall): ServerGeminiStreamEvent | null {
  const callId = fnCall.id ?? `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const name = fnCall.name || 'undefined_tool_name';
  const args = (fnCall.args || {}) as Record<string, unknown>;

  const toolCallRequest: ToolCallRequestInfo = {
    callId,
    name,
    args,
    isClientInitiated: false,
  };

  this.pendingToolCalls.push(toolCallRequest);
  return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
}
```

### 2.2 工具调度与执行机制

#### 2.2.1 工具调用状态管理
```typescript
// 工具调用的完整生命周期状态
export type ToolCall =
  | ValidatingToolCall      // 验证中
  | ScheduledToolCall       // 已调度
  | ErroredToolCall         // 错误
  | SuccessfulToolCall      // 成功
  | ExecutingToolCall       // 执行中
  | CancelledToolCall       // 已取消
  | WaitingToolCall;        // 等待确认
```

#### 2.2.2 调度流程设计
```typescript
async schedule(request: ToolCallRequestInfo | ToolCallRequestInfo[], signal: AbortSignal): Promise<void> {
  // 1. 检查是否已有工具在执行
  if (this.isRunning()) {
    throw new Error('Cannot schedule new tool calls while other tool calls are actively running');
  }

  // 2. 创建工具调用实例
  const newToolCalls: ToolCall[] = requestsToProcess.map((reqInfo): ToolCall => {
    const toolInstance = toolRegistry.getTool(reqInfo.name);
    if (!toolInstance) {
      return { status: 'error', request: reqInfo, response: createErrorResponse(...) };
    }
    return { status: 'validating', request: reqInfo, tool: toolInstance, startTime: Date.now() };
  });

  // 3. 处理每个工具调用
  for (const toolCall of newToolCalls) {
    if (this.approvalMode === ApprovalMode.YOLO) {
      this.setStatusInternal(reqInfo.callId, 'scheduled');
    } else {
      const confirmationDetails = await toolInstance.shouldConfirmExecute(reqInfo.args, signal);
      if (confirmationDetails) {
        this.setStatusInternal(reqInfo.callId, 'awaiting_approval', wrappedConfirmationDetails);
      } else {
        this.setStatusInternal(reqInfo.callId, 'scheduled');
      }
    }
  }

  // 4. 尝试执行已调度的调用
  this.attemptExecutionOfScheduledCalls(signal);
}
```

### 2.3 工具注册与发现机制

#### 2.3.1 工具声明生成
```typescript
// 在 tools.ts 中，工具自动生成 FunctionDeclaration
get schema(): FunctionDeclaration {
  return {
    name: this.name,
    description: this.description,
    parameters: this.parameterSchema as Schema,
  };
}
```

#### 2.3.2 工具注入到 LLM
```typescript
// 在 client.ts 中，工具声明注入到对话上下文
private async startChat(extraHistory?: Content[]): Promise<GeminiChat> {
  const toolRegistry = await this.config.getToolRegistry();
  const toolDeclarations = toolRegistry.getFunctionDeclarations();
  const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
  
  return new GeminiChat(
    this.config,
    this.getContentGenerator(),
    {
      systemInstruction,
      ...generateContentConfigWithThinking,
      tools, // 工具声明注入
    },
    history,
  );
}
```

---

## 3. 工具调用优化策略

### 3.1 参数验证机制

#### 3.1.1 多层验证设计
```typescript
// 工具参数验证流程
validateToolParams(params: TParams): string | null {
  // 1. Schema 验证
  if (!SchemaValidator.validate(this.schema.parameters, params)) {
    return 'Parameters failed schema validation.';
  }
  
  // 2. 业务逻辑验证
  if (!path.isAbsolute(params.absolute_path)) {
    return 'File path must be absolute';
  }
  
  // 3. 安全检查
  if (!isWithinRoot(params.absolute_path, this.rootDirectory)) {
    return 'File path must be within the root directory';
  }
  
  return null;
}
```

#### 3.1.2 确认机制设计
```typescript
async shouldConfirmExecute(params: TParams, abortSignal: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
  // 1. 参数验证失败时跳过确认
  if (this.validateToolParams(params)) {
    return false;
  }
  
  // 2. 白名单检查
  if (this.whitelist.has(rootCommand)) {
    return false;
  }
  
  // 3. 返回确认详情
  return {
    type: 'exec',
    title: 'Confirm Shell Command',
    command: params.command,
    rootCommand,
    onConfirm: async (outcome) => {
      if (outcome === ToolConfirmationOutcome.ProceedAlways) {
        this.whitelist.add(rootCommand);
      }
    },
  };
}
```

### 3.2 错误处理与恢复

#### 3.2.1 错误响应格式
```typescript
const createErrorResponse = (request: ToolCallRequestInfo, error: Error): ToolCallResponseInfo => ({
  callId: request.callId,
  responseParts: `Error: ${error.message}`,
  resultDisplay: `Error: ${error.message}`,
  error,
});
```

#### 3.2.2 重试机制
```typescript
// 在 client.ts 中的重试逻辑
const result = await retryWithBackoff(apiCall, {
  onPersistent429: async (authType?: string) => await this.handleFlashFallback(authType),
  authType: this.config.getContentGeneratorConfig()?.authType,
});
```

---

## 4. 提示词与工具调用的协同优化

### 4.1 上下文注入策略

#### 4.1.1 环境上下文
```typescript
private async getEnvironment(): Promise<Part[]> {
  const cwd = this.config.getWorkingDir();
  const today = new Date().toLocaleDateString();
  const platform = process.platform;
  const folderStructure = await getFolderStructure(cwd, { fileService: this.config.getFileService() });
  
  const context = `
    This is the Gemini CLI. We are setting up the context for our chat.
    Today's date is ${today}.
    My operating system is: ${platform}
    I'm currently working in the directory: ${cwd}
    ${folderStructure}
  `.trim();
  
  return [{ text: context }];
}
```

#### 4.1.2 全量上下文支持
```typescript
if (this.config.getFullContext()) {
  const readManyFilesTool = toolRegistry.getTool('read_many_files') as ReadManyFilesTool;
  const result = await readManyFilesTool.execute(
    { paths: ['**/*'], useDefaultExcludes: true },
    AbortSignal.timeout(30000),
  );
  if (result.llmContent) {
    initialParts.push({ text: `\n--- Full File Context ---\n${result.llmContent}` });
  }
}
```

### 4.2 工具选择指导

#### 4.2.1 工具使用优先级
在系统提示词中明确工具使用策略：
- **搜索工具**：`GrepTool` 和 `GlobTool` 用于理解代码结构
- **读取工具**：`ReadFileTool` 和 `ReadManyFilesTool` 用于获取上下文
- **编辑工具**：`EditTool` 和 `WriteFileTool` 用于代码修改
- **执行工具**：`ShellTool` 用于命令执行

#### 4.2.2 工具组合模式
```typescript
// 示例中的工具组合使用模式
// 1. 搜索相关文件
[tool_call: ${GlobTool.Name} for path 'tests/test_auth.py']
// 2. 读取文件内容
[tool_call: ${ReadFileTool.Name} for absolute_path '/path/to/tests/test_auth.py']
// 3. 执行修改
[tool_call: ${EditTool.Name} to apply the refactoring to 'src/auth.py']
// 4. 验证结果
[tool_call: ${ShellTool.Name} for 'ruff check src/auth.py && pytest']
```

---

## 5. 性能优化与扩展性

### 5.1 流式处理优化
- **事件驱动**：使用 AsyncGenerator 实现流式事件处理
- **状态管理**：实时跟踪工具调用状态变化
- **输出更新**：支持工具执行过程中的实时输出更新

### 5.2 扩展性设计
- **MCP 支持**：通过 MCP 协议支持外部工具发现和调用
- **动态工具注册**：支持运行时工具发现和注册
- **配置驱动**：通过配置文件控制工具行为

---

## 6. 总结

@/core 目录的 LLM 提示词设计和工具调用识别机制体现了以下核心设计理念：

1. **分层设计**：从系统指令到具体工具使用，形成完整的分层架构
2. **动态注入**：工具名称和功能通过模板动态注入到提示词中
3. **状态管理**：完整的工具调用生命周期状态管理
4. **安全优先**：多层验证和确认机制确保操作安全
5. **环境感知**：根据运行环境动态调整提示词内容
6. **示例驱动**：通过丰富示例指导 LLM 正确使用工具
7. **流式处理**：支持实时响应和状态更新

这种设计确保了 LLM 能够准确理解用户意图，正确选择和使用工具，同时保持系统的安全性和可扩展性。 