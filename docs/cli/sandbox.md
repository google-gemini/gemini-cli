# Sandboxing in Gemini CLI

This document provides a guide to sandboxing in Gemini CLI, including
prerequisites, quickstart, and configuration.

## Prerequisites

Before using sandboxing, you need to install and set up Gemini CLI:

```bash
npm install -g @google/gemini-cli
```

To verify the installation:

```bash
gemini --version
```

## Overview of sandboxing

Sandboxing isolates potentially dangerous operations (such as shell commands or
file modifications) from your host system, providing a security barrier between
AI operations and your environment.

The benefits of sandboxing include:

- **Security**: Prevent accidental system damage or data loss.
- **Isolation**: Limit file system access to project directory.
- **Consistency**: Ensure reproducible environments across different systems.
- **Safety**: Reduce risk when working with untrusted code or experimental
  commands.

## Quickstart

You can enable sandboxing using a command flag, environment variable, or
configuration file.

### Using the command flag

```bash
gemini -s -p "analyze the code structure"
```

### Using an environment variable

**macOS/Linux**

```bash
export GEMINI_SANDBOX=true
gemini -p "run the test suite"
```

**Windows (PowerShell)**

```powershell
$env:GEMINI_SANDBOX="true"
gemini -p "run the test suite"
```

### Configuring via settings.json

```json
{
  "tools": {
    "sandbox": "docker"
  }
}
```

## Configuration

Enable sandboxing using one of the following methods (in order of precedence):

1. **Command flag**: `-s` or `--sandbox`
2. **Environment variable**:
   `GEMINI_SANDBOX=true|docker|podman|sandbox-exec|runsc|lxc`
3. **Settings file**: `"sandbox": true` in the `tools` object of your
   `settings.json` file (for example, `{"tools": {"sandbox": true}}`).

## Sandboxing methods

Your ideal method of sandboxing may differ depending on your platform and your
preferred container solution.

### 1. macOS Seatbelt (macOS only)

Lightweight, built-in sandboxing using `sandbox-exec`.

**Default profile**: `permissive-open` - restricts writes outside project
directory but allows most other operations.

Built-in profiles (set via `SEATBELT_PROFILE` env var):

- `permissive-open` (default): Write restrictions, network allowed
- `permissive-proxied`: Write restrictions, network via proxy
- `restrictive-open`: Strict restrictions, network allowed
- `restrictive-proxied`: Strict restrictions, network via proxy
- `strict-open`: Read and write restrictions, network allowed
- `strict-proxied`: Read and write restrictions, network via proxy

### 2. Container-based (Docker/Podman)

Cross-platform sandboxing with complete process isolation using container
technology. By default, it uses the `ghcr.io/google/gemini-cli:latest` image.

**Prerequisites:**

- Docker or Podman must be installed and running on your system.

**How it works (Workspace directory):**

Inside the sandbox container, your current working directory is mounted at the
**exact same absolute path** as it is on your host machine. For example, if you
run the CLI from `/Users/you/project` on your host machine, the sandbox will
mount your local project folder and operate within `/Users/you/project` inside
the container. This allows the AI to seamlessly read and modify your project
files while remaining isolated from the rest of your system.

**Quick setup:**

To enable Docker sandboxing, run Gemini CLI with the sandbox flag and specify
Docker as the provider:

```bash
# Using the environment variable (Recommended)
export GEMINI_SANDBOX=docker
gemini -p "build the project"

# Or configure it permanently in your settings.json
# {"tools": {"sandbox": "docker"}}
```

**Customizing the Sandbox Image:**

If your project requires specific dependencies, you can specify a custom image
name or have Gemini CLI build one for you automatically. You can use any Docker
or Podman image as your sandbox, provided it has standard shell utilities (like
`bash`) available.

**Option A: Using an existing custom image (e.g., Artifact Registry)**

To configure a custom image that is hosted on a registry (or built locally),
update your `settings.json` to use an object for the sandbox configuration, or
set the `GEMINI_SANDBOX_IMAGE` environment variable.

_Example: Configuring via `settings.json`_

```json
{
  "tools": {
    "sandbox": {
      "command": "docker",
      "image": "us-central1-docker.pkg.dev/my-project/my-repo/my-custom-sandbox:latest"
    }
  }
}
```

_Example: Configuring via environment variable_

```bash
export GEMINI_SANDBOX_IMAGE="us-central1-docker.pkg.dev/my-project/my-repo/my-custom-sandbox:latest"
```

**Option B: Building a local custom image automatically**

If you prefer to define your environment as code, you can provide a Dockerfile
and Gemini CLI will build the image automatically.

1.  Create a `.gemini/sandbox.Dockerfile` in your project root.
2.  Ensure you have the `gh` CLI installed and authenticated (if you are using
    the default `ghcr.io/google/gemini-cli` image as a base).
3.  Run your command with the `BUILD_SANDBOX` environment variable set:

```bash
BUILD_SANDBOX=1 GEMINI_SANDBOX=docker gemini -p "run my custom build"
```

### 3. Windows Native Sandbox (Windows only)

... **Troubleshooting and Side Effects:**

The Windows Native sandbox uses the `icacls` command to set a "Low Mandatory
Level" on files and directories it needs to write to.

- **Persistence**: These integrity level changes are persistent on the
  filesystem. Even after the sandbox session ends, files created or modified by
  the sandbox will retain their "Low" integrity level.
- **Manual Reset**: If you need to reset the integrity level of a file or
  directory, you can use:
  ```powershell
  icacls "C:\path\to\dir" /setintegritylevel Medium
  ```
- **System Folders**: The sandbox manager automatically skips setting integrity
  levels on system folders (like `C:\Windows`) for safety.

### 4. gVisor / runsc (Linux only)

Strongest isolation available: runs containers inside a user-space kernel via
[gVisor](https://github.com/google/gvisor). gVisor intercepts all container
system calls and handles them in a sandboxed kernel written in Go, providing a
strong security barrier between AI operations and the host OS.

**Prerequisites:**

- Linux (gVisor supports Linux only)
- Docker installed and running
- gVisor/runsc runtime configured

When you set `sandbox: "runsc"`, Gemini CLI runs
`docker run --runtime=runsc ...` to execute containers with gVisor isolation.
runsc is not auto-detected; you must specify it explicitly (e.g.
`GEMINI_SANDBOX=runsc` or `sandbox: "runsc"`).

To set up runsc:

1.  Install the runsc binary.
2.  Configure the Docker daemon to use the runsc runtime.
3.  Verify the installation.

### 5. LXC/LXD (Linux only, experimental)

Full-system container sandboxing using LXC/LXD. Unlike Docker/Podman, LXC
containers run a complete Linux system with `systemd`, `snapd`, and other system
services. This is ideal for tools that don't work in standard Docker containers,
such as Snapcraft and Rockcraft.

**Prerequisites**:

- Linux only.
- LXC/LXD must be installed (`snap install lxd` or `apt install lxd`).
- A container must be created and running before starting Gemini CLI. Gemini
  does **not** create the container automatically.

**Quick setup**:

```bash
# Initialize LXD (first time only)
lxd init --auto

# Create and start an Ubuntu container
lxc launch ubuntu:24.04 gemini-sandbox

# Enable LXC sandboxing
export GEMINI_SANDBOX=lxc
gemini -p "build the project"
```

**Custom container name**:

```bash
export GEMINI_SANDBOX=lxc
export GEMINI_SANDBOX_IMAGE=my-snapcraft-container
gemini -p "build the snap"
```

**Limitations**:

- Linux only (LXC is not available on macOS or Windows).
- The container must already exist and be running.
- The workspace directory is bind-mounted into the container at the same
  absolute path — the path must be writable inside the container.
- Used with tools like Snapcraft or Rockcraft that require a full system.

## Tool sandboxing

Tool-level sandboxing provides granular isolation for individual tool executions
(like `shell_exec` and `write_file`) instead of sandboxing the entire Gemini CLI
process.

This approach offers better integration with your local environment for non-tool
tasks (like UI rendering and configuration loading) while still providing
security for tool-driven operations.

### How to turn off tool sandboxing

If you experience issues with tool sandboxing or prefer full-process isolation,
you can disable it by setting `security.toolSandboxing` to `false` in your
`settings.json` file.

```json
{
  "security": {
    "toolSandboxing": false
  }
}
```

<!-- prettier-ignore -->
> [!NOTE]
> Changing the `security.toolSandboxing` setting requires a restart of Gemini
> CLI to take effect.

## Sandbox expansion

Sandbox expansion is a dynamic permission system that lets Gemini CLI request
additional permissions for a command when needed.

When a sandboxed command fails due to permission restrictions (like restricted
file paths or network access), or when a command is proactively identified as
requiring extra permissions (like `npm install`), Gemini CLI will present you
with a "Sandbox Expansion Request."

### How sandbox expansion works

1.  **Detection**: Gemini CLI detects a sandbox denial or proactively identifies
    a command that requires extra permissions.
2.  **Request**: A modal dialog is shown, explaining which additional
    permissions (e.g., specific directories or network access) are required.
3.  **Approval**: If you approve the expansion, the command is executed with the
    extended permissions for that specific run.

This mechanism ensures you don't have to manually re-run commands with more
permissive sandbox settings, while still maintaining control over what the AI
can access.

### Including files outside the workspace

By default, the sandbox only has access to the current project workspace. If you
need the sandbox to have permission to operate on certain files or directories
from the local file system outside of the project workspace, you can mount them
using the `SANDBOX_MOUNTS` environment variable.

Provide a comma-separated list of mount definitions in the format
`from:to:opts`. If `to` is omitted, it defaults to the same path as `from`. If
`opts` is omitted, it defaults to `ro` (read-only). Note that the `from` path
must be an absolute path.

**Example**:

```bash
export SANDBOX_MOUNTS="/path/on/host:/path/in/container:rw,/another/path:ro"
```

## Running inside a Docker container

If you are running Gemini CLI itself from within an official or custom Docker
container and want to enable sandboxing, you must share the host's Docker socket
and ensure your workspace paths align.

1.  **Mount the Docker socket**: Map `/var/run/docker.sock` so the CLI can spawn
    sibling sandbox containers via the host's Docker daemon.
2.  **Align workspace paths**: The path to your workspace inside the container
    must exactly match the absolute path on the host. Because the sandbox
    container is spawned by the host's Docker daemon, it resolves volume mounts
    against the host file system.

**Example**:

```bash
docker run -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /absolute/path/on/host/project:/absolute/path/on/host/project \
  -w /absolute/path/on/host/project \
  -e GEMINI_SANDBOX=docker \
  ghcr.io/google/gemini-cli:latest
```

## Advanced settings

### Custom sandbox flags

For container-based sandboxing, you can inject custom flags into the `docker` or
`podman` command using the `SANDBOX_FLAGS` environment variable. This is useful
for advanced configurations, such as disabling security features for specific
use cases.

**Example (Podman)**:

To disable SELinux labeling for volume mounts, you can set the following:

**macOS/Linux**

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

**Windows (PowerShell)**

```powershell
$env:SANDBOX_FLAGS="--security-opt label=disable"
```

Multiple flags can be provided as a space-separated string:

**macOS/Linux**

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

**Windows (PowerShell)**

```powershell
$env:SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Linux UID/GID handling

The sandbox automatically handles user permissions on Linux. Override these
permissions with:

**macOS/Linux**

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable UID/GID mapping
```

**Windows (PowerShell)**

```powershell
$env:SANDBOX_SET_UID_GID="true"   # Force host UID/GID
$env:SANDBOX_SET_UID_GID="false"  # Disable UID/GID mapping
```

## Troubleshooting

### Common issues

**"Operation not permitted"**

- Operation requires access outside sandbox.
- Try more permissive profile or add mount points.

**Missing commands**

- Add to a custom Dockerfile. Automatic `BUILD_SANDBOX` builds are only
  available when running Gemini CLI from source; npm installs need a prebuilt
  image instead.
- Install via `sandbox.bashrc`.

**Network issues**

- Check sandbox profile allows network.
- Verify proxy configuration.

### Debug mode

```bash
DEBUG=1 gemini -s -p "debug command"
```

<!-- prettier-ignore -->
> [!NOTE]
> If you have `DEBUG=true` in a project's `.env` file, it won't affect
> gemini-cli due to automatic exclusion. Use `.gemini/.env` files for
> gemini-cli specific debug settings.

### Inspect sandbox

```bash
# Check environment
gemini -s -p "run shell command: env | grep SANDBOX"

# List mounts
gemini -s -p "run shell command: mount | grep workspace"
```

## Security notes

- Sandboxing reduces but doesn't eliminate all risks.
- Use the most restrictive profile that allows your work.
- Container overhead is minimal after first build.
- GUI applications may not work in sandboxes.

## Related documentation

- [Configuration](../reference/configuration.md): Full configuration options.
- [Commands](../reference/commands.md): Available commands.
- [Troubleshooting](../resources/troubleshooting.md): General troubleshooting.
