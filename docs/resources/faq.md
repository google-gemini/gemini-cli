# Frequently asked questions (FAQ)

This page provides answers to common questions and solutions to frequent
problems encountered while using Gemini CLI.

## General issues

This section addresses common questions about Gemini CLI usage, security, and
troubleshooting general errors.

### Why can't I use third-party software (e.g. Claude Code, OpenClaw, OpenCode) with Gemini CLI?

Using third-party software, tools, or services to harvest or piggyback on Gemini
CLI's OAuth authentication to access our backend services is a direct violation
of our [applicable terms and policies](tos-privacy.md). Doing so bypasses our
intended authentication and security structures, and such actions may be grounds
for immediate suspension or termination of your account. If you would like to
use a third-party coding agent with Gemini, the supported and secure method is
to use a Vertex AI or Google AI Studio API key.

### Why am I getting an `API error: 429 - Resource exhausted`?

This error indicates that you have exceeded your API request limit. The Gemini
API has rate limits to prevent abuse and ensure fair usage.

To resolve this, you can:

- **Check your usage:** Review your API usage in the Google AI Studio or your
  Google Cloud project dashboard.
- **Optimize your prompts:** If you are making many requests in a short period,
  try to batch your prompts or introduce delays between requests.
- **Request a quota increase:** If you consistently need a higher limit, you can
  request a quota increase from Google.

### Why am I getting an `ERR_REQUIRE_ESM` error when running `npm run start`?

This error typically occurs in Node.js projects when there is a mismatch between
CommonJS and ES Modules.

This is often due to a misconfiguration in your `package.json` or
`tsconfig.json`. Ensure that:

1.  Your `package.json` has `"type": "module"`.
2.  Your `tsconfig.json` has `"module": "NodeNext"` or a compatible setting in
    the `compilerOptions`.

If the problem persists, try deleting your `node_modules` directory and
`package-lock.json` file, and then run `npm install` again.

### Why don't I see cached token counts in my stats output?

Cached token information is only displayed when cached tokens are being used.
This feature is available for API key users (Gemini API key or Google Cloud
Vertex AI) but not for OAuth users (such as Google Personal/Enterprise accounts
like Google Gmail or Google Workspace, respectively). This is because the Gemini
Code Assist API does not support cached content creation. You can still view
your total token usage using the `/stats` command in Gemini CLI.

### Why am I getting 'You must be a named user on your organization's Gemini Code Assist Standard edition subscription' error?

This error might occur if Gemini CLI detects the `GOOGLE_CLOUD_PROJECT` or
`GOOGLE_CLOUD_PROJECT_ID` environment variable is defined. Setting these
variables forces an organization subscription check. This might be an issue if
you are using an individual Google account not linked to an organizational
subscription.

- **Individual users:** Unset the `GOOGLE_CLOUD_PROJECT` and
  `GOOGLE_CLOUD_PROJECT_ID` environment variables. Check and remove these
  variables from your shell configuration files (for example, `.bashrc`,
  `.zshrc`) and any `.env` files. If this doesn't resolve the issue, try using a
  different Google account.
- **Organizational users:** Ask your Google Cloud administrator to add you to
  your organization's Gemini Code Assist subscription.

### Why am I getting a 'Failed to sign in. Message: Your current account is not eligible... because it is not currently available in your location' error?

Gemini CLI does not currently support your location. For a full list of
supported locations, see the
[Available locations](https://developers.google.com/gemini-code-assist/resources/available-locations#americas)
page for Gemini Code Assist for individuals.

### Why am I getting a 'Failed to sign in. Message: Request contains an invalid argument' error?

Users with Google Workspace accounts or Google Cloud accounts associated with
their Gmail accounts may not be able to activate the free tier of the Google
Code Assist plan. For Google Cloud accounts, you can work around this by setting
`GOOGLE_CLOUD_PROJECT` to your project ID. Alternatively, you can obtain the
Gemini API key from [Google AI Studio](http://aistudio.google.com/app/apikey),
which also includes a separate free tier.

### Why am I getting an `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` or `unable to get local issuer certificate` error?

You may be on a corporate network with a firewall that intercepts and inspects
SSL/TLS traffic. This often requires a custom root CA certificate to be trusted
by Node.js.

First try setting `NODE_USE_SYSTEM_CA`; if that does not resolve the issue, set
`NODE_EXTRA_CA_CERTS`:

- Set the `NODE_USE_SYSTEM_CA=1` environment variable to tell Node.js to use the
  operating system's native certificate store (where corporate certificates are
  typically already installed). Example: `export NODE_USE_SYSTEM_CA=1` (Windows
  PowerShell: `$env:NODE_USE_SYSTEM_CA=1`)
- Set the `NODE_EXTRA_CA_CERTS` environment variable to the absolute path of
  your corporate root CA certificate file. Example:
  `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt` (Windows
  PowerShell: `$env:NODE_EXTRA_CA_CERTS="C:\path\to\your\corporate-ca.crt"`)

### Why am I getting an `EADDRINUSE` (Address already in use) error when starting an MCP server?

Another process is already using the port that the MCP server is trying to bind
to. Either stop the other process that is using the port or configure the MCP
server to use a different port.

### Why am I getting `MODULE_NOT_FOUND` or import errors?

Dependencies are not installed correctly, or the project hasn't been built.

1. Run `npm install` to ensure all dependencies are present.
2. Run `npm run build` to compile the project.
3. Verify that the build completed successfully with `npm run start`.

### Why am I getting 'Operation not permitted' or 'Permission denied' errors?

When sandboxing is enabled, Gemini CLI may attempt operations that are
restricted by your sandbox configuration, such as writing outside the project
directory or system temp directory. Refer to the
[Configuration: Sandboxing](../cli/sandbox.md) documentation for more
information, including how to customize your sandbox configuration.

### Why isn't Gemini CLI running in interactive mode in my CI environment?

The Gemini CLI does not enter interactive mode (no prompt appears) if an
environment variable starting with `CI_` (e.g., `CI_TOKEN`) is set. The
underlying UI framework detects these variables and assumes a non-interactive CI
environment. If the `CI_` prefixed variable is not needed for the CLI to
function, you can temporarily unset it for the command. e.g.,
`env -u CI_TOKEN gemini`.

### Why doesn't DEBUG mode work when I set it in my project's `.env` file?

The `DEBUG` and `DEBUG_MODE` variables are automatically excluded from project
`.env` files to prevent interference with gemini-cli behavior. Use a
`.gemini/.env` file instead, or configure the `advanced.excludedEnvVars` setting
in your `settings.json` to exclude fewer variables.

## Installation and updates

### How do I check which version of Gemini CLI I'm currently running?

You can check your current Gemini CLI version using one of these methods:

- Run `gemini --version` or `gemini -v` from your terminal
- Check the globally installed version using your package manager:
  - npm: `npm list -g @google/gemini-cli`
  - pnpm: `pnpm list -g @google/gemini-cli`
  - yarn: `yarn global list @google/gemini-cli`
  - bun: `bun pm ls -g @google/gemini-cli`
  - homebrew: `brew list --versions gemini-cli`
- Inside an active Gemini CLI session, use the `/about` command

### How do I update Gemini CLI to the latest version?

If you installed it globally via `npm`, update it using the command
`npm install -g @google/gemini-cli@latest`. If you compiled it from source, pull
the latest changes from the repository, and then rebuild using the command
`npm run build`.

### Why am I getting a 'Command not found' error when attempting to run `gemini`?

Gemini CLI is not correctly installed or it is not in your system's `PATH`.

- If you installed `gemini` globally, check that your `npm` global binary
  directory is in your `PATH`. You can update Gemini CLI using the command
  `npm install -g @google/gemini-cli@latest`.
- If you are running `gemini` from source, ensure you are using the correct
  command to invoke it (e.g., `node packages/cli/dist/index.js ...`). To update
  Gemini CLI, pull the latest changes from the repository, and then rebuild
  using the command `npm run build`.

### Why am I seeing `npm WARN deprecated node-domexception@1.0.0` or `npm WARN deprecated glob` during install or update?

When installing or updating the Gemini CLI globally, you might see deprecation
warnings regarding `node-domexception` or old versions of `glob`. These warnings
occur because some dependencies rely on older package versions. Since Gemini CLI
requires Node.js 20 or higher, the platform's native features are used, making
these warnings purely informational. They are harmless and can be safely
ignored. Your installation or update will complete successfully and function
properly.

## Platform-specific issues

### Why does the CLI crash on Windows when I run a command like `chmod +x`?

Commands like `chmod` are specific to Unix-like operating systems (Linux,
macOS). They are not available on Windows by default.

To resolve this, you can:

- **Use Windows-equivalent commands:** Instead of `chmod`, you can use `icacls`
  to modify file permissions on Windows.
- **Use a compatibility layer:** Tools like Git Bash or Windows Subsystem for
  Linux (WSL) provide a Unix-like environment on Windows where these commands
  will work.

## Configuration

### How do I configure my `GOOGLE_CLOUD_PROJECT`?

You can configure your Google Cloud Project ID using an environment variable.

Set the `GOOGLE_CLOUD_PROJECT` environment variable in your shell:

**macOS/Linux**

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

**Windows (PowerShell)**

```powershell
$env:GOOGLE_CLOUD_PROJECT="your-project-id"
```

To make this setting permanent, add this line to your shell's startup file
(e.g., `~/.bashrc`, `~/.zshrc`).

### What is the best way to store my API keys securely?

Exposing API keys in scripts or checking them into source control is a security
risk.

To store your API keys securely, you can:

- **Use a `.env` file:** Create a `.env` file in your project's `.gemini`
  directory (`.gemini/.env`) and store your keys there. Gemini CLI will
  automatically load these variables.
- **Use your system's keyring:** For the most secure storage, use your operating
  system's secret management tool (like macOS Keychain, Windows Credential
  Manager, or a secret manager on Linux). You can then have your scripts or
  environment load the key from the secure storage at runtime.

### Where are the Gemini CLI configuration and settings files stored?

The Gemini CLI configuration is stored in two `settings.json` files:

1.  In your home directory: `~/.gemini/settings.json`.
2.  In your project's root directory: `./.gemini/settings.json`.

Refer to [Gemini CLI Configuration](../reference/configuration.md) for more
details.

## Google AI Pro/Ultra and subscription FAQs

### Where can I learn more about my Google AI Pro or Google AI Ultra subscription?

To learn more about your Google AI Pro or Google AI Ultra subscription, visit
**Manage subscription** in your [subscription settings](https://one.google.com).

### How do I know if I have higher limits for Google AI Pro or Ultra?

If you're subscribed to Google AI Pro or Ultra, you automatically have higher
limits to Gemini Code Assist and Gemini CLI. These are shared across Gemini CLI
and agent mode in the IDE. You can confirm you have higher limits by checking if
you are still subscribed to Google AI Pro or Ultra in your
[subscription settings](https://one.google.com).

### What is the privacy policy for using Gemini Code Assist or Gemini CLI if I've subscribed to Google AI Pro or Ultra?

To learn more about your privacy policy and terms of service governed by your
subscription, visit
[Gemini Code Assist: Terms of Service and Privacy Policies](https://developers.google.com/gemini-code-assist/resources/privacy-notices).

### I've upgraded to Google AI Pro or Ultra but it still says I am hitting quota limits. Is this a bug?

The higher limits in your Google AI Pro or Ultra subscription are for Gemini 2.5
across both Gemini 2.5 Pro and Flash. They are shared quota across Gemini CLI
and agent mode in Gemini Code Assist IDE extensions. You can learn more about
quota limits for Gemini CLI, Gemini Code Assist and agent mode in Gemini Code
Assist at
[Quotas and limits](https://developers.google.com/gemini-code-assist/resources/quotas).

### If I upgrade to higher limits for Gemini CLI and Gemini Code Assist by purchasing a Google AI Pro or Ultra subscription, will Gemini start using my data to improve its machine learning models?

Google does not use your data to improve Google's machine learning models if you
purchase a paid plan. Note: If you decide to remain on the free version of
Gemini Code Assist, Gemini Code Assist for individuals, you can also opt out of
using your data to improve Google's machine learning models. See the
[Gemini Code Assist for individuals privacy notice](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals)
for more information.

## Debugging tips

### How do I debug issues with Gemini CLI?

- **CLI debugging:**
  - Use the `--debug` flag for more detailed output. In interactive mode, press
    F12 to view the debug console.
  - Check the CLI logs, often found in a user-specific configuration or cache
    directory.

- **Core debugging:**
  - Check the server console output for error messages or stack traces.
  - Increase log verbosity if configurable. For example, set the `DEBUG_MODE`
    environment variable to `true` or `1`.
  - Use Node.js debugging tools (e.g., `node --inspect`) if you need to step
    through server-side code.

- **Tool issues:**
  - If a specific tool is failing, try to isolate the issue by running the
    simplest possible version of the command or operation the tool performs.
  - For `run_shell_command`, check that the command works directly in your shell
    first.
  - For _file system tools_, verify that paths are correct and check the
    permissions.

- **Pre-flight checks:**
  - Always run `npm run preflight` before committing code. This can catch many
    common issues related to formatting, linting, and type errors.

## Not seeing your question?

Search the
[Gemini CLI Q&A discussions on GitHub](https://github.com/google-gemini/gemini-cli/discussions/categories/q-a)
or
[start a new discussion on GitHub](https://github.com/google-gemini/gemini-cli/discussions/new?category=q-a)
