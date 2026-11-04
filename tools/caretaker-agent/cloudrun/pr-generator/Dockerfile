# Dockerfile for Jetski/Antigravity Worker Job using the Python SDK
# This container runs the manager script (workflow/worker.py) which orchestrates
# the code generation and evaluation in-process using google-antigravity and Firestore synchronization.

FROM python:3.11-slim

# 1. Install system utilities (git is required for repository operations)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js 20 and npm directly from the official node:20-slim image
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:20-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# 2. Create non-root system user and establish working directory
RUN useradd -m -u 1000 appuser

WORKDIR /app

# 3. Install Python dependencies using requirements.txt for optimized build layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# 4. Copy the pipeline orchestration script and prompts with non-root ownership
COPY --chown=appuser:appuser workflow/ /app/workflow/
COPY --chown=appuser:appuser agent_prompts/ /app/agent_prompts/

# 5. Switch to unprivileged user
USER appuser

# 6. Execute script directly
ENTRYPOINT ["python", "/app/workflow/worker.py"]
