# Running User Simulation in Docker with External Knowledge Source

This guide explains how to run the User Simulator in a Docker environment while
mounting an external knowledge base. This setup allows the simulator to "learn"
from its interactions and persist that knowledge back to your host machine.

We have provided an automated script that handles the entire setup, execution,
and cleanup process.

## Prerequisites

- **Docker** installed and running.
- **Gemini API Key** (standard `AIza...` key).
- Local checkout of the `gemini-cli` repository.

## Execution via Automation Script (Recommended)

The easiest and most reliable way to run the simulation is using the provided
bash script. This script automatically:

1. Creates a uniquely timestamped workspace folder on your host.
2. Generates a global `settings.json` file to natively bypass the CLI's
   interactive Folder Trust and Authentication dialogs.
3. Builds the sandbox image from your current branch.
4. Mounts the workspace and runs the container with `--init` to gracefully
   handle termination (e.g., `Ctrl+C`).

### Running the Script

Ensure your API key is exported:

```bash
export GEMINI_API_KEY="AIzaSy..."
```

Run the script from the root of the repository:

```bash
# Uses the default prompt ("make a snake game in python")
./scripts/run_simulator_docker.sh

# Or, provide a custom prompt:
./scripts/run_simulator_docker.sh "create a simple react counter component"
```

## Manual Execution Breakdown

If you need to run the simulation manually, here is exactly what the automated
script does under the hood:

### 1. Prepare Workspace & Knowledge Source

```bash
WORKSPACE_DIR="/tmp/gemini_docker_workspace"
mkdir -p "$WORKSPACE_DIR"
touch "$WORKSPACE_DIR/knowledge.md"
chmod -R 777 "$WORKSPACE_DIR"
```

### 2. Bypass Interactive Startup Dialogs

To prevent the simulator from getting stuck on the initial Auth or Folder Trust
screens, generate a global `settings.json` file.

```bash
mkdir -p "$WORKSPACE_DIR/.gemini"
echo '{
  "security": {
    "auth": { "selectedType": "gemini-api-key" },
    "folderTrust": { "enabled": false }
  }
}' > "$WORKSPACE_DIR/.gemini/settings.json"
chmod 777 "$WORKSPACE_DIR/.gemini/settings.json"
```

### 3. Build the Image

```bash
GEMINI_SANDBOX=docker npm run build:sandbox -- -i gemini-cli-simulator:latest
```

### 4. Run the Container

Notice the `--init` flag (for `Ctrl+C` support) and the explicit mount mapping
the `settings.json` file into `/home/node/.gemini/` inside the container.

```bash
docker run -it --rm --init \
  -v "$WORKSPACE_DIR:/workspace" \
  -v "$WORKSPACE_DIR/.gemini/settings.json:/home/node/.gemini/settings.json" \
  -w /workspace \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e GEMINI_DEBUG_LOG_FILE="/workspace/debug.log" \
  gemini-cli-simulator:latest \
  gemini --prompt-interactive "make a snake game in python" \
  --approval-mode plan \
  --simulate-user \
  --knowledge-source "/workspace/knowledge.md"
```

## Verification

Once the simulation completes, verify the results in your workspace folder:

1. **Generated Code:** Check for project files (e.g., `snake.py`).
2. **Persistent Knowledge:** Check `knowledge.md`. You should see new rules
   dynamically appended by the simulator.
3. **Logs:**
   - `debug.log`: Detailed internal LLM decision logic.
   - `interactions_<timestamp>.txt`: Raw screen scrape frames seen by the
     simulator's "eyes".
