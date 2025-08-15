# Gemini CLI 路线图

[官方 Gemini CLI 路线图]（https://github.com/orgs/google-gemini/projects/11/）

Gemini CLI 是一个开源 AI 代理，可将 Gemini 的强大功能直接带入您的终端。它提供了对 Gemini 的轻量级访问，为您提供从提示到我们模型的最直接路径。

本文档概述了我们制定 Gemini CLI 路线图的方法。在这里，您将找到我们的指导原则以及我们所处的关键领域的细分
专注于发展。我们的路线图不是静态列表，而是一组动态的优先级，这些优先级在我们的 GitHub 问题中实时跟踪。

作为一个 [Apache 2.0 开源项目]（https://github.com/google-gemini/gemini-cli?tab=Apache-2.0-1-ov-file#readme），我们感谢并欢迎 [公共贡献]（https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md），并将优先考虑那些符合我们路线图的贡献。如果您想提出新功能或更改我们的路线图，请先[打开一个问题进行讨论]（https://github.com/google-gemini/gemini-cli/issues/new/choose）。

## 免责声明

本路线图代表我们当前的想法，仅供参考。它不是对未来交付的承诺或保证。任何功能的开发、发布和时间安排都可能发生变化，我们可能会根据社区讨论以及我们的优先事项变化来更新路线图。

## 指导原则

我们的发展遵循以下原则：

- **强大而简单：** 通过直观且易于使用的轻量级命令行界面提供对最先进的 Gemini 模型的访问。
- **可扩展性：** 一种适应性强的代理，可帮助您处理各种用例和环境，并能够在任何地方运行这些代理。
- **智能：** 根据 SWE Bench、Terminal Bench 和 CSAT 等基准测试，Gemini CLI 应该可靠地跻身最佳代理工具之列。
- **免费和开源：** 培育一个蓬勃发展的开源社区，成本不是个人使用的障碍，并且 PR 可以快速合并。这意味着快速解决和关闭问题、拉取请求和讨论帖子。

## 路线图如何运作

我们的路线图直接通过 Github Issues 进行管理。请参阅我们的切入点路线图问题 [此处]（https://github.com/google-gemini/gemini-cli/issues/4191）。这种方法允许透明度，并为您提供一种直接的方式来了解更多信息或参与任何特定计划。对于我们正在积极开发的功能，我们所有的路线图项目都将被标记为 Type：'Feature' 和 Label：'maintainer'，或者对于更详细的任务列表，我们将被标记为 Type：'Task' 和 Label：'maintainer'。

对问题进行组织，提供关键信息一目了然：

- **目标季度：“里程碑”表示预期的交付时间表。
- **特征区域：** “区域/模型”或“区域/工具”等标签对工作进行分类。
- **问题类型：** _Workstream_ => _Epics_ => _Features_ => _Tasks|错误_

要查看我们正在做什么，您可以按这些维度过滤我们的问题。查看我们所有的商品 [点击此处]（https://github.com/orgs/google-gemini/projects/11/views/19）

## 重点领域

为了更好地组织我们的工作，我们将我们的工作分为几个关键特征领域。这些标签用于我们的 GitHub 问题，以帮助你筛选和
查找您感兴趣的计划。

- **身份验证：** 通过 API 密钥、Gemini Code Assist 登录等保护用户访问。
- **模型：** 支持新的 Gemini 模型、多模态、本地执行和性能调优。
- **用户体验：** 提高 CLI 的可用性、性能、交互功能和文档。
- **工具：** 内置工具和 MCP 生态系统。
- **核心：** CLI 的核心功能
- **可扩展性：** 将 Gemini CLI 引入其他表面，例如 GitHub。
- **贡献：** 通过测试自动化和 CI/CD 管道增强来改进贡献流程。
- **平台：** 管理安装、作系统支持和底层 CLI 框架。
- **质量：** 专注于测试、可靠性、性能和整体产品质量。
- **后台代理：** 支持长期运行的自主任务和主动帮助。
- **安全和隐私：** 适用于与安全和隐私相关的所有事情

## 如何贡献

Gemini CLI 是一个开源项目，我们欢迎社区的贡献！无论您是开发人员、设计师，还是只是一个热情的用户，您都可以在此处找到我们的 [社区准则]（https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md） 以了解如何开始使用。参与的方式有很多种：

- **路线图：** 请查看并找到我们的 [路线图]（https://github.com/google-gemini/gemini-cli/issues/4191） 中您想做出贡献的领域。基于此的贡献将最容易集成。
- **报告错误：** 如果您发现问题，请创建一个包含尽可能详细的错误 （https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml）。如果您认为这是一个阻止直接使用 CLI 的关键中断性问题，请将其标记为“priorty/p0”。
- **建议功能：** 有一个好主意吗？我们很想听听！打开 [功能请求]（https://github.com/google-gemini/gemini-cli/issues/new?template=feature_request.yml）。
- **贡献代码：** 查看我们的 [CONTRIBUTING.md]（https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md） 文件，了解如何提交拉取请求的指南。我们为新贡献者准备了一份“良好的第一期”清单。
- **编写文档：** 帮助我们改进文档、教程和示例。
  我们对 Gemini CLI 的未来感到兴奋，并期待与您一起构建它！
