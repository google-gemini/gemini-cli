[查看英文版](../../../docs/npm.md)

# NPM 集成

Gemini CLI 可以作为 NPM 包安装，从而可以轻松地将其集成到您现有的 Node.js 项目中。

## 安装

要安装 Gemini CLI，请在您的项目目录中运行以下命令：

```bash
npm install @google/gemini-cli
```

## 用法

安装后，您可以使用 `gemini` 命令运行 CLI：

```bash
npx gemini run "列出当前目录中的文件"
```

您还可以在您的 `package.json` 文件中将 Gemini CLI 添加为脚本：

```json
{
  "scripts": {
    "gemini": "gemini"
  }
}
```

然后，您可以使用以下命令运行 CLI：

```bash
npm run gemini run "列出当前目录中的文件"
```

## 以编程方式使用 CLI

您还可以以编程方式将 Gemini CLI 集成到您的 Node.js 应用程序中。有关更多信息，请参阅[核心 API](core/index.md) 文档。