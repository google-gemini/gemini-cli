# Sandboxing in the Gemini CLI

This document provides a guide to sandboxing in the Gemini CLI, including
prerequisites, quickstart, and configuration.

## Prerequisites

Before using sandboxing, you need to install and set up the Gemini CLI:

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

## Sandboxing methods

Your ideal method of sandboxing may differ depending on your platform and your
preferred container solution.

### 1. macOS Seatbelt (macOS only)

Lightweight, built-in sandboxing using `sandbox-exec`.

**Default profile**: `permissive-open` - restricts writes outside project
directory but allows most other operations.

### 2. Container-based (Docker/Podman)

Cross-platform sandboxing with complete process isolation.

**Note**: Requires building the sandbox image locally or using a published image
from your organization's registry.

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

## Quickstart

```bash
# Enable sandboxing with command flag
gemini -s -p "analyze the code structure"
```

**Use environment variable**

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

**Configure in settings.json**

```json
{
  "tools": {
    "sandbox": "docker"
  }
}
```

## Configuration

### Enable sandboxing (in order of precedence)

1. **Command flag**: `-s` or `--sandbox`
2. **Environment variable**:
   `GEMINI_SANDBOX=true|docker|podman|sandbox-exec|runsc|lxc`
3. **Settings file**: `"sandbox": true` in the `tools` object of your
   `settings.json` file (e.g., `{"tools": {"sandbox": true}}`).

### macOS Seatbelt profiles

Built-in profiles (set via `SEATBELT_PROFILE` env var):

- `permissive-open` (default): Write restrictions, network allowed
- `permissive-proxied`: Write restrictions, network via proxy
- `restrictive-open`: Strict restrictions, network allowed
- `restrictive-proxied`: Strict restrictions, network via proxy
- `strict-open`: Read and write restrictions, network allowed
- `strict-proxied`: Read and write restrictions, network via proxy

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

## Linux UID/GID handling

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

- Add to custom Dockerfile.
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
