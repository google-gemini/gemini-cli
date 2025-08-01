🌐 [查看英文版](../../../../docs/cli/token-caching.md)

# 令牌缓存和成本优化

当使用 API 密钥身份验证（Gemini API 密钥或 Vertex AI）时，Gemini CLI 会通过令牌缓存自动优化 API 成本。此功能会重用以前的系统指令和上下文，以减少后续请求中处理的令牌数量。

**令牌缓存适用于：**

- API 密钥用户（Gemini API 密钥）
- Vertex AI 用户（已设置项目和位置）

**令牌缓存不适用于：**

- OAuth 用户（Google 个人/企业帐户）- Code Assist API 目前不支持创建缓存内容

您可以使用 `/stats` 命令查看您的令牌使用情况和缓存的令牌节省量。当有可用的缓存令牌时，它们将显示在统计信息输出中。