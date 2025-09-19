# Extension Releasing

There are two primary ways of releasing extensions to users:

- [Git repository](#releasing-through-a-git-repository)
- [Github Releases](#releasing-through-github-releases)

Git repository releases tend to be the simplest and most flexible approach, while GitHub releases can be more efficient on initial install as they are shipped as single archives instead of requiring a git clone which downloads each file individually. Github releases may also contain platform specific archives if you need to ship platform specific binary files.

## Releasing through a git repository

This is the most flexible and simple option. Users can depend on any ref from your git repo, such as a branch or tag, which allows you to manage multiple release channels. You also can point at any git repository, so your extension does not have to be hosted on github.

For instance, you can maintain a `stable` branch, which users can install this way `gemini extensions install <your-repo-uri> --ref=stable`. Or, you could make this the default by treating your default branch as your stable release, and doing development in a different branch (for instance called `dev`). You can maintain as many branches or tags as you like, providing maximum flexibility for you and your users.

Note that these `ref` arguments can be tags, branches, or even specific commits, which allows users to depend on a specific version of your extension. It is up to you how you want to manage your tags and branches.

Whenever the commit at HEAD of the ref that a user depends on changes, they will be prompted to update the extension. Note that this also allows for easy rollbacks, the HEAD commit is always treated as the latest version regardless of the actual version in the `gemini-extension.json` file. This can also provide a more incremental update as opposed to a github release which always downloads and entirely new copy of the extension.

### Example releasing flow using a git repo

While there are many options for how you want to manage releases using a git flow, we recommend treating your default branch as your "stable" release branch. This means that the default behavior for `gemini extensions install <your-repo-uri>` is to be on the stable release branch.

Lets say you want to maintain three standard release channels, `stable`, `preview`, and `dev`. You would do all your standard development in the `dev` branch. When you are ready to do a preview release, you merge that branch into your `preview` branch. When you are ready to promote your preview branch to stable, you merge `preview` into your stable branch (which might be your default branch or a different branch).

You can also cherry pick changes from one branch into another using `git cherry-pick`, but do note that this will result in your branches having a slightly divergent history from each other, unless you force push changes to your branches on each release to restore the history to a clean slate (which may not be possible for the default branch depending on your repository settings). If you plan on doing cherry picks, you may want to avoid having your default branch be the stable branch to avoid force-pushing to the default branch which should generally be avoided.

## Releasing through Github releases

Gemini CLI extensions can be distributed through [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). This provides a faster and more reliable initial installation experience for users, as it avoids the need to clone the repository.

Each release includes at least one archive file, which contains the full contents of the repo at the tag that it was linked to. Releases may also include [pre-built archives](#custom-pre-built-binaries) if your extension requires some build step or has platform specific binaries attached to it.

### Custom pre-built archives

Custom archives must be attached directly to the github release as assets and must be fully self-contained. This means they should include the entire extension, see the [archive structure](#archive-structure) section for the full requirements.

If your extension is platform-independent, you can provide a single generic asset. In this case, there should be only one asset attached to the release.

Custom archives may also be used if you want to develop your extension within a larger repository, you can build an archive which has a different layout from the repo itself (for instance it might just be an archive of a subdirectory containing the extension).

#### Platform specific archives

To ensure Gemini CLI can automatically find the correct release asset for each platform, you must follow this naming convention. The CLI will search for assets in the following order:

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

#### Archive structure

Archives must be fully contained extensions and have all the standard requirements - specifically the `gemini-extension.json` file must be at the root of the archive.

The rest of the layout should look exactly the same as a typical extension, see [extensions.md](extension.md).

#### Example GitHub Actions workflow

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
