# Troubleshooting Guide

This guide provides solutions to common issues and debugging tips.

## Authentication

- **Error: `Failed to login. Message: Request contains an invalid argument`**
  - Users with Google Workspace accounts, or users with Google Cloud accounts
    associated with their Gmail accounts may not be able to activate the free
    tier of the Google Code Assist plan.
  - For Google Cloud accounts, you can work around this by setting
    `GOOGLE_CLOUD_PROJECT` to your project ID.
  - You can also grab an API key from [AI
    Studio](http://aistudio.google.com/app/apikey), which also includes a
    separate free tier.

## Frequently asked questions (FAQs)

- **Q: How do I update Gemini CLI to the latest version?**
  - A: If installed globally via npm, update Gemini CLI using the command `npm install -g @google/gemini-cli@latest`. If run from source, pull the latest changes from the repository and rebuild using `npm run build`.

- **Q: Where are Gemini CLI configuration files stored?**
  - A: The CLI configuration is stored within two `settings.json` files: one in your home directory and one in your project's root directory. In both locations, `settings.json` is found in the `.gemini/` folder. Refer to [CLI Configuration](./cli/configuration.md) for more details.

- **Q: Why don't I see cached token counts in my stats output?**
  - A: Cached token information is only displayed when cached tokens are being used. This feature is available for API key users (Gemini API key or Vertex AI) but not for OAuth users (Google Personal/Enterprise accounts) at this time, as the Code Assist API does not support cached content creation. You can still view your total token usage with the `/stats` command.

## Common error messages and solutions

- **Error: `EADDRINUSE` (Address already in use) when starting an MCP server.**
  - **Cause:** Another process is already using the port the MCP server is trying to bind to.
  - **Solution:**
    Either stop the other process that is using the port or configure the MCP server to use a different port.

- **Error: Command not found (when attempting to run Gemini CLI).**
  - **Cause:** Gemini CLI is not correctly installed or not in your system's PATH.
  - **Solution:**
    1.  Ensure Gemini CLI installation was successful.
    2.  If installed globally, check that your npm global binary directory is in your PATH.
    3.  If running from source, ensure you are using the correct command to invoke it (e.g., `node packages/cli/dist/index.js ...`).

- **Error: `MODULE_NOT_FOUND` or import errors.**
  - **Cause:** Dependencies are not installed correctly, or the project hasn't been built.
  - **Solution:**
    1.  Run `npm install` to ensure all dependencies are present.
    2.  Run `npm run build` to compile the project.

- **Error: "Operation not permitted", "Permission denied", or similar.**
  - **Cause:** If sandboxing is enabled, then the application is likely attempting an operation restricted by your sandbox, such as writing outside the project directory or system temp directory.
  - **Solution:** See [Sandboxing](./cli/configuration.md#sandboxing) for more information, including how to customize your sandbox configuration.

- **CLI is not interactive in "CI" environments**
  - **Issue:** The CLI does not enter interactive mode (no prompt appears) if an environment variable starting with `CI_` (e.g., `CI_TOKEN`) is set. This is because the `is-in-ci` package, used by the underlying UI framework, detects these variables and assumes a non-interactive CI environment.
  - **Cause:** The `is-in-ci` package checks for the presence of `CI`, `CONTINUOUS_INTEGRATION`, or any environment variable with a `CI_` prefix. When any of these are found, it signals that the environment is non-interactive, which prevents the CLI from starting in its interactive mode.
  - **Solution:**: If the `CI_` prefixed variable is not needed for the CLI to function, you can temporarily unset it for the command. e.g., `env -u CI_TOKEN gemini`

## Debugging Tips

When encountering issues, these tips can help you gather more information and pinpoint the root cause:

- **CLI Debugging:**
  - Use the `--debug_mode` (or `-d`) flag when starting the CLI for more verbose output, which can reveal underlying issues.
  - Check the CLI's internal logs, often located in a user-specific configuration or temporary directory (e.g., `~/.gemini/tmp/<project_hash>/`).

- **Core Debugging:**
  - Inspect the console output of the core server for any error messages or stack traces.
  - If configurable, increase the log verbosity of the core component.
  - For Node.js-based core issues, consider using Node.js debugging tools (e.g., `node --inspect`) to step through the server-side code.

- **Tool-Specific Issues:**
  - If a particular tool is failing, try to isolate the issue by running the simplest possible version of the command or operation that the tool performs directly in your shell.
  - For `run_shell_command`, first verify that the command works as expected when executed directly in your terminal.
  - For file system tools (e.g., `read_file`, `write_file`), double-check the absolute paths and ensure correct file permissions.

- **Pre-flight Checks:**
  - Always run `npm run preflight` (or `make preflight`) before committing code. This comprehensive script can catch many common issues related to formatting, linting, and TypeScript type errors early in the development cycle.

## Reporting Issues

If you encounter an issue that is not covered in this troubleshooting guide, or if you believe you've found a bug, please consider reporting it. When reporting, provide as much detail as possible:

- **CLI Version:** Use `/about` to get the exact version.
- **Operating System:** Your OS and version.
- **Steps to Reproduce:** Clear, step-by-step instructions on how to trigger the issue.
- **Expected Behavior:** What you expected to happen.
- **Actual Behavior:** What actually happened, including full error messages and stack traces.
- **Relevant Logs:** Include any relevant output from debug mode or log files.
- **Context:** Any specific project setup, configuration, or environment variables that might be relevant.

You can file a new issue on the [Gemini CLI GitHub repository](https://github.com/google-gemini/gemini-cli/issues/new/choose).
