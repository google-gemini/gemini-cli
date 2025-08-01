[查看英文版](../../../../docs/tools/shell.md)

# Shell 工具

`run_shell_command` 工具允许模型在用户的本地机器上执行 shell 命令。

## 功能

-   在用户的默认 shell 中执行命令。
-   可以访问与用户相同的环境变量和权限。
-   默认在沙箱环境中运行以确保安全。

## 用法

```typescript
import { run_shell_command } from '@google/generative-ai/experimental/tools';

const result = await run_shell_command({ command: "ls -l" });
console.log(result);
```

## 示例：在模型中使用

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { run_shell_command } from '@google/generative-ai/experimental/tools';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-pro",
  tools: [run_shell_command],
});

const result = await model.generateContent("列出当前目录中的文件。");
console.log(result.response.text());
```

## 安全说明

-   `run_shell_command` 工具默认在沙箱环境中运行，以防止执行潜在的危险命令。有关更多详细信息，请参阅[沙箱](../sandbox.md)文档。
-   在禁用沙箱的情况下使用此工具时要格外小心，因为它将以与用户相同的权限执行命令。