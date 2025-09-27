# Gemini CLI Go Migration Plan

This document outlines the plan for migrating the Gemini CLI from TypeScript to Go.

## Status

- [x] **In Progress**
- [ ] **Complete**

## Migration Checklist

### Core Functionality

| Feature | Status | Notes |
| --- | --- | --- |
| **Argument Parsing** | ✅ **Done** | Basic argument parsing is implemented using `cobra`. |
| **Configuration Loading** | ✅ **Done** | Configuration loading from `settings.toml` (and deprecated `settings.json`) is implemented and tested. |
| **Authentication** | 🚧 **In Progress** | `CloudShellAuthenticator` is implemented. `OAuth2Authenticator` is implemented but requires the `OAUTH_CLIENT_SECRET` environment variable to be set. |
| **Interactive Mode (TUI)** | ❌ **Not Started** | This is a major component. We will likely need a library like `bubbletea` to build the TUI. |
| **Non-Interactive Mode** | 🚧 **In Progress** | The core logic for handling single prompts is implemented. |
| **Stdin Reading** | ❌ **Not Started** | Implement reading from stdin when input is piped to the CLI. |
| **Command Execution** | 🚧 **In Progress** | The core logic for sending prompts to the Gemini API and handling the response is implemented. |
| **Error Handling** | 🚧 **In Progress** | Basic error handling is in place. More robust error handling is needed. |
| **Sandbox** | ❌ **Not Started** | Implement the sandboxed execution environment. |
| **Update Checker** | ❌ **Not Started** | Implement a mechanism to check for new versions of the CLI. |
| **Auto Update** | ❌ **NotStarted** | Implement a mechanism to automatically update the CLI. |

### Commands

| Command | Status | Notes |
| --- | --- | --- |
| `version` | ✅ **Done** | The `version` command is implemented. |
| `extensions` | ❌ **Not Started** | Implement the `extensions` command for listing and managing extensions. |
| `mcp` | ❌ **Not Started** | Implement the `mcp` command. |

### Other Features

| Feature | Status | Notes |
| --- | --- | --- |
| **Zed Integration** | ❌ **Not Started** | Implement the integration with the Zed editor. |
| **Window Title Management** | ❌ **Not Started** | Implement setting the terminal window title. |
| **Memory Management** | ❌ **Not Started** | Implement memory management and relaunching with adjusted memory settings. |
| **Startup Warnings** | ❌ **Not Started** | Implement displaying startup warnings. |
| **Custom Themes** | ❌ **Not Started** | Implement support for custom themes. |
| **Logging** | ❌ **Not Started** | Implement logging for debugging and auditing. |
| **Kitty Keyboard Protocol** | ❌ **Not Started** | Implement support for the Kitty Keyboard Protocol. |
| **Screen Reader Support** | ❌ **Not Started** | Ensure the CLI is accessible to screen readers. |

## Testing

A comprehensive test suite will be developed alongside the features. The goal is to have a high level of test coverage to ensure the stability and correctness of the Go CLI.

Run tests with:
```bash
go test ./...
```

## Authentication

To use OAuth2 authentication, you must set the `OAUTH_CLIENT_SECRET` environment variable.