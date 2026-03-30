# ---- Stage 1: Builder ----
FROM docker.io/library/node:20-slim AS builder

# Install git (needed by generate-git-commit-info.js script)
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy ALL source files needed for build
COPY package*.json ./
COPY packages/ ./packages/
COPY tsconfig*.json ./
COPY eslint.config.js ./
COPY scripts/ ./scripts/
COPY esbuild.config.js ./
COPY .git/ ./.git/

# Skip husky (no need in Docker), install deps and build
RUN HUSKY=0 npm install && \
    HUSKY=0 npm run build && \
    npm pack -w packages/core --pack-destination packages/core/dist/ && \
    npm pack -w packages/cli --pack-destination packages/cli/dist/

# ---- Stage 2: Runtime (original Dockerfile, unchanged) ----
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

# Copy built artifacts from builder stage (no host pre-build needed!)
COPY --from=builder /build/packages/cli/dist/google-gemini-cli-*.tgz /tmp/gemini-cli.tgz
COPY --from=builder /build/packages/core/dist/google-gemini-cli-core-*.tgz /tmp/gemini-core.tgz

# install gemini-cli and clean up
RUN npm install -g /tmp/gemini-core.tgz \
  && npm install -g /tmp/gemini-cli.tgz \
  && node -e "const fs=require('node:fs'); JSON.parse(fs.readFileSync('/usr/local/share/npm-global/lib/node_modules/@google/gemini-cli/package.json','utf8')); JSON.parse(fs.readFileSync('/usr/local/share/npm-global/lib/node_modules/@google/gemini-cli-core/package.json','utf8'));" \
  && gemini --version > /dev/null \
  && npm cache clean --force \
  && rm -f /tmp/gemini-{cli,core}.tgz

# default entrypoint when none specified
ENTRYPOINT ["/usr/local/share/npm-global/bin/gemini"]