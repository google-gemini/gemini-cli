[查看英文版](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/web-search.md)

# Google 网页搜索工具 (`google_web_search`)

`google_web_search` 工具允许模型使用 Google 搜索在网络上查找信息。

## 功能

-   根据提供的查询执行网络搜索。
-   返回搜索结果列表，包括标题、链接和摘要。

## 用法

```typescript
import { google_web_search } from '@google/generative-ai/experimental/tools';

const result = await google_web_search({ query: "最新的 AI 研究" });
console.log(result);
```

## 示例：在模型中使用

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google_web_search } from '@google/generative-ai/experimental/tools';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-pro",
  tools: [google_web_search],
});

const result = await model.generateContent("关于 Gemini CLI 的最新消息是什么？");
console.log(result.response.text());
```

## 安全说明

`google_web_search` 工具旨在提供安全搜索结果，但始终建议您在点击链接或下载内容时保持谨慎。