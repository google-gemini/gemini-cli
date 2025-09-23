# Trusted Folders

The Trusted Folders feature is a critical security checkpoint in the Gemini CLI, designed to protect you from running potentially malicious code from untrusted sources.

## The Core Idea: Security First

The Gemini CLI is powerful — it can execute shell commands, read and write files, and interact with external tools. Because a project can contain local configurations (like `.gemini/settings.json` or `.env` files) that can define custom commands or alter the CLI's behavior, there's a risk: if you clone a repository from an untrusted source, it could contain a malicious configuration designed to run harmful commands automatically.

The Trusted Folders feature prevents the CLI from blindly loading and acting on any configuration from a folder it doesn't know is safe.

## Enabling the Feature

To enable the Trusted Folders feature, you need to first enable the `folderTrust` feature.

Add the following to your `settings.json`:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

When you run the Gemini CLI from a folder for which a trust decision has not yet been made, you will be automatically prompted with a trust dialog. This allows you to choose a trust level for the folder.

## The Trust Check Process

Once the feature is enabled, the Gemini CLI determines if a folder is trusted by following this order of precedence every time it starts in a new workspace:

1.  **IDE Trust Signal**: If you are using the [IDE Integration](./ide-integration.md), the CLI first asks the IDE if the current workspace is trusted. Modern IDEs like VS Code have their own built-in workspace trust features. The IDE's response is used immediately if available.

2.  **Local Trust File**: If the IDE is not connected or does not provide a trust signal, the CLI checks the central trust file located at `~/.gemini/trustedFolders.json`. It compares the current workspace path against the rules you have configured in this file.

    > **Note on Inheritance:** Trust is inherited. If you trust a parent folder (e.g., `/Users/myuser/projects/`), all of its subdirectories will also be considered trusted.

## Impact of an Untrusted Workspace

When the Gemini CLI is running in an untrusted folder, it enters a "safe mode" where the following security-sensitive features are disabled:

1.  **Workspace Settings are Ignored**: The CLI will **not** load the `.gemini/settings.json` file from the current project directory. This is the most critical restriction, as it prevents the loading of custom tools, shell commands, and other potentially dangerous configurations.

2.  **Environment Variable Loading is Disabled**: The CLI will **not** load environment variables from a `.env` file located in the workspace. This prevents a malicious repository from setting sensitive variables (like API keys) or dangerous ones (like `PATH`) that could affect command execution.

3.  **Extension Management is Restricted**:
    - You **cannot install, update, or uninstall** extensions while in an untrusted folder. This prevents a malicious project from tricking you into installing a compromised extension.
    - The CLI will **not** automatically check for updates to extensions.

4.  **Tool Auto-Acceptance is Disabled**: The `tools.autoAccept` setting, which allows the CLI to execute tool code without asking for confirmation, is disabled. In an untrusted folder, you will always be prompted before a tool is run, even if you have auto-acceptance enabled globally. This gives you a chance to review the command before it executes.

5.  **Loading Memory from Include Directories is Disabled**: The `context.loadFromIncludeDirectories` setting is ignored. This feature automatically loads files into the context from directories specified in your settings. Disabling it prevents a malicious project from forcing the CLI to read sensitive files from your system.

## How to Manage Trusted Folders

### Using the `/permissions` Command

The `/permissions` command is the primary way to manage trust for your current workspace. Running this command opens an interactive dialog with three options:

- **Trust this folder** (e.g., `my-project`)
- **Trust parent folder** (e.g., `safe-projects`)
- **Don't trust**

This dialog is strictly for making a trust decision about the current folder and does not allow you to manage other paths or view the full list.

### Viewing the Full Trust List

To see a complete list of all your trusted and untrusted folder rules, you must inspect the contents of the `~/.gemini/trustedFolders.json` file directly.
