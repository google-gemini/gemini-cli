# Release extensions

Release Gemini CLI extensions to your users through a Git repository or GitHub
Releases.

Git repository releases are the simplest approach and offer the most flexibility
for managing development branches. GitHub Releases are more efficient for
initial installations because they ship as single archives rather than requiring
a full `git clone`. Use GitHub Releases if you need to include platform-specific
binary files.

## List your extension in the gallery

The [Gemini CLI extension gallery](https://geminicli.com/extensions/browse/)
automatically indexes public extensions to help users discover your work. You
don't need to submit an issue or email us to list your extension.

To have your extension automatically discovered and listed:

1.  **Use a public repository:** Ensure your extension is hosted in a public
    GitHub repository.
2.  **Add the GitHub topic:** Add the `gemini-cli-extension` topic to your
    repository's **About** section. Our crawler uses this topic to find new
    extensions.
3.  **Place the manifest at the root:** Ensure your `gemini-extension.json` file
    is in the absolute root of the repository or the release archive.

Our system crawls tagged repositories daily. Once you tag your repository, your
extension will appear in the gallery if it passes validation.

## Release through a Git repository

Releasing through Git is the most flexible option. Create a public Git
repository and provide the URL to your users. They can then install your
extension using `gemini extensions install <your-repo-uri>`.

Users can optionally depend on a specific branch, tag, or commit using the
`--ref` argument. For example:

```bash
gemini extensions install <your-repo-uri> --ref=stable
```

Whenever you push commits to the referenced branch, the CLI prompts users to
update their installation. The `HEAD` commit is always treated as the latest
version.

### Manage release channels

You can use branches or tags to manage different release channels, such as
`stable`, `preview`, or `dev`.

We recommend using your default branch as the stable release channel. This
ensures that the default installation command always provides the most reliable
version of your extension. You can then use a `dev` branch for active
development and merge it into the default branch when you are ready for a
release.

## Release through GitHub Releases

Distributing extensions through
[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
provides a faster installation experience by avoiding a repository clone.

Gemini CLI checks for updates by looking for the **Latest** release on GitHub.
Users can also install specific versions using the `--ref` argument with a
release tag. Use the `--pre-release` flag to install the latest version even if
it isn't marked as **Latest**.

### Custom pre-built archives

You can attach custom archives directly to your GitHub Release as assets. This
is useful if your extension requires a build step or includes platform-specific
binaries.

Custom archives must be fully self-contained and follow the required
[archive structure](#archive-structure). If your extension is
platform-independent, provide a single generic asset.

#### Platform-specific archives

To let Gemini CLI find the correct asset for a user's platform, use the
following naming convention:

1.  **Platform and architecture-specific:**
    `{platform}.{arch}.{name}.{extension}`
2.  **Platform-specific:** `{platform}.{name}.{extension}`
3.  **Generic:** A single asset will be used as a fallback if no specific match
    is found.

Use these values for the placeholders:

- `{name}`: Your extension name.
- `{platform}`: Use `darwin` (macOS), `linux`, or `win32` (Windows).
- `{arch}`: Use `x64` or `arm64`.
- `{extension}`: Use `.tar.gz` or `.zip`.

**Examples:**

- `darwin.arm64.my-tool.tar.gz` (specific to Apple Silicon Macs)
- `darwin.my-tool.tar.gz` (fallback for all Macs, e.g. Intel)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archive structure

Archives must be fully contained extensions. The `gemini-extension.json` file
must be at the root of the archive. The rest of the layout should match a
standard extension structure.

#### Example GitHub Actions workflow

Use this example workflow to build and release your extension for multiple
platforms:

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
