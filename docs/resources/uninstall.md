# Uninstalling the CLI

Your uninstall method depends on how you ran the CLI. Follow the instructions
for either npx or a global npm installation.

## Method 1: Using npx

npx runs packages from a temporary cache without a permanent installation. To
"uninstall" the CLI, you must clear this cache, which will remove gemini-cli and
any other packages previously executed with npx.

The npx cache is a directory named `_npx` inside your main npm cache folder. You
can find your npm cache path by running `npm config get cache`.

**For macOS / Linux**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**For Windows**

_Command Prompt_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Method 2: Using npm (global install)

If you installed the CLI globally (e.g., `npm install -g @google/gemini-cli`),
use the `npm uninstall` command with the `-g` flag to remove it.

```bash
npm uninstall -g @google/gemini-cli
```

This command completely removes the package from your system.

## Method 3: Homebrew

If you installed the CLI globally using Homebrew (e.g.,
`brew install gemini-cli`), use the `brew uninstall` command to remove it.

```bash
brew uninstall gemini-cli
```

## Method 4: MacPorts

If you installed the CLI globally using MacPorts (e.g.,
`sudo port install gemini-cli`), use the `port uninstall` command to remove it.

```bash
sudo port uninstall gemini-cli
```
# Uninstalling the CLI (additional methods)

The following methods are not covered in the standard uninstall guide.

## Method 5: Anaconda

Remove just the CLI package, or delete the entire environment:

```bash
# Option 1: Remove only the CLI package
conda activate gemini_env
npm uninstall -g @google/gemini-cli

# Option 2: Remove the entire Gemini environment
conda deactivate
conda remove -n gemini_env --all
```

## Method 6: Sandbox (Docker/Podman)

Remove the sandbox image from your local registry, replacing `<version>` with
the version you installed:

```bash
# Docker
docker rmi us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:<version>

# Podman
podman rmi us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:<version>
```

## Method 7: Source installation

If you linked a local build with `npm link`, unlink it first before removing
the repository to avoid conflicts with any global npm installation:

```bash
# Unlink the local package
npm unlink packages/cli

# Remove the cloned repository
cd ..
rm -rf gemini-cli
```

## Verify the CLI has been removed

After uninstalling, confirm the CLI is no longer present:

```bash
which gemini       # Should return nothing
gemini --version   # Should return "command not found"
```
