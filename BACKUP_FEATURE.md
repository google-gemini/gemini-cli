# Automatic Backup System for Delete Commands

## Overview

The Gemini CLI now includes an automatic backup system that creates timestamped backups of files and directories before they are deleted by shell commands.

## Features

- **Automatic Detection**: Detects delete commands (`rm`, `del`, `rmdir`, etc.) in both simple and compound commands
- **Cross-Platform**: Works on Linux, macOS, and Windows
- **Timestamped Backups**: Creates backups with ISO timestamps for easy identification
- **Directory Support**: Handles both files and directories
- **Configurable**: Can be enabled/disabled via configuration
- **Compound Commands**: Works with chained commands like `touch file.txt && rm file.txt`

## Supported Delete Commands

- **Unix/Linux**: `rm`, `rmdir`, `unlink`
- **Windows**: `del`, `erase`, `rd`
- **PowerShell**: `Remove-Item`, `Remove-ItemProperty`
- **Alternative**: `trash`

## Configuration

Add to your Gemini CLI configuration:

```yaml
enableDeleteBackups: true  # default: true
```

To disable backups:

```yaml
enableDeleteBackups: false
```

## How It Works

1. **Command Analysis**: The system parses shell commands to detect delete operations
2. **Backup Injection**: For delete commands, backup logic is injected into the shell execution
3. **Timestamped Storage**: Files are backed up to `.gemini/backups/` with timestamps
4. **User Feedback**: Backup creation is reported to the user

## Example Usage

```bash
# Simple delete
rm important-file.txt
# → Creates: .gemini/backups/important-file.txt.2025-07-02T14-30-45-123Z.backup

# Compound command
touch temp.txt && rm temp.txt
# → Creates: .gemini/backups/temp.txt.2025-07-02T14-30-45-456Z.backup

# Multiple files
rm file1.txt file2.txt
# → Creates backups for both files
```

## Backup Location

Backups are stored in:
```
.gemini/backups/
├── file1.txt.2025-07-02T14-30-45-123Z.backup
├── file2.txt.2025-07-02T14-31-22-456Z.backup
└── directory.2025-07-02T14-32-10-789Z.backup
```

## Technical Implementation

- **File Location**: `packages/core/src/tools/shell.ts`
- **Config Location**: `packages/core/src/config/config.ts`
- **Test Coverage**: `packages/core/src/tools/shell.test.ts`

The system works by:
1. Parsing commands to detect delete operations
2. Injecting shell-native backup commands before delete execution
3. Using conditional logic to only backup files that exist
4. Providing user feedback about backup creation

## Limitations

- Backup is triggered by command execution, not file existence checking beforehand
- Complex shell scripting patterns may not be fully parsed
- Backup messages are informational; actual backup depends on file existence at execution time

## Future Enhancements

- Backup retention policies (auto-cleanup old backups)
- Backup compression for large files/directories
- Integration with system trash/recycle bin
- Enhanced parsing for complex shell patterns