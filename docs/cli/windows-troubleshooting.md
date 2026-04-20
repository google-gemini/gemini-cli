# Windows Troubleshooting Guide

This guide covers common issues when running Gemini CLI on Windows and how to
resolve them.

## Recommended Setup

For the best experience on Windows, use the following configuration:

- **OS:** Windows 11 (Windows 10 is supported but some UI features may be
  degraded)
- **Terminal:** [Windows Terminal](https://aka.ms/terminal) (ships with Windows
  11; download from the Microsoft Store on Windows 10)
- **Shell:** PowerShell 7+ (`pwsh.exe`) or the built-in Windows PowerShell 5.1
- **Node.js:** v20 or later installed via the official installer or
  `nvm-windows`

## Installation Issues

### `npm install -g @anthropic-ai/gemini-cli` fails with EPERM / EACCES

Windows file permission errors during global npm installs are usually caused by
running the command without administrator privileges.

**Fix:** Open Windows Terminal as Administrator, or configure npm to use a
user-writable prefix:

```powershell
npm config set prefix "$env:APPDATA\npm"
```

Then add `%APPDATA%\npm` to your PATH.

### `gemini` command not found after installation

The global npm bin directory might not be on your PATH.

**Fix:**

```powershell
# Find your npm global bin directory
npm config get prefix

# Add it to your PATH (current session)
$env:PATH += ";$(npm config get prefix)"

# To make it permanent, add via System Properties > Environment Variables
```

### Long path errors during installation

If you see errors about paths exceeding 260 characters:

**Fix:** Enable long path support in Windows:

```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Then restart your terminal.

## Terminal Rendering Issues

### Garbled output or missing colors

If you see broken escape sequences instead of colors:

1. **Use Windows Terminal** instead of the legacy `cmd.exe` console host.
   Windows Terminal supports all ANSI escape sequences natively.

2. **Enable Virtual Terminal Processing** (for legacy conhost):

   ```powershell
   # Check your Windows build
   [System.Environment]::OSVersion.Version
   ```

   VT support requires Windows 10 build 10586 or later.

3. **Set TERM environment variable:**

   ```powershell
   $env:TERM = "xterm-256color"
   ```

### UI elements misaligned or flickering

This typically happens in terminals with limited VT support.

**Fix:**

- Switch to Windows Terminal
- If using VS Code terminal, ensure the integrated terminal type is set to
  Windows Terminal or PowerShell
- Disable alternate buffer mode in settings if your terminal does not support
  it:

  ```json
  {
    "theme": {
      "useAlternateBuffer": false
    }
  }
  ```

### Shift+Enter / Ctrl+Enter not working for multiline input

In VS Code, Cursor, Windsurf, or Antigravity terminals:

**Fix:** Run the `/terminal-setup` command inside Gemini CLI to automatically
configure the correct keybindings.

For other terminals, check if your terminal supports the Kitty keyboard protocol
or configure custom keybindings manually.

## Shell and Command Issues

### Commands fail with "bash not found"

Gemini CLI defaults to PowerShell on Windows for shell command execution. If you
see bash-related errors, the tool description sent to the model may be
incorrect.

**Check your shell configuration:**

```powershell
# Verify PowerShell is being used
$env:ComSpec
```

If `ComSpec` points to an unexpected shell, set it explicitly:

```powershell
$env:ComSpec = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
```

### Git commands are slow

Git on Windows can be slower than on macOS/Linux due to file system differences.

**Fixes:**

```powershell
# Enable Git's filesystem cache
git config --global core.fscache true

# Use parallel index operations
git config --global core.preloadindex true

# Disable file system monitoring if not needed
git config --global core.fsmonitor false
```

### PowerShell execution policy blocks scripts

If you see execution policy errors:

```powershell
# Check current policy
Get-ExecutionPolicy

# Set to allow local scripts (current user only)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## File System Issues

### EBUSY / file locking errors

Windows locks files more aggressively than POSIX systems. Common causes:

- Antivirus real-time scanning
- Windows Search indexer
- Another process has the file open

**Fixes:**

1. Add the project directory to your antivirus exclusions
2. Exclude the `.gemini` directory from Windows Search indexing
3. Close other editors or tools that may have files open
4. Gemini CLI includes automatic retry logic for transient lock errors

### Case sensitivity issues

Windows file systems (NTFS) are case-insensitive by default. This can cause
issues with projects that have files differing only in case.

**Fix:** Enable per-directory case sensitivity (requires Windows 10 1803+):

```powershell
# Enable case sensitivity for a directory
fsutil.exe file setCaseSensitiveInfo "C:\path\to\project" enable
```

### Permission errors on credential files

Gemini CLI stores credentials with restricted permissions. On Windows, the
standard `chmod` is limited, so the CLI uses Windows ACLs instead.

If you encounter permission issues:

```powershell
# Check permissions on the credentials directory
icacls "$env:USERPROFILE\.gemini"

# Fix permissions (restrict to current user)
icacls "$env:USERPROFILE\.gemini" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
```

## Performance Optimization

### Slow startup

Windows file system operations are inherently slower than on Linux/macOS.

**Fixes:**

1. **Exclude from antivirus:** Add the Gemini CLI installation directory and
   your project directory to Windows Defender exclusions:

   ```powershell
   Add-MpExclusion -Path "$(npm config get prefix)\node_modules"
   Add-MpExclusion -Path "C:\path\to\your\project"
   ```

2. **Use an SSD:** Ensure your project and npm global directory are on an SSD.

3. **Disable unnecessary file watchers:** Close tools that watch the file system
   (e.g., Docker Desktop, Dropbox, OneDrive sync for the project folder).

### Slow shell command execution

Shell commands in Gemini CLI use PowerShell by default on Windows. PowerShell
startup can be slow due to profile loading.

The CLI already passes `-NoProfile` to avoid loading your PowerShell profile,
but if you notice slowness:

1. **Use PowerShell 7 (pwsh.exe):** It starts faster than Windows PowerShell
   5.1:

   ```powershell
   winget install Microsoft.PowerShell
   ```

2. **Keep your PATH clean:** Very long PATH variables slow down command
   resolution.

## Sandbox Limitations

The sandbox feature (used to restrict file system access during shell commands)
has limited support on Windows:

- `seatbelt` (macOS) and `runsc` (Linux) sandboxes are not available on Windows
- Docker-based sandboxing works if Docker Desktop is installed

## WSL (Windows Subsystem for Linux)

If you prefer running Gemini CLI inside WSL:

- The CLI automatically detects WSL and adapts its platform detection
- File system operations within the WSL filesystem (`/home/...`) are faster than
  accessing Windows drives (`/mnt/c/...`)
- Clipboard operations use OSC 52 escape sequences when running in WSL, which
  are supported by Windows Terminal

## Getting Help

If you encounter an issue not covered here:

1. Check the [GitHub Issues](https://github.com/anthropics/gemini-cli/issues)
   for existing reports
2. Include the following information when filing a new issue:
   - Windows version (`winver`)
   - Terminal application and version
   - Shell type (PowerShell version: `$PSVersionTable.PSVersion`)
   - Node.js version (`node --version`)
   - The full error message or screenshot
