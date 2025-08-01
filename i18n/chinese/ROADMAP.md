🌐 [查看英文版](../../ROADMAP.md)

# Gemini CLI 路线图

[官方 Gemini CLI 路线图](https://github.com/orgs/google-gemini/projects/11/)

Gemini CLI 是一个开源 AI 代理，可将 Gemini 的强大功能直接带入您的终端。它提供了对 Gemini 的轻量级访问，为您提供了从提示到我们模型的最直接路径。

本文档概述了我们对 Gemini CLI 路线图的方法。在这里，您将找到我们的指导原则以及我们关注的重点开发领域的细分。我们的路线图不是一个静态列表，而是一组动态的优先级，这些优先级在我们的 GitHub Issues 中实时跟踪。

作为一个 [Apache 2.0 开源项目](https://github.com/google-gemini/gemini-cli?tab=Apache-2.0-1-ov-file#readme)，我们赞赏并欢迎[公众贡献](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md)，并将优先考虑与我们路线图一致的贡献。如果您想为我们的路线图提出新功能或更改，请首先[提出问题进行讨论](https://github.com/google-gemini/gemini-cli/issues/new/choose)。

## 免责声明

本路线图代表我们目前的想法，仅供参考。它不是对未来交付的承诺或保证。任何功能的开发、发布和时间安排都可能发生变化，我们可能会根据社区讨论以及我们的优先级变化更新路线图。

## 指导原则

我们的开发遵循以下原则：

- **强大与简单：** 通过直观易用的轻量级命令行界面提供对最先进的 Gemini 模型的访问。
- **可扩展性：** 一个适应性强的代理，可帮助您处理各种用例和环境，并能够在任何地方运行这些代理。
- **智能：** Gemini CLI 应在 SWE Bench、Terminal Bench 和 CSAT 等基准测试中被可靠地评为最佳代理工具之一。
- **免费和开源：** 培养一个蓬勃发展的开源社区，让成本不再是个人使用的障碍，并且 PR 能够快速合并。这意味着快速解决和关闭问题、拉取请求和讨论帖子。

## 路线图如何运作

我们的路线图直接通过 Github Issues 进行管理。请在此处查看我们的入口路线图问题 [此处](https://github.com/google-gemini/gemini-cli/issues/4191)。这种方法可以实现透明度，并为您提供直接的方式来了解更多信息或参与任何特定的计划。我们所有的路线图项目都将被标记为 Type:`Feature` 和 Label:`maintainer`，用于我们正在积极开发的功能，或 Type:`Task` 和 Label:`maintainer`，用于更详细的任务列表。

问题的组织方式可以一目了然地提供关键信息：

- **目标季度：** `Milestone` 表示预期的交付时间表。
- **功能领域：** `area/model` 或 `area/tooling` 等标签对工作进行分类。
- **问题类型：** _Workstream_ => _Epics_ => _Features_ => _Tasks|Bugs_

要查看我们正在进行的工作，您可以按这些维度筛选我们的问题。在此处查看我们所有的项目 [此处](https://github.com/orgs/google-gemini/projects/11/views/19)

## 重点领域

为了更好地组织我们的工作，我们将工作分为几个关键的功能领域。这些标签在我们的 GitHub Issues 中使用，以帮助您筛选和查找您感兴趣的计划。

- **身份验证：** 通过 API 密钥、Gemini Code Assist 登录等方式安全地访问用户。
- **模型：** 支持新的 Gemini 模型、多模态、本地执行和性能调整。
- **用户体验：** 改进 CLI 的可用性、性能、交互功能和文档。
- **工具：** 内置工具和 MCP 生态系统。
- **核心：** CLI 的核心功能
- **可扩展性：** 将 Gemini CLI 引入其他平台，例如 GitHub。
- **贡献：** 通过测试自动化和 CI/CD 管道增强来改进贡献流程。
- **平台：** 管理安装、操作系统支持和底层 CLI 框架。
- **质量：** 专注于测试、可靠性、性能和整体产品质量。
- **后台代理：** 支持长时间运行的自主任务和主动协助。
- **安全和隐私：** 适用于与安全和隐私相关的所有事项

## 如何贡献

Gemini CLI 是一个开源项目，我们欢迎社区的贡献！无论您是开发人员、设计师，还是只是一个热情的用户，您都可以在此处找到我们的[社区指南](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md)以了解如何开始。有很多方法可以参与其中：

- **路线图：** 请查看并找到我们[路线图](https://github.com/google-gemini/gemini-cli/issues/4191)中您希望贡献的领域。基于此的贡献将最容易集成。
- **报告 Bug：** 如果您发现问题，请创建一个[错误报告](https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml)，并尽可能详细地描述。如果您认为这是阻止直接使用 CLI 的严重问题，请标记为 `priorty/p0`。
- **建议功能：** 有好主意吗？欢迎提出！请[提交功能请求](https://github.com/google-gemini/gemini-cli/issues/new?template=feature_request.yml)。
- **贡献代码：** 请查阅我们的 [CONTRIBUTING.md](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md) 文件，了解如何提交拉取请求。我们为新贡献者准备了“good first issues”列表。
- **编写文档：** 帮助我们完善文档、教程和示例。
我们对 Gemini CLI 的未来充满期待，欢迎与您共同建设！