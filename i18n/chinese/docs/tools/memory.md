# 内存工具

<p align="center">
  简体中文 | <a href="../../../../docs/tools/memory.md">🌐 English</a>
</p>

`save_memory` 工具允许模型在对话中存储和检索信息。

## 功能

- 将键值对保存到持久化存储中。
- 根据键检索值。
- 对于在对话中需要记住上下文或偏好的场景非常有用。

## 用法

```typescript
import { save_memory } from '@google/generative-ai/experimental/tools';

await save_memory({ key: 'name', value: 'John Doe' });
```

## 示例：在模型中使用

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { save_memory } from '@google/generative-ai/experimental/tools';

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-pro',
  tools: [save_memory],
});

const result = await model.generateContent('请记住我的名字是 John Doe。');
console.log(result.response.text());
```
