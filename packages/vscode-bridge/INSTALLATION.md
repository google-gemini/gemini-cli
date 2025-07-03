# VSCode Bridge Extension Installation

This extension bridges Gemini Copilot CLI with GitHub Copilot via VSCode's Language Model API.

## Prerequisites

1. **VSCode**: Version **1.90.0 or newer** - Install from [code.visualstudio.com](https://code.visualstudio.com/)
   - The Language Model API is required for this extension
   - Check your version: Help → About Visual Studio Code
2. **GitHub Copilot**: Install the GitHub Copilot extension in VSCode and ensure you have an active subscription
3. **Node.js**: Version 18 or higher

## Installation Steps

### 1. Build and Package the Extension

From the `packages/vscode-bridge` directory:

```bash
# Install dependencies (may show Node.js version warnings - these are safe to ignore)
npm install

# Build the extension
npm run compile

# Package the extension (may show deprecation warnings - these are safe to ignore)
npm run package
```

This will create `gemini-copilot-bridge-0.1.0.vsix` file.

### 2. Install in VSCode

Install the extension using the command line:

```bash
code --install-extension gemini-copilot-bridge-0.1.0.vsix
```

Or install via VSCode UI:
1. Open VSCode
2. Press `Cmd/Ctrl+Shift+P` to open command palette
3. Type "Extensions: Install from VSIX"
4. Select the `gemini-copilot-bridge-0.1.0.vsix` file

### 3. Start the Bridge

After installation, start the bridge:

1. Press `Cmd/Ctrl+Shift+P` to open command palette
2. Type "Gemini Copilot: Start Bridge" and press Enter
3. Wait for "Bridge started on port 7337" notification

## Usage

Once the bridge is running, you can use Gemini Copilot CLI with GitHub Copilot:

```bash
# Select GitHub Copilot as provider
gemini-copilot --provider copilot

# Or use default for gemini-copilot binary
gemini-copilot
```

## Available Commands

- **Gemini Copilot: Start Bridge** - Start the bridge server
- **Gemini Copilot: Stop Bridge** - Stop the bridge server  
- **Gemini Copilot: Restart Bridge** - Restart the bridge server
- **Gemini Copilot: Show Bridge Status** - Show current status

## Troubleshooting

### Installation Issues
- **VSCode version too old**: If you see "VSCode Language Model API is not available", update to VSCode 1.90.0 or newer
- **Node.js version warnings**: If you see warnings about unsupported Node.js engines during `npm install`, these are safe to ignore. The extension works fine with newer Node.js versions.
- **Deprecation warnings**: Warnings about deprecated modules during packaging are safe to ignore.
- **npm install fails**: Try deleting `node_modules` and `package-lock.json`, then run `npm install` again.

### Bridge Not Starting
- Ensure GitHub Copilot extension is installed and authenticated
- Check that you have an active GitHub Copilot subscription
- Try restarting VSCode

### Port Already in Use
The bridge uses port 7337 by default. If this port is in use:
1. Open VSCode settings (`Cmd/Ctrl+,`)
2. Search for "Gemini Copilot Bridge"
3. Change the port number
4. Restart the bridge

### Models Not Available
- Ensure you're signed in to GitHub Copilot
- Check your GitHub Copilot subscription status
- Try running the "GitHub Copilot: Check Status" command in VSCode