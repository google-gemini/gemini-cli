# 🤖 Gemini CLI - Termux Edition

> **Google Gemini CLI with Android Termux compatibility patches**

[![npm](https://img.shields.io/npm/v/@mmmbuto/gemini-cli?style=flat-square&logo=npm)](https://www.npmjs.com/package/@mmmbuto/gemini-cli)
[![downloads](https://img.shields.io/npm/dt/@mmmbuto/gemini-cli?style=flat-square)](https://www.npmjs.com/package/@mmmbuto/gemini-cli)
[![ko-fi](https://img.shields.io/badge/☕_Support-Ko--fi-FF5E5B?style=flat-square&logo=ko-fi)](https://ko-fi.com/dionanos)

---

## What This Is

**Temporary fork** of Google Gemini CLI with minimal patches for Android Termux
compatibility.

### ⏳ Sunset Plan

We have submitted a PR to upstream Google Gemini CLI to add native Termux
support. **Once Google merges our fix, this fork will be discontinued** and
users should migrate to the official `@google/gemini-cli` package.

This fork exists **only** as a temporary solution until official Termux support
is available.

### What We Do:

✅ **Track official Google Gemini CLI**
(https://github.com/google-gemini/gemini-cli) ✅ **Apply minimal compatibility
patches** for Termux-specific issues ✅ **Bundle for Android ARM64** with
working native module alternatives ✅ **Package as npm** for easy installation
✅ **Maintain full Apache 2.0 compliance** with Google attribution

### What We DON'T Do:

❌ **NO new features** ❌ **NO behavior modifications** (works exactly like
upstream) ❌ **NO replacement** of official Gemini CLI

### 🔧 Compatibility Patches

We only apply patches for issues that:

- **Prevent Gemini CLI from working on Termux**
- **Are not addressed by upstream** (Termux is not officially supported)
- **Are minimal and well-documented**

**Current patches**:

- `esbuild.config.js`: Auto-set `TERMUX__PREFIX` for clipboardy detection
- Skip optional native modules: `keytar`, `node-pty`, `tree-sitter-bash`
- Build with `--ignore-optional --ignore-scripts` flags

See [docs/TERMUX.md](./docs/TERMUX.md) for complete technical details.

**Found an issue?** Open an
[issue](https://github.com/DioNanos/gemini-cli/issues).

---

## 📋 Prerequisites

```bash
# Update Termux packages
pkg update && pkg upgrade -y

# Install Node.js
pkg install nodejs-lts -y

# Verify
node --version  # v20+
```

**Requirements:**

- Android 7+ (Termux)
- ARM64 architecture
- Node.js ≥ 20.0.0
- ~25MB storage

---

## 📦 Installation

### Via npm (Recommended)

```bash
npm install -g @mmmbuto/gemini-cli
```

### Verify Installation

```bash
gemini --version
# Output: 0.20.0-nightly.20251201.2fe609cb6

gemini --help
# Shows available commands
```

### Build from Source (Optional)

```bash
git clone https://github.com/DioNanos/gemini-cli.git
cd gemini-cli
npm install --ignore-optional --ignore-scripts
npm run build && npm run bundle
node bundle/gemini.js --version
```

---

## 🚀 Usage

Same as official Gemini CLI. Authentication, commands, and features work
identically.

```bash
# Start interactive mode
gemini

# Non-interactive mode
gemini "Explain this codebase"

# Use specific model
gemini -m gemini-2.5-flash

# Get help
gemini --help
```

See [Google's official documentation](https://geminicli.com/docs/) for complete
usage guide.

---

## 📚 Documentation

- **[Termux Installation Guide](docs/TERMUX.md)** - Complete setup and
  troubleshooting
- **[Official Gemini CLI Docs](https://geminicli.com/docs/)** - Full feature
  documentation
- **[Upstream Repository](https://github.com/google-gemini/gemini-cli)** -
  Google's official repo

---

## 🔄 Upstream Tracking

This fork tracks `google-gemini/gemini-cli` and rebases weekly.

- **Current upstream**: `v0.20.0-nightly.20251201.2fe609cb6`
- **Last sync**: 2025-12-02
- **Divergent files**: `esbuild.config.js`, `docs/TERMUX.md`, `package.json`,
  `README.md`

---

## ⚠️ Known Limitations

- **No PTY support** - Interactive shell features may be limited
- **No secure keychain** - Credentials stored in plain text config files
- **No tree-sitter bash parsing** - Fallback to simpler shell parsing methods

All core functionality (AI chat, tools, MCP, extensions) works perfectly.

---

## 🤝 Contributing

This is a **temporary compatibility fork**. For feature requests or general
bugs, please report to
[upstream Gemini CLI](https://github.com/google-gemini/gemini-cli/issues).

For **Termux-specific issues**, open an
[issue here](https://github.com/DioNanos/gemini-cli/issues).

---

## 📄 License

Apache License 2.0 - Same as upstream Google Gemini CLI.

**Original project**: Google LLC - https://github.com/google-gemini/gemini-cli

**Termux patches**: @DioNanos - https://github.com/DioNanos/gemini-cli

---

## 🔗 Links

- **npm Package**: https://www.npmjs.com/package/@mmmbuto/gemini-cli
- **GitHub Repository**: https://github.com/DioNanos/gemini-cli
- **Upstream (Google)**: https://github.com/google-gemini/gemini-cli
- **Latest Release**: https://github.com/DioNanos/gemini-cli/releases/latest
- **Upstream PR**: Pending Google review for native Termux support
