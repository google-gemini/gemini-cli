# 双子座 CLI

[![双子座 CLI CI]（https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg）]（https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml）

![Gemini CLI 截图]（./文档/资产/gemini-screenshot.png）

此存储库包含 Gemini CLI，这是一种命令行 AI 工作流程工具，可连接到您的
工具，理解您的代码并加速您的工作流程。

使用 Gemini CLI，您可以：

- 在 Gemini 的 1M 令牌上下文窗口内外查询和编辑大型代码库。
- 使用 Gemini 的多模式功能从 PDF 或草图生成新应用程序。
- 自动执行作任务，例如查询拉取请求或处理复杂的变基。
- 使用工具和 MCP 服务器连接新功能，包括 [使用 Imagen 生成媒体，
  Veo 或 Lyria]（https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia）
- 使用 [Google 搜索]（https://ai.google.dev/gemini-api/docs/grounding） 建立您的查询基础
  工具，内置于 Gemini 中。

## 快速入门

您有两种安装 Gemini CLI 的选项。

### 带节点

1. **先决条件：** 确保您安装了 [Node.js 版本 20]（https://nodejs.org/en/download） 或更高版本。
2. **运行 CLI：** 在终端中执行以下命令：

''抨击
   NPX https://github.com/google-gemini/gemini-cli
   ```

或使用以下方式安装：

''抨击
   npm 安装 -g @google/gemini-cli
   ```

然后，从任何地方运行 CLI：

''抨击
   双子座
   ```

### 使用自制

1. **先决条件：** 确保您已安装 [Homebrew]（https://brew.sh/）。
2. **安装 CLI** 在终端中执行以下命令：

''抨击
   brew 安装 gemini-cli
   ```

然后，从任何地方运行 CLI：

''抨击
   双子座
   ```

### 常见配置步骤

3. **选择颜色主题**
4. **身份验证：** 出现提示时，使用您的个人 Google 帐户登录。这将使您每分钟最多获得 60 个模型请求，使用 Gemini 每天最多获得 1,000 个模型请求。

您现在可以使用 Gemini CLI！

### 使用 Gemini API 密钥：

Gemini API 提供免费套餐，每天可使用 Gemini 2.5 Pro [100 个请求]（https://ai.google.dev/gemini-api/docs/rate-limits#free-tier），控制您使用的型号，并访问更高的速率限制（使用付费套餐）：

1. 从 [Google AI Studio]（https://aistudio.google.com/apikey） 生成密钥。
2. 在终端中将其设置为环境变量。将“YOUR_API_KEY”替换为生成的密钥。

''抨击
   导出 GEMINI_API_KEY=“YOUR_API_KEY”
   ```

3. （可选）在 API 密钥页面将您的 Gemini API 项目升级为付费计划（将自动解锁 [第 1 层速率限制]（https://ai.google.dev/gemini-api/docs/rate-limits#tier-1））

### 使用 Vertex AI API 密钥：

Vertex AI API 为 Gemini 2.5 Pro 提供了使用快速模式的 [免费套餐]（https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview），可控制您使用的型号，并通过结算帐号访问更高的速率限制：

1. 从 [Google Cloud]（https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys） 生成密钥。
2. 在终端中将其设置为环境变量。将“YOUR_API_KEY”替换为生成的密钥，并将GOOGLE_GENAI_USE_VERTEXAI设置为 true

''抨击
   导出 GOOGLE_API_KEY=“YOUR_API_KEY”
   导出 GOOGLE_GENAI_USE_VERTEXAI=true
   ```

3. （可选）在项目上添加计费帐户以访问 [更高的使用限制]（https://cloud.google.com/vertex-ai/generative-ai/docs/quotas）

如需了解其他身份验证方法（包括 Google Workspace 帐号），请参阅 [authentication]（./docs/cli/authentication.md） 指南。

## 示例

CLI 运行后，您可以从 shell 开始与 Gemini 交互。

您可以从新目录启动项目：

“嘘
cd 新项目/
双子座
> 给我写一个 Gemini Discord 机器人，使用我将提供的 FAQ.md 文件回答问题
```

或者使用现有项目：

“嘘
git 克隆 https://github.com/google-gemini/gemini-cli
cd 双子座-cli
双子座
> 给我总结一下昨天发生的所有变化
```

### 后续步骤

- 了解如何 [为源代码做出贡献或从源代码构建]（./CONTRIBUTING.md）。
- 探索可用的 **[CLI 命令]（./docs/cli/commands.md）**。
- 如果您遇到任何问题，请查看 **[故障排除指南]（./docs/troubleshooting.md）**。
- 有关更全面的文档，请参阅 [完整文档]（./docs/index.md）。
- 看看一些[热门任务]（#popular 任务）以获得更多灵感。
- 查看我们的 **[官方路线图]（./ROADMAP.md）**

### 故障排除

如果您是，请前往 [故障排除指南]（docs/troubleshooting.md）
有问题。

## 热门任务

### 探索新的代码库

首先“cd”到现有或新克隆的存储库中并运行“gemini”。

'''文本
> 描述该系统架构的主要部分。
```

'''文本
> 有哪些安全机制？
```

'''文本
> 为刚接触代码库的开发人员提供分步开发人员入职文档。
```

'''文本
> 总结这个代码库，并突出显示我可以从中学习的最有趣的模式或技术。
```

'''文本
> 确定此代码库中潜在的改进或重构领域，突出显示看起来脆弱、复杂或难以维护的部分。
```

'''文本
> 此代码库的哪些部分可能难以扩展或调试？
```

'''文本
> 为 [模块名称] 模块生成自述文件部分，解释它的作用和使用方法。
```

'''文本
> 项目使用什么样的错误处理和日志记录策略？
```

'''文本
> 此项目使用了哪些工具、库和依赖项？
```

### 使用您现有的代码

'''文本
> 实现 GitHub 问题 #123 的初稿。
```

'''文本
> 帮我将此代码库迁移到最新版本的 Java。从计划开始。
```

### 自动化您的工作流程

使用 MCP 服务器将本地系统工具与企业协作套件集成。

'''文本
> 为我制作一个幻灯片，显示过去 7 天的 git 历史记录，按功能和团队成员分组。
```

'''文本
> 为墙面显示器制作一个全屏 Web 应用程序，以显示我们与 GitHub 交互最多的问题。
```

### 与您的系统交互

'''文本
> 将此目录中的所有图像转换为 png，并重命名它们以使用 exif 数据中的日期。
```

'''文本
> 按支出月份整理我的 PDF 发票。
```

### 卸载

前往 [卸载]（docs/Uninstall.md） 指南了解卸载说明。

## 服务条款和隐私声明

有关适用于您使用 Gemini CLI 的服务条款和隐私声明的详细信息，请参阅[服务条款和隐私声明]（./docs/tos-privacy.md）。
