## Docker Sandbox Image Access Issue

Some users may experience errors when trying to pull the Gemini sandbox image
from: `us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.10.0`

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
