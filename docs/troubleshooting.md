# Troubleshooting Guide

This guide provides solutions to common issues and debugging tips.

## Frequently Asked Questions (FAQs)

- **Q: How do I update the CLI to the latest version?**

  - A: If installed globally via npm, you can usually update with `npm install -g <package-name>@latest`. If run from source, pull the latest changes from the repository and rebuild using `npm run build`.

- **Q: Where are the CLI configuration files stored?**

  - A: The CLI configuration is typically managed within `packages/cli/src/config/`. Refer to `docs/cli/configuration.md` for more details.

- **Q: Where are the server configuration files stored?**
  - A: The server configuration is typically managed within `packages/server/src/config/`. Refer to `docs/server/configuration.md` for more details.

## Common Error Messages and Solutions

- **Error: `EADDRINUSE` (Address already in use) when starting the server.**

  - **Cause:** Another process is already using the port the server is trying to bind to.
  - **Solution:**
    1.  Stop the other process using the port.
    2.  Configure the server to use a different port (see `docs/server/configuration.md`).

- **Error: Command not found (when using the CLI).**

  - **Cause:** The CLI is not correctly installed or not in your system's PATH.
  - **Solution:**
    1.  Ensure the CLI installation was successful.
    2.  If installed globally, check that your npm global binary directory is in your PATH.
    3.  If running from source, ensure you are using the correct command to invoke it (e.g., `node packages/cli/dist/index.js ...`).

- **Error: `MODULE_NOT_FOUND` or import errors.**

  - **Cause:** Dependencies are not installed correctly, or the project hasn't been built.
  - **Solution:**
    1.  Run `npm install` to ensure all dependencies are present.
    2.  Run `npm run build` to compile the project.

- **Error: MacOS Seatbelt "Operation not permitted" or similar.**
  - **Cause:** The application is attempting an operation restricted by the MacOS Seatbelt profile it's running under. This is a security feature of MacOS.
  - **Solution:** The specific Seatbelt profile (`sandbox-macos-minimal.sb` or `sandbox-macos-strict.sb` in `packages/cli/src/utils/`) may need to be adjusted to permit the required operation. This involves understanding the sandbox profile language and carefully considering the security implications of any changes. Modifying sandbox profiles can be complex and should be done with caution.

## Debugging Tips

- **CLI Debugging:**

  - Use the `--verbose` flag (if available) with CLI commands for more detailed output.
  - Check the CLI logs, often found in a user-specific configuration or cache directory.

- **Server Debugging:**

  - Check the server console output for error messages or stack traces.
  - Increase log verbosity if configurable.
  - Use Node.js debugging tools (e.g., `node --inspect`) if you need to step through server-side code.

- **Tool Issues:**

  - If a specific tool is failing, try to isolate the issue by running the simplest possible version of the command or operation the tool performs.
  - For `execute_bash_command`, ensure the command works directly in your shell first.
  - For file system tools, double-check paths and permissions.

- **Pre-flight Checks:**
  - Always run `npm run preflight` before committing code. This can catch many common issues related to formatting, linting, and type errors.

If you encounter an issue not covered here, consider searching the project's issue tracker on GitHub or reporting a new issue with detailed information.
