# Reporting Security Issues

To report a security issue, please use [https://g.co/vulnz](https://g.co/vulnz).
We use g.co/vulnz for our intake, and do coordination and disclosure here on
GitHub (including using GitHub Security Advisory). The Google Security Team will
respond within 5 working days of your report on g.co/vulnz.

[GitHub Security Advisory]:
  https://github.com/google-gemini/gemini-cli/security/advisories

## Shared Responsibility Model

Using Gemini CLI securely requires understanding the shared responsibilities
between Google and the user. Gemini CLI is designed as a developer tool for
single-user environments and does not enforce a security boundary between
multiple user accounts operating on the same device or environment.

### Google's responsibilities

- Delivering a secure and patched application through official distribution
  channels.
- Protecting the backend infrastructure and APIs that Gemini CLI interacts with.
- Providing security features and integrations, such as secure prompt handling
  and API key management within the application's intended scope.

### Customer's responsibilities

- Securing the local host environment, including the operating system and
  filesystem permissions.
- Managing user access and privileges on the device where Gemini CLI is
  installed.
- Safely managing and storing API keys and credentials outside of the CLI's
  configuration directories.
- Ensuring the CLI is executed in a trusted context and not against untrusted
  files or within shared, user-writable directories.

## Security Best Practices

### Multi-user environments

If you use Gemini CLI in an environment shared with other users, we recommend
the following practices to prevent cross-user leakage and privilege escalation:

- **Restrict directory permissions:** Ensure your `~/.gemini` configuration
  directory is readable and writable only by your user account (for example,
  `chmod 700 ~/.gemini`). Gemini CLI requires write permissions to this
  directory.
- **Isolate execution and file paths:** Don't run Gemini CLI from shared
  directories (such as `C:\` on Windows) where other users have write access.
  Additionally, avoid running Gemini CLI against files located in shared
  directories (such as `/tmp` on Linux/macOS). This prevents attackers from
  hijacking the dependency resolution process (for example, via malicious
  `node_modules` folders) or tampering with inputs, executing code in your
  context.
