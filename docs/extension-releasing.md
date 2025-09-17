# Extension Releasing

Gemini CLI extensions can be distributed as pre-built binaries through GitHub Releases. This provides a faster and more reliable installation experience for users, as it avoids the need to clone the repository and build the extension from source.

## Asset naming convention

To ensure Gemini CLI can automatically find the correct release asset for each platform, you should follow this naming convention. The CLI will search for assets in the following order:

1.  **Platform and Architecture-Specific:** `{platform}.{arch}.{name}.{extension}`
2.  **Platform-Specific:** `{platform}.{name}.{extension}`
3.  **Generic:** If only one asset is provided, it will be used as a generic fallback.

- `{name}`: The name of your extension.
- `{platform}`: The operating system. Supported values are:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: The architecture. Supported values are:
  - `x64`
  - `arm64`
- `{extension}`: The file extension of the archive (e.g., `.tar.gz` or `.zip`).

**Examples:**

- `darwin.arm64.my-tool.tar.gz` (specific to Apple Silicon Macs)
- `darwin.my-tool.tar.gz` (for all Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

If your extension is platform-independent, you can provide a single generic asset. In this case, there should be only one asset attached to the release.

## Archive structure

The `gemini-extension.json` file must be at the root of the archive.

## Example GitHub Actions workflow

Here is an example of a GitHub Actions workflow that builds and releases a Gemini CLI extension for multiple platforms:

```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Create release assets
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```
