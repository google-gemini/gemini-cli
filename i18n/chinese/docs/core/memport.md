# 内存导入处理器

<p align="center">
  简体中文 | <a href="../../../../docs/core/memport.md">🌐 English</a>
</p>

内存导入处理器是一项功能，允许您通过使用 `@file.md` 语法从其他 markdown 文件导入内容来模块化您的 GEMINI.md 文件。

## 概述

此功能使您能够将大型 GEMINI.md 文件分解为更小、更易于管理的部分，这些部分可以在不同上下文中重复使用。导入处理器支持相对路径和绝对路径，并具有内置的安全功能，可防止循环导入并确保文件访问安全。

## 重要限制

**此功能仅支持 `.md` (markdown) 文件。** 尝试导入具有其他扩展名（如 `.txt`、`.json` 等）的文件将导致警告并且导入将失败。

## 语法

使用 `@` 符号后跟要导入的 markdown 文件的路径：

```markdown
# 主 GEMINI.md 文件

这是主要内容。

@./components/instructions.md

更多内容在这里。

@./shared/configuration.md
```

## 支持的路径格式

### 相对路径

- `@./file.md` - 从同一目录导入
- `@../file.md` - 从父目录导入
- `@./components/file.md` - 从子目录导入

### 绝对路径

- `@/absolute/path/to/file.md` - 使用绝对路径导入

## 示例

### 基本导入

```markdown
# 我的 GEMINI.md

欢迎来到我的项目！

@./getting-started.md

## 功能

@./features/overview.md
```

### 嵌套导入

导入的文件本身可以包含导入，从而创建嵌套结构：

```markdown
# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown
# header.md

# 项目标题

@./shared/title.md
```

## 安全功能

### 循环导入检测

处理器会自动检测并防止循环导入：

```markdown
# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- 这将被检测到并被阻止 -->
```

### 文件访问安全

`validateImportPath` 函数可确保仅允许从指定目录进行导入，从而防止访问允许范围之外的敏感文件。

### 最大导入深度

为防止无限递归，有一个可配置的最大导入深度（默认为 5 级）。

## 错误处理

### 非 MD 文件尝试

如果您尝试导入非 markdown 文件，您将看到一条警告：

```markdown
@./instructions.txt <!-- 这将显示警告并失败 -->
```

控制台输出：

```
[WARN] [ImportProcessor] Import processor only supports .md files. Attempting to import non-md file: ./instructions.txt. This will fail.
```

### 缺少文件

如果引用的文件不存在，导入将正常失败，并在输出中显示错误注释。

### 文件访问错误

权限问题或其他文件系统错误将通过适当的错误消息正常处理。

## API 参考

### `processImports(content, basePath, debugMode?, importState?)`

处理 GEMINI.md 内容中的导入语句。

**参数：**

- `content` (string)：要处理导入的内容
- `basePath` (string)：当前文件所在的目录路径
- `debugMode` (boolean, optional)：是否启用调试日志记录（默认为 false）
- `importState` (ImportState, optional)：用于循环导入预防的状态跟踪

**返回：** Promise<string> - 已解析导入的处理后内容

### `validateImportPath(importPath, basePath, allowedDirectories)`

验证导入路径以确保它们是安全的并且在允许的目录中。

**参数：**

- `importPath` (string)：要验证的导入路径
- `basePath` (string)：用于解析相对路径的基本目录
- `allowedDirectories` (string[])：允许的目录路径数组

**返回：** boolean - 导入路径是否有效

## 最佳实践

1. **为导入的组件使用描述性文件名**
2. **保持导入的浅层性** - 避免深度嵌套的导入链
3. **记录您的结构** - 维护导入文件的清晰层次结构
4. **测试您的导入** - 确保所有引用的文件都存在并且可以访问
5. **尽可能使用相对路径** 以获得更好的可移植性

## 故障排除

### 常见问题

1. **导入不起作用**：检查文件是否存在并且具有 `.md` 扩展名
2. **循环导入警告**：检查您的导入结构是否存在循环引用
3. **权限错误**：确保文件是可读的并且在允许的目录中
4. **路径解析问题**：如果相对路径无法正确解析，请使用绝对路径

### 调试模式

启用调试模式以查看导入过程的详细日志记录：

```typescript
const result = await processImports(content, basePath, true);
```
