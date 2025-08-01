# MCP 服务器工具

<p align="center">
  简体中文 | <a href="../../../../docs/tools/mcp-server.md">🌐 English</a>
</p>

`mcp_server` 工具允许模型与模型上下文协议 (MCP) 服务器进行交互。

## 功能

-   连接到正在运行的 MCP 服务器。
-   发送和接收 MCP 消息。
-   用于与外部服务（如 IDE）集成。

## 用法

```typescript
import { mcp_server } from '@google/generative-ai/experimental/tools';

const result = await mcp_server({ command: "listOpenFiles" });
console.log(result);
```

## 示例：在模型中使用

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { mcp_server } from '@google/generative-ai/experimental/tools';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-pro",
  tools: [mcp_server],
});

const result = await model.generateContent("列出 IDE 中所有打开的文件。");
console.log(result.response.text());
```