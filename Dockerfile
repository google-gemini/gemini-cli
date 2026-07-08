# ---- Stage 1: Builder ----
FROM docker.io/library/node:20-slim AS builder

# Install git (needed by generate-git-commit-info.js script)
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy only package.json files first for better layer caching
# Dependencies only re-install when package files change, not source files
COPY package*.json ./
COPY packages/cli/package*.json ./packages/cli/
COPY packages/core/package*.json ./packages/core/
COPY packages/vscode-ide-companion/package*.json ./packages/vscode-ide-companion/
COPY packages/vscode-ide-companion/scripts/ ./packages/vscode-ide-companion/scripts/
COPY packages/devtools/package*.json ./packages/devtools/
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/test-utils/package*.json ./packages/test-utils/
COPY packages/a2a-server/package*.json ./packages/a2a-server/

# Use npm ci for consistent, reliable builds (respects package-lock.json)
RUN HUSKY=0 npm ci --ignore-scripts

# Now copy the rest of the source (after install for better caching)
COPY packages/ ./packages/
COPY tsconfig*.json ./
COPY eslint.config.js ./
COPY scripts/ ./scripts/
COPY esbuild.config.js ./

# Pass git commit hash as build arg instead of copying entire .git directory
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# Build and pack artifacts
RUN HUSKY=0 npm run build && \
    npm pack -w packages/core --pack-destination packages/core/dist/ && \
    npm pack -w packages/cli --pack-destination packages/cli/dist/

# ---- Stage 2: Runtime ----
FROM docker.io/library/node:20-slim

ARG SANDBOX_NAME="gemini-cli-sandbox"
ARG CLI_VERSION_ARG
ENV SANDBOX="$SANDBOX_NAME"
ENV CLI_VERSION=$CLI_VERSION_ARG

# install minimal set of packages, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  man-db \
  curl \
  dnsutils \
  less \
  jq \
  bc \
  gh \
  git \
  unzip \
  rsync \
  ripgrep \
  procps \
  psmisc \
  lsof \
  socat \
  ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# set up npm global package folder under /usr/local/share
# give it to non-root user node, already set up in base image
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# switch to non-root user node
USER node

# install gemini-cli and clean up
COPY --chown=node:node packages/cli/dist/google-gemini-cli-*.tgz /tmp/gemini-cli.tgz
COPY --chown=node:node packages/core/dist/google-gemini-cli-core-*.tgz /tmp/gemini-core.tgz
RUN npm install -g /tmp/gemini-core.tgz \
  && npm install -g /tmp/gemini-cli.tgz \
  && node -e "const fs=require('node:fs'); JSON.parse(fs.readFileSync('/usr/local/share/npm-global/lib/node_modules/@google/gemini-cli/package.json','utf8')); JSON.parse(fs.readFileSync('/usr/local/share/npm-global/lib/node_modules/@google/gemini-cli-core/package.json','utf8'));" \
  && gemini --version > /dev/null \
  && npm cache clean --force \
  && rm -f /tmp/gemini-{cli,core}.tgz

# default entrypoint when none specified
ENTRYPOINT ["/usr/local/share/npm-global/bin/gemini"]