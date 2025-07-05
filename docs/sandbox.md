# Gemini CLI 中的沙箱

本文档提供了Gemini CLI中沙箱的指南，包括先决条件、快速开始和配置。

## 先决条件

在使用沙箱之前，您需要安装和设置Gemini CLI：

```bash
# 使用npm安装gemini-cli
npm install -g @google/gemini-cli

# 验证安装
gemini --version
```

## 沙箱概述

沙箱将潜在危险的操作（如shell命令或文件修改）与您的主机系统隔离，在AI操作和您的环境之间提供安全屏障。

沙箱的好处包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离性**：将文件系统访问限制在项目目录内。
- **一致性**：确保在不同系统上的可重现环境。
- **安全性**：降低使用不受信任的代码或实验性命令时的风险。

## 沙箱方法

您理想的沙箱方法可能因平台和首选的容器解决方案而异。

### 1. macOS Seatbelt（仅限macOS）

使用`sandbox-exec`的轻量级内置沙箱。

**默认配置文件**：`permissive-open` - 限制项目目录外的写入，但允许大多数其他操作。

### 2. 基于容器（Docker/Podman）

具有完整进程隔离的跨平台沙箱。

**注意**：需要在本地构建沙箱镜像或使用组织注册表中的已发布镜像。

## 快速开始

```bash
# 使用命令标志启用沙箱
gemini -s -p "分析代码结构"

# 使用环境变量
export GEMINI_SANDBOX=true
gemini -p "运行测试套件"

# 在settings.json中配置
{
  "sandbox": "docker"
}
```

## 配置

### 启用沙箱（按优先级顺序）

1. **命令标志**：`-s` 或 `--sandbox`
2. **环境变量**：`GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **设置文件**：在`settings.json`中的`"sandbox": true`

### macOS Seatbelt配置文件

内置配置文件（通过`SEATBELT_PROFILE`环境变量设置）：

- `permissive-open`（默认）：写入限制，允许网络
- `permissive-closed`：写入限制，无网络
- `permissive-proxied`：写入限制，通过代理的网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制

## Linux UID/GID处理

沙箱自动处理Linux上的用户权限。使用以下方式覆盖这些权限：

```bash
export SANDBOX_SET_UID_GID=true   # 强制主机UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用UID/GID映射
```

## 故障排除

### 常见问题

**"操作不被允许"**

- 操作需要访问沙箱外部。
- 尝试更宽松的配置文件或添加挂载点。

**缺少命令**

- 添加到自定义Dockerfile。
- 通过`sandbox.bashrc`安装。

**网络问题**

- 检查沙箱配置文件是否允许网络。
- 验证代理配置。

### 调试模式

```bash
DEBUG=1 gemini -s -p "调试命令"
```

### 检查沙箱

```bash
# 检查环境
gemini -s -p "运行shell命令: env | grep SANDBOX"

# 列出挂载
gemini -s -p "运行shell命令: mount | grep workspace"
```

## 安全注意事项

- 沙箱减少但不会消除所有风险。
- 使用允许您工作的最严格配置文件。
- 首次构建后容器开销最小。
- GUI应用程序可能在沙箱中无法工作。

## 相关文档

- [配置](./cli/configuration.md)：完整配置选项。
- [命令](./cli/commands.md)：可用命令。
- [故障排除](./troubleshooting.md)：一般故障排除。
