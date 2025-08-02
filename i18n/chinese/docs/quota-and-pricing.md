# Gemini CLI：配额和定价

<p align="center">
  简体中文 | <a href="../../../docs/quota-and-pricing.md">🌐 English</a>
</p>

您的 Gemini CLI 配额和定价取决于您用于向 Google 进行身份验证的帐户类型。此外，配额和定价的计算方式可能会因模型版本、请求和使用的令牌而异。模型使用情况的摘要可通过 `/stats` 命令获得，并在会话结束时退出时显示。有关隐私政策和服务条款的详细信息，请参阅[隐私和服务条款](./tos-privacy.md)。注意：公布的价格为标价；可能会有额外的协商商业折扣。

本文概述了使用不同身份验证方法时适用于 Gemini CLI 的具体配额和定价。

## 1. 使用 Google 登录（Gemini Code Assist 免费套餐）

对于通过使用其 Google 帐户访问 Gemini Code Assist for individuals 进行身份验证的用户：

- **配额：**
  - 每分钟 60 个请求
  - 每天 1000 个请求
  - 令牌使用不适用
- **费用：** 免费
- **详细信息：** [Gemini Code Assist 配额](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli)
- **注意：** 未指定不同模型的特定配额；可能会发生模型回退以保持共享体验质量。

## 2. Gemini API 密钥（未付费）

如果您正在使用免费套餐的 Gemini API 密钥：

- **配额：**
  - 仅限 Flash 模型
  - 每分钟 10 个请求
  - 每天 250 个请求
- **费用：** 免费
- **详细信息：** [Gemini API 速率限制](https://ai.google.dev/gemini-api/docs/rate-limits)

## 3. Gemini API 密钥（付费）

如果您正在使用付费计划的 Gemini API 密钥：

- **配额：** 因定价套餐而异。
- **费用：** 因定价套餐和模型/令牌使用情况而异。
- **详细信息：** [Gemini API 速率限制](https://ai.google.dev/gemini-api/docs/rate-limits)、[Gemini API 定价](https://ai.google.dev/gemini-api/docs/pricing)

## 4. 使用 Google 登录（适用于 Workspace 或获得许可的 Code Assist 用户）

对于 Gemini Code Assist 标准版或企业版的用户，配额和定价基于具有指定许可证席位的固定价格订阅：

- **标准套餐：**
  - **配额：** 每分钟 120 个请求，每天 1500 个
- **企业套餐：**
  - **配额：** 每分钟 120 个请求，每天 2000 个
- **费用：** 固定价格，包含在您的 Gemini for Google Workspace 或 Gemini Code Assist 订阅中。
- **详细信息：** [Gemini Code Assist 配额](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli)、[Gemini Code Assist 定价](https://cloud.google.com/products/gemini/pricing)
- **注意：**
  - 未指定不同模型的特定配额；可能会发生模型回退以保持共享体验质量。
  - Google 开发者计划的成员可能通过其会员资格获得 Gemini Code Assist 许可证。

## 5. Vertex AI（Express 模式）

如果您正在使用 Express 模式的 Vertex AI：

- **配额：** 配额是可变的，具体取决于您的帐户。有关更多详细信息，请参阅来源。
- **费用：** 在您的 Express 模式使用量用完并且您为项目启用计费后，费用将基于标准的 [Vertex AI 定价](https://cloud.google.com/vertex-ai/pricing)。
- **详细信息：** [Vertex AI Express 模式配额](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview#quotas)

## 6. Vertex AI（常规模式）

如果您正在使用标准的 Vertex AI 服务：

- **配额：** 由动态共享配额系统或预购的预配吞吐量决定。
- **费用：** 基于模型和令牌使用情况。请参阅 [Vertex AI 定价](https://cloud.google.com/vertex-ai/pricing)。
- **详细信息：** [Vertex AI 动态共享配额](https://cloud.google.com/vertex-ai/generative-ai/docs/resources/dynamic-shared-quota)

## 7. Google One 和 Ultra 计划，Gemini for Workspace 计划

这些计划目前仅适用于使用由 Google 提供的基于 Web 的产品（例如，Gemini Web 应用程序或 Flow 视频编辑器）。这些计划不适用于为 Gemini CLI 提供支持的 API 使用。我们正在积极考虑在未来支持这些计划。
