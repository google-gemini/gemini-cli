# Policy engine example extension

This extension demonstrates how to contribute security rules and safety checkers
to the Gemini CLI Policy Engine.

## Description

The extension uses a `policies/` directory containing `.toml` files to define:

- A rule that requires user confirmation for `rm -rf` commands.
- A rule that denies searching for sensitive files (like `.env`) using `grep`.
- A safety checker that validates file paths for all write operations.

## Structure

- `gemini-extension.json`: The manifest file.
- `policies/`: Contains the `.toml` policy files.

## How to use

1.  Link this extension to your local Gemini CLI installation:

    ```bash
    gemini extensions link packages/cli/src/commands/extensions/examples/policies
    ```

2.  Restart your Gemini CLI session.

3.  **Observe the policies:**
    - Try asking the model to delete a directory: The policy engine will prompt
      you for confirmation due to the `rm -rf` rule.
    - Try asking the model to search for secrets: The `grep` rule will deny the
      request and display the custom deny message.
    - Any file write operation will now be processed through the `allowed-path`
      safety checker.

## Security note

For security, Gemini CLI ignores any `allow` decisions or `yolo` mode
configurations contributed by extensions. This ensures that extensions can
strengthen security but cannot bypass user confirmation.
