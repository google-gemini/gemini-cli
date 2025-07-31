[查看英文版](https://github.com/google-gemini/gemini-cli/blob/main/README.md)

# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI 截图](../../docs/assets/gemini-screenshot.png)

此存储库包含 Gemini CLI，这是一个命令行 AI 工作流工具，可连接到您的工具、理解您的代码并加速您的工作流。

使用 Gemini CLI，您可以：

- 在 Gemini 的 1M 令牌上下文窗口内及之外查询和编辑大型代码库。
- 使用 Gemini 的多模态功能从 PDF 或草图生成新应用。
- 自动化操作任务，例如查询拉取请求或处理复杂的变基。
- 使用工具和 MCP 服务器连接新功能，包括[使用 Imagen、Veo 或 Lyria 进行媒体生成](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- 使用内置于 Gemini 的 [Google 搜索](https://ai.google.dev/gemini-api/docs/grounding)工具来支持您的查询。

## 快速入门

您有两种安装 Gemini CLI 的选项。

### 使用 Node

1. **先决条件：** 确保您已安装 [Node.js 20 版](https://nodejs.org/en/download)或更高版本。
2. **运行 CLI：** 在您的终端中执行以下命令：

   ```bash
   npx https://github.com/google-gemini/gemini-cli
   ```

   或者使用以下命令安装：

   ```bash
   npm install -g @google/gemini-cli
   ```

   然后，从任何地方运行 CLI：

   ```bash
   gemini
   ```

### 使用 Homebrew

1. **先决条件：** 确保您已安装 [Homebrew](https://brew.sh/)。
2. **安装 CLI** 在您的终端中执行以下命令：

   ```bash
   brew install gemini-cli
   ```

   然后，从任何地方运行 CLI：

   ```bash
   gemini
   ```

### 通用配置步骤

3. **选择一个颜色主题**
4. **进行身份验证：** 出现提示时，使用您的个人 Google 帐户登录。这将授予您使用 Gemini 每分钟最多 60 个模型请求和每天 1,000 个模型请求的权限。

您现在可以使用 Gemini CLI 了！

### 使用 Gemini API 密钥：


Gemini API 提供了一个免费套餐，使用 Gemini 2.5 Pro [每天 100 个请求](https://ai.google.dev/gemini-api/docs/rate-limits#free-tier)，您可以自主选择使用的模型，并可通过付费计划获得更高的速率限制：

1. 从 [Google AI Studio](https://aistudio.google.com/apikey) 生成一个密钥。
2. 在您的终端中将其设置为环境变量。将 `YOUR_API_KEY` 替换为您生成的密钥。

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

3. （可选）在 API 密钥页面上将您的 Gemini API 项目升级为付费计划（将自动解锁 [Tier 1 速率限制](https://ai.google.dev/gemini-api/docs/rate-limits#tier-1)）

### 使用 Vertex AI API 密钥：

Vertex AI API 提供了一个[免费套餐](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview)，可在 Gemini 2.5 Pro 的 express 模式下使用，您可以自主选择模型，并可通过绑定计费账户获得更高的速率限制：

1. 从 [Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys) 生成一个密钥。
2. 在您的终端中将其设置为环境变量。将 `YOUR_API_KEY` 替换为您生成的密钥，并将 GOOGLE_GENAI_USE_VERTEXAI 设置为 true

   ```bash
   export GOOGLE_API_KEY="YOUR_API_KEY"
   export GOOGLE_GENAI_USE_VERTEXAI=true
   ```

3. （可选）在您的项目上添加一个计费帐户以获得[更高的使用限制](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas)

有关其他身份验证方法，包括 Google Workspace 帐户，请参阅[身份验证](./docs/cli/authentication.md)指南。

## 示例

CLI 运行后，您可以从 shell 开始与 Gemini 进行交互。

您可以从一个新目录开始一个项目：

```sh
cd new-project/
gemini
> 给我写一个 Gemini Discord 机器人，使用我将提供的 FAQ.md 文件来回答问题
```

或者处理一个现有项目：

```sh
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> 给我一个昨天所有更改的摘要
```

### 后续步骤

- 了解如何[贡献或从源代码构建](./CONTRIBUTING.md)。
- 浏览可用的 **[CLI 命令](./docs/cli/commands.md)**。
- 如果遇到任何问题，请查阅**[故障排除指南](./docs/troubleshooting.md)**。
- 如需更全面的文档，请参阅[完整文档](./docs/index.md)。
- 查看一些[热门任务](#popular-tasks)以获取更多灵感。
- 查看我们的**[官方路线图](./ROADMAP.md)**。

### 故障排除

如果您遇到问题，请转到[故障排除指南](docs/troubleshooting.md)。

## 热门任务

### 探索新的代码库

首先 `cd` 到一个现有或新克隆的代码仓库并运行 `gemini`。

```text
> 描述这个系统架构的主要部分。
```

```text
> 有哪些安全机制？
```

```text
> 为刚接触代码库的开发人员提供一份循序渐进的开发人员入职文档。
```

```text
> 总结这个代码库，并突出我可以从中学习的最有趣的模式或技术。
```

```text
> 识别此代码库中潜在的改进或重构领域，突出显示看起来脆弱、复杂或难以维护的部分。
```

```text
> 这个代码库的哪些部分可能难以扩展或调试？
```

```text
> 为 [模块名称] 模块生成一个 README 部分，解释它的作用以及如何使用它。
```

```text
> 项目使用什么样的错误处理和日志记录策略？
```

```text
> 这个项目使用了哪些工具、库和依赖项？
```

### 使用您现有的代码

```text
> 为 GitHub 问题 #123 实现初稿。
```

```text
> 帮我将这个代码库迁移到最新版本的 Java。从一个迁移计划开始。
```

### 自动化您的工作流

使用 MCP 服务器将您的本地系统工具与企业协作套件集成。

```text
> 给我做一个幻灯片，显示过去 7 天的 git 历史记录，按功能和团队成员分组。
```

```text
> 为墙壁显示器制作一个全屏 Web 应用程序，以显示我们互动最多的 GitHub 问题。
```

### 与您的系统交互

```text
> 将此目录中的所有图像转换为 png，并根据 exif 数据中的日期重命名。
```

```text
> 按支出月份整理我的 PDF 发票。
```

### 卸载

有关卸载说明，请转到[卸载](docs/Uninstall.md)指南。

## 服务条款和隐私声明

有关适用于您使用 Gemini CLI 的服务条款和隐私声明的详细信息，请参阅[服务条款和隐私声明](../../docs/tos-privacy.md)。