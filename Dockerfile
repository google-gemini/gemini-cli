# --- STAGE 1: Base Runtime ---
FROM docker.io/library/node:20-slim AS base

ARG CLI_VERSION_ARG
ENV CLI_VERSION=$CLI_VERSION_ARG

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  curl \
  dnsutils \
  less \
  jq \
  ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# --- STAGE 2: Maintainer (Parent of Sandbox) ---
FROM base AS maintainer

# Install "Maintainer Bloat" - tools needed for development and offloading
RUN apt-get update && apt-get install -y --no-install-recommends \
  make \
  g++ \
  gh \
  git \
  unzip \
  rsync \
  ripgrep \
  procps \
  psmisc \
  lsof \
  socat \
  build-essential \
  libsecret-1-dev \
  libkrb5-dev \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Install global dev tools
RUN npm install -g tsx vitest

# Set up npm global package folder
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# --- STAGE 3: Sandbox (Final CLI Image) ---
FROM maintainer AS sandbox

ARG SANDBOX_NAME="gemini-cli-sandbox"
ENV SANDBOX="$SANDBOX_NAME"

# Switch to non-root user node
USER node

# Install gemini-cli and clean up
COPY packages/cli/dist/google-gemini-cli-*.tgz /tmp/gemini-cli.tgz
COPY packages/core/dist/google-gemini-cli-core-*.tgz /tmp/gemini-core.tgz
RUN npm install -g /tmp/gemini-core.tgz \
  && npm install -g /tmp/gemini-cli.tgz \
  && node -e "const fs=require('node:fs'); JSON.parse(fs.readFileSync('/usr/local/share/npm-global/lib/node_modules/@google/gemini-cli/package.json','utf8')); JSON.parse(fs.readFileSync('/usr/local/share/npm-global/lib/node_modules/@google/gemini-cli-core/package.json','utf8'));" \
  && gemini --version > /dev/null \
  && npm cache clean --force \
  && rm -f /tmp/gemini-{cli,core}.tgz

# Default entrypoint
CMD ["gemini"]
