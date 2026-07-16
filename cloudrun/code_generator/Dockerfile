# Dockerfile for Jetski/Antigravity Worker Job using the Python SDK
# This container runs the manager script (code_generation_orchestrator/worker.py) which orchestrates
# the code generation and evaluation in-process using google-antigravity.

FROM python:3.11-slim

# 1. Install system utilities (git and nodejs are required for repository and test execution)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    bubblewrap \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2. Set the workspace directory where the repository will be cloned
WORKDIR /app

# 3. Install Python dependencies
# We install google-antigravity and ensure we have correct SDK versions for Vertex/GenAI
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir google-antigravity pydantic "google-genai>=2.0.0" "google-cloud-aiplatform>=1.159.0"

# Set it globally inside the container build (or inject via Cloud Run Environment Variables)
ENV GEMINI_API_KEY=""

# 4. Copy the pipeline orchestration script and prompts
COPY code_generation_orchestrator/ /app/code_generation_orchestrator/
COPY agent_prompts/ /app/agent_prompts/

# 5. Execute script directly
ENTRYPOINT ["python", "/app/code_generation_orchestrator/worker.py"]
