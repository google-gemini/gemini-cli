# Gemini CLI 中的沙盒

<p align="center">
  简体中文 | <a href="../../../docs/sandbox.md">🌐 English</a>
</p>

本文档提供了 Gemini CLI 中沙盒的指南，包括先决条件、快速入门和配置。

## 先决条件

在使用沙盒之前，您需要安装和设置 Gemini CLI：

```bash
npm install -g @google/gemini-cli
```

要验证安装：

```bash
gemini --version
```

## 沙盒概述

沙盒将潜在的危险操作（例如 shell 命令或文件修改）与您的主机系统隔离开来，在 AI 操作和您的环境之间提供了一个安全屏障。

沙盒的好处包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离**：将文件系统访问限制在项目目录中。
- **一致性**：确保在不同系统上具有可重现的环境。
- **安全性**：在使用不受信任的代码或实验性命令时降低风险。

## 沙盒方法

您理想的沙盒方法可能会因您的平台和您首选的容器解决方案而异。

### 1. macOS Seatbelt (仅限 macOS)

使用 `sandbox-exec` 的轻量级内置沙盒。

**默认配置文件**：`permissive-open` - 限制在项目目录之外的写入，但允许大多数其他操作。

### 2. 基于容器 (Docker/Podman)

具有完全进程隔离的跨平台沙盒。

**注意**：需要在本地构建沙盒映像或使用您组织的注册表中已发布的映像。

## 快速入门

```bash
# 使用命令标志启用沙盒
gemini -s -p "分析代码结构"

# 使用环境变量
export GEMINI_SANDBOX=true
gemini -p "运行测试套件"

# 在 settings.json 中配置
{
  "sandbox": "docker"
}
```

## 配置

### 启用沙盒（按优先级顺序）

1. **命令标志**：`-s` 或 `--sandbox`
2. **环境变量**：`GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **设置文件**：在 `settings.json` 中 `"sandbox": true`

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open` (默认)：写入限制，允许网络
- `permissive-closed`：写入限制，无网络
- `permissive-proxied`：写入限制，通过代理访问网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制

### 自定义沙盒标志

对于基于容器的沙盒，您可以使用 `SANDBOX_FLAGS` 环境变量将自定义标志注入到 `docker` 或 `podman` 命令中。这对于高级配置非常有用，例如为特定用例禁用安全功能。

**示例 (Podman)**：

要禁用卷挂载的 SELinux 标记，您可以设置以下内容：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

可以提供多个标志作为以空格分隔的字符串：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

## Linux UID/GID 处理

沙盒会自动处理 Linux 上的用户权限。使用以下命令覆盖这些权限：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用主机 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排除

### 常见问题

**“操作不允许”**

- 操作需要访问沙盒之外的内容。
- 尝试使用更宽松的配置文件或添加挂载点。

**缺少命令**

- 添加到自定义 Dockerfile。
- 通过 `sandbox.bashrc` 安装。

**网络问题**

- 检查沙盒配置文件是否允许网络。
- 验证代理配置。

### 调试模式

```bash
DEBUG=1 gemini -s -p "调试命令"
```

### 检查沙盒

```bash
# 检查环境
gemini -s -p "运行 shell 命令: env | grep SANDBOX"

# 列出挂载
gemini -s -p "运行 shell 命令: mount | grep workspace"
```

## 安全说明

- 沙盒可以减少但不能消除所有风险。
- 使用允许您工作的最严格的配置文件。
- 首次构建后，容器开销很小。
- GUI 应用程序可能无法在沙盒中运行。

## 相关文档

- [配置](./cli/configuration.md)：完整的配置选项。
- [命令](./cli/commands.md)：可用的命令。
- [故障排除](./troubleshooting.md)：常规故障排除。
