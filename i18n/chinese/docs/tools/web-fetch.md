[查看英文版](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/web-fetch.md)

# 网页抓取工具 (`web_fetch`)

`web_fetch` 工具允许模型从给定的 URL 抓取内容。

## 功能

-   从 HTTP 和 HTTPS URL 抓取内容。
-   支持基于 MIME 类型的基本内容处理（例如，`text/html`、`application/json`）。
-   出于安全原因，遵循 `robots.txt` 规则。

## 用法

```typescript
import { web_fetch } from '@google/generative-ai/experimental/tools';

const result = await web_fetch({ url: "https://example.com" });
console.log(result);
```

## 示例：在模型中使用

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { web_fetch } from '@google/generative-ai/experimental/tools';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-pro",
  tools: [web_fetch],
});

const result = await model.generateContent("总结一下 example.com 上的内容。");
console.log(result.response.text());
```

## 安全说明

-   `web_fetch` 工具不会执行从 URL 抓取的任何 JavaScript。
-   它仅限于抓取公共可访问的 URL。
-   请注意您要求模型抓取的 URL，以避免潜在的 SSRF（服务器端请求伪造）漏洞，即使风险很低。