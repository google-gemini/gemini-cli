# Gemini CLI on Termux (Android)

This document describes how to install and run Gemini CLI on Android devices
using Termux.

## Prerequisites

- [Termux](https://termux.dev/) installed on your Android device
- Node.js 20+ (install via `pkg install nodejs-lts`)
- Git (install via `pkg install git`)

## Installation

### From Source (Recommended)

```bash
# Clone the repository
git clone https://github.com/google-gemini/gemini-cli.git
cd gemini-cli

# Install dependencies (skip native modules that don't compile on Android)
npm install --ignore-optional --ignore-scripts

# Build the project
npm run build

# Create the bundle
npm run bundle

# Run Gemini CLI
node bundle/gemini.js --version
```

### Quick Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/google-gemini/gemini-cli/main/scripts/install-termux.sh | bash
```

## Known Issues and Fixes

### 1. Native Module Compilation Failures

**Problem**: Several native modules fail to compile on Android/Termux:

- `keytar` - Requires `libsecret-1` (not available on Android)
- `node-pty` - Requires Android NDK path
- `tree-sitter-bash` - Requires Android NDK path

**Solution**: Use `--ignore-optional --ignore-scripts` flags during
installation. These modules are optional and the CLI works without them.

### 2. Clipboardy TERMUX\_\_PREFIX Detection

**Problem**: The `clipboardy` package checks for `TERMUX__PREFIX` environment
variable, but Termux uses `PREFIX`.

**Solution**: This is fixed in the bundle banner. The fix automatically sets
`TERMUX__PREFIX` from `PREFIX` when running on Android.

### 3. punycode Deprecation Warning

**Problem**: Node.js shows a deprecation warning for the `punycode` module.

**Solution**: This is a harmless warning from a dependency. It can be suppressed
with:

```bash
node --no-deprecation bundle/gemini.js
```

## Limitations on Termux

1. **No PTY support**: Interactive shell features that require pseudo-terminals
   may be limited
2. **No secure keychain**: Credentials are stored in plain text config files
   instead of system keychain
3. **Shell parsing**: Some advanced bash parsing features may fallback to
   simpler methods

## Creating an Alias

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
alias gemini='node ~/gemini-cli/bundle/gemini.js'
```

## Updating

```bash
cd ~/gemini-cli
git pull
npm install --ignore-optional --ignore-scripts
npm run build && npm run bundle
```

## Troubleshooting

### "Cannot find module" errors

Make sure you ran both `npm run build` and `npm run bundle`.

### Permission denied

If you get permission errors, ensure Termux has storage permissions:

```bash
termux-setup-storage
```

### Out of memory during build

Close other apps and try again. The build process requires ~1GB RAM.

## Contributing

If you find additional Termux-specific issues, please report them at:
https://github.com/google-gemini/gemini-cli/issues
