# 卸载 CLI

<p align="center">
  简体中文 | <a href="../../../docs/Uninstall.md">🌐 English</a>
</p>

您的卸载方法取决于您如何运行 CLI。请按照 npx 或全局 npm 安装的说明进行操作。

## 方法 1：使用 npx

npx 从临时缓存中运行包，无需永久安装。要“卸载”CLI，您必须清除此缓存，这将删除 gemini-cli 和以前使用 npx 执行的任何其他包。

npx 缓存是主 npm 缓存文件夹中名为 `_npx` 的目录。您可以通过运行 `npm config get cache` 找到您的 npm 缓存路径。

**对于 macOS / Linux**

```bash
# 路径通常是 ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**对于 Windows**

_命令提示符_

```cmd
:: 路径通常是 %LocalAppData%\\npm-cache\\_npx
rmdir /s /q "%LocalAppData%\\npm-cache\\_npx"
```

_PowerShell_

```powershell
# 路径通常是 $env:LocalAppData\\npm-cache\\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\\_npx") -Recurse -Force
```

## 方法 2：使用 npm（全局安装）

如果您全局安装了 CLI（例如 `npm install -g @google/gemini-cli`），请使用带有 `-g` 标志的 `npm uninstall` 命令将其删除。

```bash
npm uninstall -g @google/gemini-cli
```

此命令会从您的系统中完全删除该软件包。