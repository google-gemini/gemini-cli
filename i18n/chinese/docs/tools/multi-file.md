# 多文件工具

<p align="center">
  简体中文 | <a href="../../../../docs/tools/multi-file.md">🌐 English</a>
</p>

`read_many_files` 工具允许模型一次性读取多个文件的内容。

## 功能

- 根据提供的 glob 模式读取文件。
- 递归地在目录中搜索文件。
- 返回一个包含每个文件路径和内容的对象数组。

## 用法

```typescript
import { read_many_files } from '@google/generative-ai/experimental/tools';

const result = await read_many_files({ globs: ['src/**/*.ts'] });
console.log(result);
```

## 示例：在模型中使用

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { read_many_files } from '@google/generative-ai/experimental/tools';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-pro',
  tools: [read_many_files],
});

const result = await model.generateContent(
  '总结 src 目录中所有 TypeScript 文件的内容。',
);
console.log(result.response.text());
```
