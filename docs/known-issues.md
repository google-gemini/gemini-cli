## Docker Sandbox Image Access Issue

Some users may experience errors when trying to pull the Gemini sandbox image
from: `us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:<version>`

### ��� Error Example

Error response from daemon: Get "https://us-docker.pkg.dev/v2/ ": context
deadline exceeded

### ��� Why It Happens

This occurs because the registry is internal to Google and not publicly
accessible.

### ��� Suggested Workaround

- Build the sandbox image locally using:
  ```bash
  npm run build:all

---

---

---

## Gemini CLI Cannot Find Code When Using `gemini code find`

### What happened

When running:

```bash
gemini code find "<query>"

no results appear even if your code exists locally.

**Root cause**
This occurs when the Gemini CLI is not running inside a sandbox environment (gemini sandbox init).
Without sandbox access, Gemini cannot index or search local files.

**Workaround**
1. Initialize a sandbox:
gemini sandbox init

2. Re-run your command:
gemini code find "Pickover formula"

3. Ensure your project files are located in the current working directory.

**Contributor**
@Nimraakram12

**Related Issue**
#11679
```
