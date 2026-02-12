# Pre-built production image for a2a-server
# Used with Cloud Build: npm install + build runs in step 1, then Docker copies artifacts
FROM docker.io/library/node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 curl git jq ripgrep ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything including pre-installed node_modules and pre-built dist
COPY package.json package-lock.json ./
COPY node_modules/ node_modules/
COPY packages/core/ packages/core/
COPY packages/a2a-server/ packages/a2a-server/

# Create workspace directory for agent operations
RUN mkdir -p /workspace && chown -R node:node /workspace

USER node

ENV CODER_AGENT_WORKSPACE_PATH=/workspace
ENV CODER_AGENT_PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "packages/a2a-server/dist/src/http/server.js"]
