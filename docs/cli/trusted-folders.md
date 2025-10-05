# Trusted Folders

The Trusted Folders feature is a security setting that gives you control over which projects can use the full capabilities of the Gemini CLI. It prevents potentially malicious code from running by asking you to approve a folder before the CLI loads any project-specific configurations from it.

## Enabling the Feature

The Trusted Folders feature is **disabled by default**. To use it, you must first enable it in your settings.

Add the following to your user `settings.json` file:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## How It Works: The Trust Dialog

Once the feature is enabled, the first time you run the Gemini CLI from a folder, a dialog will automatically appear, prompting you to make a choice:

- **Trust folder**: Grants full trust to the current folder (e.g., `my-project`).
- **Trust parent folder**: Grants trust to the parent directory (e.g., `safe-projects`), which automatically trusts all of its subdirectories as well. This is useful if you keep all your safe projects in one place.
- **Don't trust**: Marks the folder as untrusted. The CLI will operate in a restricted "safe mode."

Your choice is saved in a central file (`~/.gemini/trustedFolders.json`), so you will only be asked once per folder.

## Why Trust Matters: The Impact of an Untrusted Workspace

When a folder is **untrusted**, the Gemini CLI runs in a restricted "safe mode" to protect you. In this mode, the following features are disabled:

1.  **Workspace Settings are Ignored**: The CLI will **not** load the `.gemini/settings.json` file from the project. This prevents the loading of custom tools and other potentially dangerous configurations.

2.  **Environment Variables are Ignored**: The CLI will **not** load any `.env` files from the project.

3.  **Extension Management is Restricted**: You **cannot install, update, or uninstall** extensions.

4.  **Tool Auto-Acceptance is Disabled**: You will always be prompted before any tool is run, even if you have auto-acceptance enabled globally.

5.  **Automatic Memory Loading is Disabled**: The CLI will not automatically load files into context from directories specified in local settings.

Granting trust to a folder unlocks the full functionality of the Gemini CLI for that workspace.

## Managing Your Trust Settings

If you need to change a decision or see all your settings, you have a couple of options:

- **Change the Current Folder's Trust**: Run the `/permissions` command from within the CLI. This will bring up the same interactive dialog, allowing you to change the trust level for the current folder.

- **View All Trust Rules**: To see a complete list of all your trusted and untrusted folder rules, you can inspect the contents of the `~/.gemini/trustedFolders.json` file in your home directory.

## The Trust Check Process (Advanced)

For advanced users, it's helpful to know the exact order of operations for how trust is determined:

1.  **IDE Trust Signal**: If you are using the [IDE Integration](../ide-integration/index.md), the CLI first asks the IDE if the workspace is trusted. The IDE's response takes highest priority.

2.  **Local Trust File**: If the IDE is not connected, the CLI checks the central `~/.gemini/trustedFolders.json` file.
