# Teleportation

Teleportation lets you move your active AI engineering sessions between
different machines. Unlike sharing a chat transcript, teleporting captures your
entire workspace state, including your plans, tasks, tracker data, and full
activity logs.

By using teleportation, you can start a complex engineering task on your local
laptop and "needlecast" it to a powerful remote server or a different
development environment without losing your progress or context.

## How it works

Teleportation bundles all session-related data from your local Gemini temporary
directory (`~/.gemini/tmp`) into a portable, compressed archive (`.tar.gz`). You
can then transfer this archive to another machine and import it to resume
working exactly where you left off.

The bundle includes:

- Chat history and conversation state.
- AI-generated plans and task statuses.
- Detailed activity logs and tool outputs.
- Project-specific tracker data.

## Export a session

To package your current session for transfer, use the `/teleport export`
command.

1.  Run the export command in your active session:

    ```bash
    /teleport export
    ```

    This creates a file named `gemini-session-<short-id>.tar.gz` in your current
    directory.

2.  Optional: Specify a custom output path:

    ```bash
    /teleport export current my-backup.tar.gz
    ```

3.  Optional: Export a specific session by its ID:
    ```bash
    /teleport export session-abc-123
    ```

## Import a session

To restore a session on a new machine, use the `/teleport import` command.

1.  Move the exported tarball to the new machine.
2.  Run the import command:
    ```bash
    /teleport import ./my-backup.tar.gz
    ```
3.  Resume the imported session:
    ```bash
    /resume <session-id>
    ```
    The import command will display the session ID you need to resume.

## Security and privacy

Teleportation includes several features to ensure your session data remains
secure during transit.

### Encryption

You can encrypt your session bundle using AES-256-GCM. This ensures that even if
the archive is intercepted, the contents cannot be read without your secret.

To use encryption:

1.  Add the `--secret` flag to your export command:
    ```bash
    /teleport export --secret
    ```
2.  Enter a password when prompted. Gemini CLI uses the Scrypt key derivation
    function to protect your password against brute-force attacks.
3.  When importing, add the `--secret` flag again:
    ```bash
    /teleport import ./encrypted-session.tar.gz --secret
    ```

You can also use the `GEMINI_TELEPORT_SECRET` environment variable or a key file
with `--key-file <path>` to provide the secret without an interactive prompt.

### Path traversal protection

During the import process, Gemini CLI automatically scans the archive for
malicious paths. It prevents any files from being extracted outside of the
designated Gemini temporary directory, protecting your system from path
traversal attacks.

## Cloud blob storage

Teleportation supports direct transfers to and from Google Cloud Storage (GCS)
and Amazon S3. This lets you store your sessions in a centralized location that
you control, without committing large log files to your Git repository.

### Prerequisites

To use cloud storage, you must have the corresponding cloud CLI installed and
authenticated on your machine:

- **GCS**: Requires `gcloud` or `gsutil`.
- **S3**: Requires `aws`.

### Cloud usage examples

**Export directly to a bucket:**

```bash
/teleport export --blob gs://my-sessions-bucket/task-alpha.tar.gz
```

**Import directly from a bucket:**

```bash
/teleport import gs://my-sessions-bucket/task-alpha.tar.gz
```

**Secure cloud transfer:**

```bash
/teleport export --secret --blob s3://my-bucket/secure-session.tar.gz
```

## Next steps

- Learn more about [Session management](./session-management.md).
- Explore [Checkpointing](./checkpointing.md) for local file safety.
